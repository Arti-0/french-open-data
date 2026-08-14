import { afterEach, describe, expect, test } from "bun:test";
import { fetchJson, fetchWithTimeout, OpenDataError } from "../src/http";
import {
  hangUntilAborted,
  installMockFetch,
  jsonResponse,
  type MockedFetch,
} from "./helpers";

let mocked: MockedFetch | null = null;
afterEach(() => {
  mocked?.restore();
  mocked = null;
});

describe("fetchJson", () => {
  test("returns the parsed JSON body and sends an accept header", async () => {
    mocked = installMockFetch(() => jsonResponse({ hello: "world" }));
    const body = await fetchJson<{ hello: string }>("https://example.test/x");
    expect(body).toEqual({ hello: "world" });
    const headers = mocked.calls[0]?.init?.headers as Record<string, string>;
    expect(headers.accept).toBe("application/json");
  });

  test("throws OpenDataError carrying the HTTP status on non-2xx", async () => {
    mocked = installMockFetch(() => jsonResponse({ error: "nope" }, 503));
    const err = await fetchJson("https://example.test/x").catch((e) => e);
    expect(err).toBeInstanceOf(OpenDataError);
    expect((err as OpenDataError).status).toBe(503);
    expect((err as OpenDataError).message).toContain("503");
  });

  test("throws OpenDataError without status on timeout abort", async () => {
    mocked = installMockFetch(hangUntilAborted);
    const err = await fetchJson("https://example.test/slow", {
      timeoutMs: 20,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(OpenDataError);
    expect((err as OpenDataError).status).toBeUndefined();
    expect((err as OpenDataError).message).toContain("timed out");
  });

  test("wraps network failures in OpenDataError without status", async () => {
    mocked = installMockFetch(() => {
      throw new TypeError("fetch failed");
    });
    const err = await fetchJson("https://example.test/down").catch((e) => e);
    expect(err).toBeInstanceOf(OpenDataError);
    expect((err as OpenDataError).status).toBeUndefined();
    expect((err as OpenDataError).message).toContain("fetch failed");
  });
});

describe("fetchWithTimeout", () => {
  test("returns the raw response without inspecting the status", async () => {
    mocked = installMockFetch(() => new Response(null, { status: 204 }));
    const res = await fetchWithTimeout("https://example.test/empty");
    expect(res.status).toBe(204);
  });

  test("aborts via its own AbortController on timeout", async () => {
    mocked = installMockFetch(hangUntilAborted);
    const err = await fetchWithTimeout("https://example.test/slow", {
      timeoutMs: 20,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(OpenDataError);
    expect((err as OpenDataError).message).toContain("timed out");
  });
});
