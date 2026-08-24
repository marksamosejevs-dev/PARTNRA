"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import clsx from "clsx";
import { PLAN_SUMMARIES, PlanKey } from "@/lib/plans";
import { Arrow } from "./ui/Arrow";

interface PlanSelectorContextValue {
  open: (initialPlan?: PlanKey) => void;
}

const PlanSelectorContext = createContext<PlanSelectorContextValue | null>(null);

export function usePlanSelector(): PlanSelectorContextValue {
  const ctx = useContext(PlanSelectorContext);
  if (!ctx) {
    throw new Error("usePlanSelector must be used within a PlanSelectorProvider");
  }
  return ctx;
}

type CheckoutState = "idle" | "loading" | "error";

export function PlanSelectorProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<PlanKey>("growth");
  const [checkoutState, setCheckoutState] = useState<CheckoutState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  const open = useCallback((initialPlan?: PlanKey) => {
    lastFocused.current = document.activeElement as HTMLElement | null;
    if (initialPlan) setSelected(initialPlan);
    setCheckoutState("idle");
    setErrorMessage("");
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    lastFocused.current?.focus?.();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;

      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, close]);

  async function handleContinue() {
    setCheckoutState("loading");
    setErrorMessage("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selected }),
      });
      const data = await res.json();

      if (!res.ok || !data.url) {
        setCheckoutState("error");
        setErrorMessage(data.error ?? "We couldn't start checkout right now. Please try again.");
        return;
      }

      window.location.href = data.url;
    } catch {
      setCheckoutState("error");
      setErrorMessage("We couldn't start checkout right now. Please try again.");
    }
  }

  return (
    <PlanSelectorContext.Provider value={{ open }}>
      {children}

      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-ink/70 p-4 py-10 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-selector-title"
            tabIndex={-1}
            className="relative w-full max-w-3xl rounded-3xl border border-ink/10 bg-paper p-6 outline-none md:p-10"
          >
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 text-ink transition-colors hover:border-ink/30"
            >
              <span aria-hidden="true" className="text-lg leading-none">
                ×
              </span>
            </button>

            <div className="font-mono-label text-xs font-semibold uppercase tracking-[0.18em] text-ink/40">
              Choose your plan
            </div>
            <h2
              id="plan-selector-title"
              className="font-display mt-3 text-[clamp(1.6rem,4vw,2.4rem)] font-medium tracking-tight text-ink"
            >
              Subscribe to PARTNRA.
            </h2>

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {PLAN_SUMMARIES.map((plan) => {
                const isSelected = selected === plan.key;
                return (
                  <button
                    key={plan.key}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelected(plan.key)}
                    className={clsx(
                      "relative flex flex-col rounded-2xl border p-5 text-left transition-all duration-200",
                      isSelected
                        ? "border-ink bg-ink text-paper"
                        : "border-ink/10 bg-surface/40 text-ink hover:border-ink/25"
                    )}
                  >
                    {plan.highlighted && (
                      <span
                        className={clsx(
                          "font-mono-label mb-2 w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]",
                          isSelected ? "bg-lime text-ink" : "bg-lime/20 text-ink/70"
                        )}
                      >
                        Most popular
                      </span>
                    )}
                    <span className="font-mono-label text-xs font-semibold uppercase tracking-[0.14em] opacity-60">
                      {plan.name}
                    </span>
                    <span className="font-display mt-2 text-3xl font-medium tracking-tight">
                      {plan.price}
                      <span className="text-sm font-normal opacity-50"> / month</span>
                    </span>
                    <span className={clsx("mt-2 text-xs leading-relaxed", isSelected ? "text-paper/60" : "text-ink/50")}>
                      {plan.tagline}
                    </span>
                  </button>
                );
              })}
            </div>

            {checkoutState === "error" && (
              <p className="mt-6 text-sm text-ink/70">{errorMessage}</p>
            )}

            <div className="mt-8 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={handleContinue}
                disabled={checkoutState === "loading"}
                className="group inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-lime px-8 text-base font-semibold text-ink shadow-[0_0_0_0_rgba(199,255,53,0)] transition-all duration-200 ease-out hover:scale-[1.01] hover:brightness-110 hover:shadow-[0_0_32px_4px_rgba(199,255,53,0.45)] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60 sm:w-auto md:px-12"
              >
                {checkoutState === "loading" ? "Redirecting to checkout..." : "Continue to checkout"}
                {checkoutState !== "loading" && (
                  <Arrow className="group-hover:translate-x-1 group-hover:-translate-y-1" />
                )}
              </button>
              <p className="text-center text-xs text-ink/40">Billed monthly. Cancel anytime.</p>
            </div>
          </div>
        </div>
      )}
    </PlanSelectorContext.Provider>
  );
}
