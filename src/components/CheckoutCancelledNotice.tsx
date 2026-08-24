"use client";

import { useEffect, useState } from "react";

export function CheckoutCancelledNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "cancelled") return;

    // The query param only exists post-hydration (it comes from Stripe's
    // redirect, never from the server render), so this can't be a lazy
    // useState initializer without risking a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);
    params.delete("checkout");
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
    window.history.replaceState(null, "", newUrl);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[90] flex justify-center px-4 pt-4">
      <div className="flex items-center gap-4 rounded-full border border-ink/10 bg-paper px-5 py-3 shadow-[0_12px_32px_-12px_rgba(10,10,10,0.25)]">
        <span className="text-sm font-medium text-ink/70">Checkout cancelled. No charge was made.</span>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Dismiss"
          className="text-ink/40 transition-colors hover:text-ink"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </div>
  );
}
