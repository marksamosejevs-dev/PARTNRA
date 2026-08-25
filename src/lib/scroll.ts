export const PRICING_ARRIVAL_EVENT = "partnra:pricing-arrival";

export function scrollToHash(hash: string) {
  const id = hash.replace(/^#/, "");
  if (!id || id === "top") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (id === "pricing") {
      window.dispatchEvent(new CustomEvent(PRICING_ARRIVAL_EVENT));
    }
  }
}
