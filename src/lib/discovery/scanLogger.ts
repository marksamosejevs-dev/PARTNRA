/**
 * Structured, secret-free stage timing for one scan request. Written to
 * stdout as one JSON object per line so it shows up in Netlify's function
 * logs -- this sandbox has no access to those logs itself, so this exists
 * for whoever does to pinpoint exactly which stage is slow in a real
 * deployment, without needing to reproduce the issue by hand.
 */
export interface ScanLogger {
  mark(stage: string, meta?: Record<string, unknown>): void;
  fail(stage: string, err: unknown, meta?: Record<string, unknown>): void;
}

function describeError(err: unknown): { errorType: string; message: string; httpStatus?: number } {
  if (err instanceof Error) {
    const httpStatus = extractHttpStatus(err.message);
    return { errorType: err.constructor.name, message: err.message, ...(httpStatus ? { httpStatus } : {}) };
  }
  return { errorType: typeof err, message: String(err) };
}

/** Several provider errors embed the HTTP status in their message (e.g. "... returned 429"). */
function extractHttpStatus(message: string): number | undefined {
  const match = message.match(/returned (\d{3})/);
  return match ? Number(match[1]) : undefined;
}

export function createScanLogger(requestId: string): ScanLogger {
  const start = Date.now();
  return {
    mark(stage, meta) {
      console.log(
        JSON.stringify({ scan: requestId, stage, elapsedMs: Date.now() - start, ...meta })
      );
    },
    fail(stage, err, meta) {
      console.log(
        JSON.stringify({
          scan: requestId,
          stage,
          elapsedMs: Date.now() - start,
          ...describeError(err),
          ...meta,
        })
      );
    },
  };
}
