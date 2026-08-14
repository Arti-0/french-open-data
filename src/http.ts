/**
 * Small fetch core shared by all clients: every request carries a bounded
 * timeout (AbortController) and every failure surfaces as a typed
 * {@link OpenDataError} instead of a bare TypeError or AbortError.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The single error type thrown by this library.
 *
 * `status` is set when the upstream API answered with a non-2xx HTTP status;
 * it is undefined for network failures and timeouts.
 */
export class OpenDataError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OpenDataError";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: URLSearchParams | string;
  /** Hard deadline for the whole request (default 10 000 ms). */
  timeoutMs?: number;
}

/**
 * `fetch` with a hard deadline. Resolves with the raw `Response` (status not
 * inspected — callers that need 204/206 semantics handle them themselves).
 * Rejects with {@link OpenDataError} on timeout or network failure.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestOptions = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    return await fetch(url, {
      method: options.method ?? "GET",
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new OpenDataError(`Request timed out: ${url}`);
    }
    throw new OpenDataError(
      `Request failed: ${url} (${err instanceof Error ? err.message : String(err)})`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * JSON convenience wrapper: sends `accept: application/json`, throws a typed
 * {@link OpenDataError} carrying the HTTP status on any non-2xx response, and
 * returns the parsed body typed as `T`.
 */
export async function fetchJson<T>(
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  const res = await fetchWithTimeout(url, {
    ...options,
    headers: { accept: "application/json", ...options.headers },
  });
  if (!res.ok) {
    throw new OpenDataError(`${url} responded ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}
