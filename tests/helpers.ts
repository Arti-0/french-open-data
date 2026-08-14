/** Test helpers: mock `globalThis.fetch` and record every call. */

export interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

export type FetchHandler = (
  url: string,
  init?: RequestInit,
) => Response | Promise<Response>;

export interface MockedFetch {
  calls: FetchCall[];
  restore: () => void;
}

/** Replace global fetch with `handler`; returns recorded calls + restore(). */
export function installMockFetch(handler: FetchHandler): MockedFetch {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A handler that never resolves — it only rejects when the signal aborts. */
export const hangUntilAborted: FetchHandler = (_url, init) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(new DOMException("The operation was aborted.", "AbortError")),
    );
  });

/** Query params of the given recorded call, as a URLSearchParams. */
export function queryOf(call: FetchCall): URLSearchParams {
  return new URL(call.url).searchParams;
}
