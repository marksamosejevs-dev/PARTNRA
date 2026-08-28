import { describe, it, expect } from "vitest";
import { tagOrigin, tallyByOrigin } from "./brandExpansion";
import { SourceItem } from "../discovery/types";

function webItem(i: number): SourceItem {
  return {
    source: "Web",
    platform: "Web",
    title: `result ${i}`,
    url: `https://example-${i}.example/page`,
    profileUrl: null,
    snippet: "affiliate program review",
  };
}

describe("tagOrigin", () => {
  it("sets discoveryOrigin without ever changing the customer-facing source/platform", () => {
    const generic = tagOrigin([webItem(1), webItem(2)], "web-generic");
    const commercial = tagOrigin([webItem(3)], "web-commercial");

    for (const item of [...generic, ...commercial]) {
      // sourcePlatform must remain "Web" for BOTH web-generic and
      // web-commercial after tagging -- discoveryOrigin is an internal
      // sampling-only distinction, never a customer-facing platform label.
      expect(item.source).toBe("Web");
      expect(item.platform).toBe("Web");
    }
    expect(generic.map((i) => i.discoveryOrigin)).toEqual(["web-generic", "web-generic"]);
    expect(commercial.map((i) => i.discoveryOrigin)).toEqual(["web-commercial"]);
  });

  it("does not mutate its input array or its items", () => {
    const input = [webItem(1)];
    const originalSnapshot = { ...input[0] };
    tagOrigin(input, "web-generic");
    expect(input[0]).toEqual(originalSnapshot);
    expect(input[0].discoveryOrigin).toBeUndefined();
  });
});

describe("tallyByOrigin", () => {
  it("counts by discoveryOrigin, falling back to source when absent", () => {
    const tagged = [...tagOrigin([webItem(1), webItem(2)], "web-generic"), ...tagOrigin([webItem(3)], "web-commercial")];
    expect(tallyByOrigin(tagged)).toEqual({ "web-generic": 2, "web-commercial": 1 });
    expect(tallyByOrigin([webItem(1)])).toEqual({ Web: 1 });
  });
});
