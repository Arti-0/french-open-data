import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { FranceTravailClient } from "../src/france-travail";
import { OpenDataError } from "../src/http";
import {
  installMockFetch,
  jsonResponse,
  queryOf,
  type FetchHandler,
  type MockedFetch,
} from "./helpers";

const TOKEN_HOST = "https://entreprise.francetravail.fr/";
const SEARCH_HOST = "https://api.francetravail.io/";

let mocked: MockedFetch | null = null;
afterEach(() => {
  mocked?.restore();
  mocked = null;
  setSystemTime(); // restore real clock
});

const client = () =>
  new FranceTravailClient({ clientId: "id-123", clientSecret: "secret-456" });

const rawOffer = (id: string) => ({
  id,
  intitule: `Offer ${id}`,
  entreprise: { nom: "EXEMPLE SAS", siret: "55203253400041" },
  lieuTravail: { libelle: "Bordeaux", codePostal: "33000" },
  typeContrat: "CDI",
  dateCreation: "2026-02-01T08:00:00Z",
  origineOffre: { urlOrigine: "https://example.test/offer" },
});

/** Handler answering both the token endpoint and the search endpoint. */
function apiHandler(options?: {
  expiresIn?: number;
  searchStatus?: number;
  results?: unknown[];
}): FetchHandler {
  let tokenCount = 0;
  return (url) => {
    if (url.startsWith(TOKEN_HOST)) {
      tokenCount++;
      return jsonResponse({
        access_token: `token-${tokenCount}`,
        expires_in: options?.expiresIn ?? 1490,
      });
    }
    const status = options?.searchStatus ?? 200;
    if (status === 204) return new Response(null, { status: 204 });
    return jsonResponse(
      { resultats: options?.results ?? [rawOffer("A1")] },
      status,
    );
  };
}

const tokenCalls = () =>
  mocked!.calls.filter((c) => c.url.startsWith(TOKEN_HOST));
const searchCalls = () =>
  mocked!.calls.filter((c) => c.url.startsWith(SEARCH_HOST));

describe("constructor", () => {
  test("rejects missing credentials", () => {
    expect(
      () => new FranceTravailClient({ clientId: "", clientSecret: "x" }),
    ).toThrow(OpenDataError);
    expect(
      () => new FranceTravailClient({ clientId: "x", clientSecret: "" }),
    ).toThrow(OpenDataError);
  });
});

describe("OAuth token handling", () => {
  test("requests a client-credentials token with the configured secret", async () => {
    mocked = installMockFetch(apiHandler());
    await client().searchOffers();

    const token = tokenCalls()[0]!;
    expect(token.init?.method).toBe("POST");
    const form = new URLSearchParams(String(token.init?.body));
    expect(form.get("grant_type")).toBe("client_credentials");
    expect(form.get("client_id")).toBe("id-123");
    expect(form.get("client_secret")).toBe("secret-456");
    expect(form.get("scope")).toBe("api_offresdemploiv2 o2dsoffre");

    const search = searchCalls()[0]!;
    const headers = search.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer token-1");
  });

  test("reuses the cached token across searches", async () => {
    mocked = installMockFetch(apiHandler());
    const c = client();
    await c.searchOffers();
    await c.searchOffers();
    expect(tokenCalls()).toHaveLength(1);
    expect(searchCalls()).toHaveLength(2);
  });

  test("keeps the token until 60 s before its announced expiry", async () => {
    const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);
    setSystemTime(new Date(t0));
    mocked = installMockFetch(apiHandler({ expiresIn: 120 }));
    const c = client();

    await c.searchOffers();
    // 59 s in: within expiry (120 s) minus margin (60 s) → still cached.
    setSystemTime(new Date(t0 + 59_000));
    await c.searchOffers();
    expect(tokenCalls()).toHaveLength(1);

    // 61 s in: past the safety margin → re-authenticates.
    setSystemTime(new Date(t0 + 61_000));
    await c.searchOffers();
    expect(tokenCalls()).toHaveLength(2);

    const lastSearch = searchCalls()[2]!;
    const headers = lastSearch.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer token-2");
  });

  test("token caches are per instance, not shared", async () => {
    mocked = installMockFetch(apiHandler());
    await client().searchOffers();
    await client().searchOffers();
    expect(tokenCalls()).toHaveLength(2);
  });

  test("surfaces OAuth failures as OpenDataError with the status", async () => {
    mocked = installMockFetch((url) => {
      if (url.startsWith(TOKEN_HOST)) return jsonResponse({}, 401);
      throw new Error("search should not be reached");
    });
    const err = await client()
      .searchOffers()
      .catch((e) => e);
    expect(err).toBeInstanceOf(OpenDataError);
    expect((err as OpenDataError).status).toBe(401);
  });
});

describe("searchOffers", () => {
  test("serializes keywords, department, commune and the range", async () => {
    mocked = installMockFetch(apiHandler());
    await client().searchOffers({
      keywords: "développeur web",
      department: "33",
      commune: "33063",
      maxResults: 50,
    });

    const qs = queryOf(searchCalls()[0]!);
    expect(qs.get("motsCles")).toBe("développeur web");
    expect(qs.get("departement")).toBe("33");
    expect(qs.get("commune")).toBe("33063");
    expect(qs.get("range")).toBe("0-49");
  });

  test("defaults to range 0-19 and caps maxResults at 100", async () => {
    mocked = installMockFetch(apiHandler());
    const c = client();
    await c.searchOffers();
    expect(queryOf(searchCalls()[0]!).get("range")).toBe("0-19");
    await c.searchOffers({ maxResults: 5000 });
    expect(queryOf(searchCalls()[1]!).get("range")).toBe("0-99");
  });

  test("treats 204 as an empty result, not an error", async () => {
    mocked = installMockFetch(apiHandler({ searchStatus: 204 }));
    const result = await client().searchOffers({ keywords: "introuvable" });
    expect(result).toEqual({ offers: [], total: 0 });
  });

  test("parses 206 partial content as a normal page", async () => {
    mocked = installMockFetch(
      apiHandler({ searchStatus: 206, results: [rawOffer("A1"), rawOffer("A2")] }),
    );
    const result = await client().searchOffers();
    expect(result.total).toBe(2);
    expect(result.offers.map((o) => o.id)).toEqual(["A1", "A2"]);
  });

  test("throws OpenDataError with the status on other non-2xx answers", async () => {
    mocked = installMockFetch(apiHandler({ searchStatus: 400 }));
    const err = await client()
      .searchOffers()
      .catch((e) => e);
    expect(err).toBeInstanceOf(OpenDataError);
    expect((err as OpenDataError).status).toBe(400);
  });

  test("maps offers and drops entries without an id", async () => {
    mocked = installMockFetch(
      apiHandler({ results: [rawOffer("A1"), { intitule: "no id" }] }),
    );
    const result = await client().searchOffers();

    expect(result.total).toBe(1);
    const offer = result.offers[0]!;
    expect(offer.id).toBe("A1");
    expect(offer.title).toBe("Offer A1");
    expect(offer.companyName).toBe("EXEMPLE SAS");
    expect(offer.siret).toBe("55203253400041");
    expect(offer.city).toBe("Bordeaux");
    expect(offer.department).toBe("33");
    expect(offer.contractType).toBe("CDI");
    expect(offer.url).toBe("https://example.test/offer");
    expect(offer.provenance.sourceRecordId).toBe("A1");
  });
});
