/**
 * A single slow external call must never take the rest of the scan down with
 * it. `raceWithTimeout` runs `task` against its own bounded AbortSignal and
 * rejects with `StageTimeoutError` if it hasn't settled by `ms` -- instead of
 * the old pattern of sharing one AbortController across every call in the
 * pipeline, where any one hang (in practice, Apify's synchronous actor-run
 * endpoint) aborted everything else too, including work that had already
 * succeeded.
 */
export class StageTimeoutError extends Error {}

export function raceWithTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string,
  parentSignal?: AbortSignal
): Promise<T> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  parentSignal?.addEventListener("abort", forwardAbort, { once: true });

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new StageTimeoutError(`${label} timed out after ${ms}ms`));
    }, ms);

    task(controller.signal).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    ).finally(() => {
      parentSignal?.removeEventListener("abort", forwardAbort);
    });
  });
}

/**
 * For genuinely optional work (an individual source, one candidate's contact
 * enrichment): never let it reject the caller. Timing out or failing simply
 * yields `fallback` -- exactly the same "unconfigured or failing is not
 * fatal" contract these already document, now also covering "too slow."
 */
export async function withFallback<T>(
  task: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string,
  fallback: T
): Promise<T> {
  try {
    return await raceWithTimeout(task, ms, label);
  } catch {
    return fallback;
  }
}

/**
 * Node's `dns.lookup` (and a few other Node APIs) predates AbortSignal
 * support entirely, so it can't be wrapped by `raceWithTimeout` above. This
 * races an arbitrary promise against a plain timer instead -- the
 * underlying lookup keeps running in the background if the timer wins
 * (harmless for a DNS query), but the caller is never left waiting on it
 * unbounded, which the DNS checks in `route.ts` previously did.
 */
export function raceValueWithTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new StageTimeoutError(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
