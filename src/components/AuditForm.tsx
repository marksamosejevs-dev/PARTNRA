"use client";

import { FormEvent, useState } from "react";
import { Container } from "./ui/Container";
import { SectionLabel } from "./ui/SectionLabel";
import { Reveal } from "./ui/Reveal";
import { Arrow } from "./ui/Arrow";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidStoreUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return url.hostname.includes(".");
  } catch {
    return false;
  }
}

type State = "idle" | "loading" | "success" | "error";

export function AuditForm() {
  const [storeUrl, setStoreUrl] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [lastSubmitted, setLastSubmitted] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!isValidStoreUrl(storeUrl)) {
      setState("error");
      setErrorMsg("Enter a valid store URL, e.g. yourstore.com");
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setState("error");
      setErrorMsg("Enter a valid work email address.");
      return;
    }

    const key = `${storeUrl.trim().toLowerCase()}|${email.trim().toLowerCase()}`;
    if (state === "success" && key === lastSubmitted) {
      return;
    }

    setState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeUrl, email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setState("error");
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setLastSubmitted(key);
      setState("success");
    } catch {
      setState("error");
      setErrorMsg("Something went wrong. Please try again.");
    }
  }

  return (
    <section id="audit" className="scroll-mt-24 bg-ink py-24 text-paper md:py-36">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <SectionLabel tone="lime" className="justify-center">
              Free competitor partner audit
            </SectionLabel>
          </Reveal>

          <Reveal delay={0.08}>
            <h2 className="font-display mt-6 text-[clamp(2.1rem,6vw,4.4rem)] font-medium leading-[1.03] tracking-tight">
              See who&rsquo;s already selling your competitors.
            </h2>
          </Reveal>

          <Reveal delay={0.16}>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-paper/55">
              Enter your store and Alex will analyse your category and prepare a snapshot
              of potential partner opportunities around competing brands.
            </p>
          </Reveal>

          <Reveal delay={0.24} className="mt-10">
            {state === "success" ? (
              <div className="rounded-3xl border border-lime/25 bg-lime/[0.06] p-8 text-left md:p-10">
                <div className="inline-flex items-center gap-2.5">
                  <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-lime" />
                  <span className="font-mono-label text-xs font-semibold uppercase tracking-[0.16em] text-lime">
                    Alex is on it.
                  </span>
                </div>
                <p className="mt-4 text-lg leading-relaxed text-paper/85">
                  We&rsquo;ll prepare your competitor partner snapshot and send it to the
                  email provided.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="text-left">
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="flex-1">
                    <label className="font-mono-label mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-paper/40">
                      Store URL
                    </label>
                    <input
                      type="text"
                      inputMode="url"
                      placeholder="https://yourstore.com"
                      value={storeUrl}
                      onChange={(e) => setStoreUrl(e.target.value)}
                      className="w-full rounded-full border border-white/15 bg-white/[0.04] px-5 py-3.5 text-sm text-paper placeholder:text-paper/30 outline-none transition-colors focus:border-lime"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="font-mono-label mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-paper/40">
                      Work email
                    </label>
                    <input
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-full border border-white/15 bg-white/[0.04] px-5 py-3.5 text-sm text-paper placeholder:text-paper/30 outline-none transition-colors focus:border-lime"
                    />
                  </div>
                </div>

                {state === "error" && (
                  <p className="mt-3 text-sm text-lime">{errorMsg}</p>
                )}

                <button
                  type="submit"
                  disabled={state === "loading"}
                  className="group mt-5 inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-lime px-8 text-base font-semibold text-ink shadow-[0_0_0_0_rgba(199,255,53,0)] transition-all duration-200 ease-out will-change-transform hover:scale-[1.02] hover:brightness-110 hover:shadow-[0_0_32px_4px_rgba(199,255,53,0.45)] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60 sm:w-auto md:h-16 md:px-10 md:text-lg"
                >
                  {state === "loading" ? "Sending..." : "Find my partners"}
                  {state !== "loading" && (
                    <Arrow className="group-hover:translate-x-1 group-hover:-translate-y-1" />
                  )}
                </button>

                <p className="mt-4 text-sm text-paper/40">
                  Free initial audit. No credit card.
                </p>
              </form>
            )}
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
