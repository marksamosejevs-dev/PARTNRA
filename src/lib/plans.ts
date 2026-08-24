export type PlanKey = "starter" | "growth" | "pro";

export interface PlanSummary {
  key: PlanKey;
  name: string;
  price: string;
  tagline: string;
  highlighted?: boolean;
}

export const PLAN_SUMMARIES: PlanSummary[] = [
  {
    key: "starter",
    name: "Starter",
    price: "$49",
    tagline: "For small brands starting affiliate discovery.",
  },
  {
    key: "growth",
    name: "Growth",
    price: "$99",
    tagline: "For growing e-commerce brands actively recruiting affiliates.",
    highlighted: true,
  },
  {
    key: "pro",
    name: "Pro",
    price: "$199",
    tagline: "For brands and teams running affiliate acquisition at scale.",
  },
];

export function isPlanKey(value: unknown): value is PlanKey {
  return value === "starter" || value === "growth" || value === "pro";
}
