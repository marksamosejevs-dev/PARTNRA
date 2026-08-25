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

type CookieCategory = "analytics" | "functional" | "marketing";

interface ConsentState {
  necessary: true;
  analytics: boolean;
  functional: boolean;
  marketing: boolean;
}

const STORAGE_KEY = "partnra_cookie_consent";

const DEFAULT_DRAFT: ConsentState = {
  necessary: true,
  analytics: false,
  functional: false,
  marketing: false,
};

function readStoredConsent(): ConsentState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      necessary: true,
      analytics: Boolean(parsed.analytics),
      functional: Boolean(parsed.functional),
      marketing: Boolean(parsed.marketing),
    };
  } catch {
    return null;
  }
}

function writeStoredConsent(consent: ConsentState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  } catch {
    // localStorage unavailable (private mode, disabled storage) -- the
    // banner will simply reappear next visit, which is an acceptable fallback.
  }
}

const CATEGORY_INFO: { key: CookieCategory; label: string; description: string }[] = [
  {
    key: "analytics",
    label: "Analytics",
    description: "Would help us understand how visitors use the site. Not currently in use.",
  },
  {
    key: "functional",
    label: "Functional",
    description: "Would remember optional preferences beyond your cookie choice. Not currently in use.",
  },
  {
    key: "marketing",
    label: "Marketing",
    description: "Would personalise ads or measure campaigns. Not currently in use.",
  },
];

interface CookieConsentContextValue {
  openPreferences: () => void;
}

const CookieConsentContext = createContext<CookieConsentContextValue | null>(null);

