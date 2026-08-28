import { describe, it, expect } from "vitest";
import { sampleAcrossSources } from "./classify";
import { SourceItem } from "./types";

function items(source: SourceItem["source"], count: number, discoveryOrigin?: string, urlPrefix: string = source): SourceItem[] {
  return Array.from({ length: count }, (_, i) => ({
    source,
    platform: source,
    title: `${source} ${i}`,
    url: `https://${urlPrefix.toLowerCase()}-${discoveryOrigin ?? "x"}-${i}.example/page`,
    profileUrl: null,
    snippet: "affiliate program review commission",
    discoveryOrigin,
  }));
}

function tally(pool: SourceItem[]): Record<string, number> {
  const t: Record<string, number> = {};
  for (const i of pool) t[i.discoveryOrigin ?? i.source] = (t[i.discoveryOrigin ?? i.source] ?? 0) + 1;
  return t;
}

describe("sampleAcrossSources", () => {
  it("reproduces the exact diagnosed scenario: two Web query strategies each get a fair share instead of one starving the other", () => {
    // Merge order matches brandExpansion.ts exactly: web-generic, openai, youtube, web-commercial.
    const pool = [
      ...items("Web", 10, "web-generic"),
      ...items("OpenAI", 4, "openai"),
      ...items("YouTube", 4, "youtube"),
      ...items("Web", 10, "web-commercial", "Web2"),
    ];
    const sent = sampleAcrossSources(pool, 15);
    const overflow = pool.filter((i) => !sent.includes(i));

    expect(sent).toHaveLength(15);
    const sentByOrigin = tally(sent);
    const overflowByOrigin = tally(overflow);

    // Old (pre-fix) behavior grouped both Web strategies into one collapsed
    // "Web" bucket -- because web-generic's items are always encountered
    // first in the merge order, ALL 7 of the old code's Web slots went to
    // web-generic and web-commercial got systematically ZERO, regardless of
    // its own evidence quality. The fix's whole point is that this can never
    // happen again: web-commercial must get a real, non-zero, comparable
    // share to web-generic.
    expect(sentByOrigin["web-commercial"]).toBeGreaterThan(0);
    expect(Math.abs((sentByOrigin["web-generic"] ?? 0) - (sentByOrigin["web-commercial"] ?? 0))).toBeLessThanOrEqual(1);
    // YouTube/OpenAI (one strategy each) still get their full fair share.
    expect(sentByOrigin.youtube).toBe(4);
    expect(sentByOrigin.openai).toBe(4);
    expect(overflowByOrigin["web-commercial"]).toBeGreaterThan(0);
  });

  it("never starves a small origin just because another origin dominates candidate volume", () => {
    const pool = [...items("Web", 27, "web-generic"), ...items("Web", 1, "web-commercial", "W2"), ...items("YouTube", 1, "youtube"), ...items("OpenAI", 1, "openai")];
    const sent = tally(sampleAcrossSources(pool, 15));
    expect(sent["web-commercial"]).toBe(1);
    expect(sent.youtube).toBe(1);
    expect(sent.openai).toBe(1);
  });

  it("degrades to a plain prefix slice when only one origin is available", () => {
    const pool = items("Web", 22, "web-generic");
    const sent = sampleAcrossSources(pool, 15);
    expect(sent).toHaveLength(15);
    expect(sent.every((i) => i.discoveryOrigin === "web-generic")).toBe(true);
  });

  it("sends everything when the pool is smaller than the budget", () => {
    const pool = [...items("Web", 5, "web-generic"), ...items("Web", 4, "web-commercial", "W2"), ...items("YouTube", 2, "youtube"), ...items("OpenAI", 1, "openai")];
    expect(pool).toHaveLength(12);
    expect(sampleAcrossSources(pool, 15)).toHaveLength(12);
  });

  it("sends everything when the pool exactly equals the budget", () => {
    const pool = [...items("Web", 5, "web-generic"), ...items("Web", 5, "web-commercial", "W2"), ...items("YouTube", 3, "youtube"), ...items("OpenAI", 2, "openai")];
    expect(pool).toHaveLength(15);
    expect(sampleAcrossSources(pool, 15)).toHaveLength(15);
  });

  it("caps at the budget when the pool exceeds it", () => {
    const pool = [...items("Web", 8, "web-generic"), ...items("Web", 8, "web-commercial", "W2"), ...items("YouTube", 4, "youtube"), ...items("OpenAI", 4, "openai")];
    expect(pool.length).toBeGreaterThan(15);
    expect(sampleAcrossSources(pool, 15)).toHaveLength(15);
  });

  it("is deterministic -- same input always produces the same output, in the same order", () => {
    const pool = [...items("Web", 6, "web-generic"), ...items("Web", 6, "web-commercial", "W2"), ...items("YouTube", 3, "youtube")];
    const run1 = sampleAcrossSources(pool, 10).map((i) => i.url);
    const run2 = sampleAcrossSources(pool, 10).map((i) => i.url);
    expect(run1).toEqual(run2);
  });

  it("falls back to grouping by `source` when discoveryOrigin is absent -- Quick Scan's own SourceItems never set it, so its sampling behavior is unchanged", () => {
    const pool = [...items("Web", 20), ...items("YouTube", 4), ...items("OpenAI", 4)];
    expect(pool.every((i) => i.discoveryOrigin === undefined)).toBe(true);
    const sent = sampleAcrossSources(pool, 15);
    const byOrigin = tally(sent);
    expect(byOrigin.Web).toBe(7);
    expect(byOrigin.YouTube).toBe(4);
    expect(byOrigin.OpenAI).toBe(4);
  });

  it("retry/idempotency: calling sampleAcrossSources again on the identical pool (simulating a stale-job-recovery replay) yields the identical selection", () => {
    const pool = [...items("Web", 12, "web-generic"), ...items("Web", 9, "web-commercial", "W2"), ...items("YouTube", 4, "youtube"), ...items("OpenAI", 4, "openai")];
    const first = sampleAcrossSources(pool, 15);
    const replay = sampleAcrossSources(pool, 15);
    expect(replay.map((i) => i.url)).toEqual(first.map((i) => i.url));
  });
});
