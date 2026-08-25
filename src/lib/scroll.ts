export const PRICING_ARRIVAL_EVENT = "partnra:pricing-arrival";

/**
 * Frames the pricing section so the heading, all three plans and their
 * action buttons are visible as completely as the viewport allows, instead
 * of the default scrollIntoView("start") which puts the section flush at
 * y=0 -- hiding the first ~80-96px (the "Pricing" heading) behind the fixed
 * header. When the whole section fits below the header, centers it in the
 * remaining space so the buttons land in view alongside the heading. When
 * it's taller than the available space, aligns it just below the header
 * (heading never hidden) rather than centering, which would otherwise clip
 * the heading above the header to chase the buttons into view.
 */
function scrollToPricing(el: HTMLElement) {
  const header = document.querySelector("header");
  const headerHeight = header instanceof HTMLElement ? header.getBoundingClientRect().height : 0;
  const margin = 16;
  const availableHeight = window.innerHeight - headerHeight - margin;

  // Anchor on the "Pricing" eyebrow rather than the section's own outer
  // edge -- the section carries generous top padding (py-24/py-36) before
  // any real content starts, and framing against that padding would waste
  // a large chunk of the viewport that could otherwise show more of the
  // cards and their buttons.
  const anchor = el.querySelector<HTMLElement>(".font-mono-label") ?? el;
  const anchorTop = anchor.getBoundingClientRect().top;
  const sectionBottom = el.getBoundingClientRect().bottom;
  const contentHeight = sectionBottom - anchorTop;

  const desiredAnchorTopInViewport =
    contentHeight <= availableHeight
      ? headerHeight + margin + (availableHeight - contentHeight) / 2
      : headerHeight + margin;

  const targetScrollTop = window.scrollY + anchorTop - desiredAnchorTopInViewport;

  window.scrollTo({ top: Math.max(targetScrollTop, 0), behavior: "smooth" });
}

export function scrollToHash(hash: string) {
  const id = hash.replace(/^#/, "");
  if (!id || id === "top") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const el = document.getElementById(id);
  if (el) {
    if (id === "pricing") {
      scrollToPricing(el);
      window.dispatchEvent(new CustomEvent(PRICING_ARRIVAL_EVENT));
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}