export function useCookieConsent(): CookieConsentContextValue {
  const ctx = useContext(CookieConsentContext);
  if (!ctx) {
    throw new Error("useCookieConsent must be used within a CookieConsentProvider");
  }
  return ctx;
}

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [draft, setDraft] = useState<ConsentState>(DEFAULT_DRAFT);
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // localStorage only exists client-side, so this can't be a lazy useState
    // initializer without causing an SSR/hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConsent(readStoredConsent());
    setHydrated(true);
  }, []);

  const restoreFocus = useCallback(() => {
    const trigger = lastFocused.current;
    if (trigger && trigger.isConnected) {
      trigger.focus();
      return;
    }
    // The element that opened the panel/banner may have been unmounted
    // (e.g. the banner itself disappears once consent is given) -- fall
    // back to the persistent "Cookie settings" reopener in the footer
    // so keyboard focus always lands somewhere meaningful.
    document.getElementById("cookie-settings-trigger")?.focus();
  }, []);

  const persist = useCallback(
    (next: ConsentState) => {
      setConsent(next);
      writeStoredConsent(next);
      setPanelOpen(false);
      restoreFocus();
    },
    [restoreFocus]
  );

  const acceptAll = useCallback(() => {
    persist({ necessary: true, analytics: true, functional: true, marketing: true });
  }, [persist]);

  const rejectNonEssential = useCallback(() => {
    persist({ necessary: true, analytics: false, functional: false, marketing: false });
  }, [persist]);

  const openPreferences = useCallback(() => {
    lastFocused.current = document.activeElement as HTMLElement | null;
    setDraft(consent ?? DEFAULT_DRAFT);
    setPanelOpen(true);
  }, [consent]);

  const closePreferences = useCallback(() => {
    setPanelOpen(false);
    restoreFocus();
  }, [restoreFocus]);

  const savePreferences = useCallback(() => {
    persist(draft);
  }, [draft, persist]);

  useEffect(() => {
    if (!panelOpen) return;

    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closePreferences();
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
  }, [panelOpen, closePreferences]);

  const bannerVisible = hydrated && consent === null && !panelOpen;

  return (
    <CookieConsentContext.Provider value={{ openPreferences }}>
      {children}

      {bannerVisible && (
        <div
          role="region"
          aria-label="Cookie notice"
          className="fixed inset-x-0 bottom-0 z-[90] border-t border-ink/10 bg-paper/95 p-5 backdrop-blur-md md:p-6"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <p className="max-w-2xl text-sm leading-relaxed text-ink/70">
              We use strictly necessary cookies to run PARTNRA, including secure checkout. With
              your consent we&rsquo;d also use optional cookies for analytics, functionality and
              marketing &mdash; see our{" "}
              <a href="/legal/cookies" className="underline underline-offset-2 hover:text-ink">
                Cookie Policy
              </a>
              .
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={rejectNonEssential}
                className="rounded-full border border-ink/15 px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-ink/30"
              >
                Reject non-essential
              </button>
              <button
                type="button"
                onClick={openPreferences}
                className="rounded-full border border-ink/15 px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-ink/30"
              >
                Manage cookies
              </button>
              <button
                type="button"
                onClick={acceptAll}
                className="rounded-full bg-lime px-6 py-2.5 text-sm font-semibold text-ink transition-all hover:brightness-110"
              >
                Accept all
              </button>
            </div>
          </div>
        </div>
      )}

      {panelOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-ink/70 p-4 py-10 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closePreferences();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-preferences-title"
            tabIndex={-1}
            className="relative w-full max-w-lg rounded-3xl border border-ink/10 bg-paper p-6 outline-none md:p-8"
          >
            <button
              type="button"
              onClick={closePreferences}
              aria-label="Close"
              className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 text-ink transition-colors hover:border-ink/30"
            >
              <span aria-hidden="true" className="text-lg leading-none">
                ×
              </span>
            </button>

            <div className="font-mono-label text-xs font-semibold uppercase tracking-[0.18em] text-ink/40">
              Cookie preferences
            </div>
            <h2
              id="cookie-preferences-title"
              className="font-display mt-3 text-[clamp(1.4rem,3.2vw,1.9rem)] font-medium tracking-tight text-ink"
            >
              Manage cookies
            </h2>
            <p className="mt-2 text-sm text-ink/55">
              Choose which optional cookies PARTNRA can use. You can change this at any time from
              the &ldquo;Cookie settings&rdquo; link in the footer.
            </p>

            <div className="mt-6 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4 rounded-2xl border border-ink/10 bg-surface/40 p-4">
                <div>
                  <div className="text-sm font-semibold text-ink">Strictly necessary</div>
                  <p className="mt-1 text-xs text-ink/55">
                    Required for the site and checkout to work. Always on.
                  </p>
                </div>
                <span className="mt-0.5 shrink-0 rounded-full bg-ink/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink/50">
                  Always on
                </span>
              </div>

              {CATEGORY_INFO.map((cat) => {
                const checked = draft[cat.key];
                return (
                  <label
                    key={cat.key}
                    className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-ink/10 p-4"
                  >
                    <div>
                      <div className="text-sm font-semibold text-ink">{cat.label}</div>
                      <p className="mt-1 text-xs text-ink/55">{cat.description}</p>
                    </div>
                    <span className="relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [cat.key]: e.target.checked }))
                        }
                        className="peer sr-only"
                      />
                      <span
                        className={clsx(
                          "absolute inset-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ink/40",
                          checked ? "bg-lime" : "bg-ink/15"
                        )}
                      />
                      <span
                        className={clsx(
                          "relative h-5 w-5 rounded-full bg-paper shadow transition-transform",
                          checked ? "translate-x-[22px]" : "translate-x-0.5"
                        )}
                      />
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={rejectNonEssential}
                className="rounded-full border border-ink/15 px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-ink/30"
              >
                Reject non-essential
              </button>
              <button
                type="button"
                onClick={savePreferences}
                className="rounded-full bg-lime px-6 py-2.5 text-sm font-semibold text-ink transition-all hover:brightness-110"
              >
                Save preferences
              </button>
            </div>
          </div>
        </div>
      )}
    </CookieConsentContext.Provider>
  );
}
