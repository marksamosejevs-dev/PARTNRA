export class ApifyProviderError extends Error {}

/**
 * Runs an Apify Actor synchronously and returns its dataset items in one
 * call — avoids a separate start-run / poll / fetch-dataset dance.
 */
export async function runApifyActor(
  actorId: string,
  input: unknown,
  token: string,
  signal: AbortSignal
): Promise<unknown[]> {
  const path = actorId.replace("/", "~");
  const url = `https://api.apify.com/v2/acts/${path}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });

  if (!res.ok) {
    throw new ApifyProviderError(`Apify actor ${actorId} returned ${res.status}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
