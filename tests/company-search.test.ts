import { afterEach, describe, expect, test } from "bun:test";
import {
  buildCompanySearchUrl,
  RechercheEntreprisesClient,
} from "../src/company-search";
import { MemoryCache } from "../src/cache";
import type { ResponseCache } from "../src/types";
import {
  installMockFetch,
  jsonResponse,
  queryOf,
  type MockedFetch,
} from "./helpers";

let mocked: MockedFetch | null = null;
afterEach(() => {
  mocked?.restore();
  mocked = null;
});

const rawCompany = (siren: string, extra: Record<string, unknown> = {}) => ({
  siren,
  nom_complet: `Company ${siren}`,
  activite_principale: "62.01Z",
  statut_diffusion: "O",
  siege: { siret: `${siren}00011`, code_postal: "69001" },
  ...extra,
});

const pageResponse = (results: unknown[], total = results.length) =>
  jsonResponse({ results, total_results: total, page: 1, per_page: 25 });

describe("buildCompanySearchUrl", () => {
  test("serializes every filter", () => {
    const url = new URL(
      buildCompanySearchUrl({
        query: "boulangerie dupont",
        naf: ["10.71C", "10.71D"],
        region: "84",
        department: "69",
        postalCode: "69001",
        communeCodes: ["69381", "69382"],
        headcountBands: ["12", "21"],
        page: 3,
        perPage: 10,
      }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://recherche-entreprises.api.gouv.fr/search",
    );
    const qs = url.searchParams;
    expect(qs.get("q")).toBe("boulangerie dupont");
    expect(qs.get("activite_principale")).toBe("10.71C,10.71D");
    expect(qs.get("region")).toBe("84");
    expect(qs.get("departement")).toBe("69");
    expect(qs.get("code_postal")).toBe("69001");
    expect(qs.get("code_commune")).toBe("69381,69382");
    expect(qs.get("tranche_effectif_salarie")).toBe("12,21");
    expect(qs.get("etat_administratif")).toBe("A");
    expect(qs.get("page")).toBe("3");
    expect(qs.get("per_page")).toBe("10");
  });

  test("applies defaults and omits unset filters", () => {
    const qs = new URL(buildCompanySearchUrl({})).searchParams;
    expect(qs.get("etat_administratif")).toBe("A");
    expect(qs.get("page")).toBe("1");
    expect(qs.get("per_page")).toBe("25");
    for (const absent of [
      "q",
      "activite_principale",
      "region",
      "departement",
      "code_postal",
      "code_commune",
      "tranche_effectif_salarie",
    ]) {
      expect(qs.get(absent)).toBeNull();
    }
  });

  test("clamps perPage to the API maximum of 25", () => {
    const qs = new URL(buildCompanySearchUrl({ perPage: 500 })).searchParams;
    expect(qs.get("per_page")).toBe("25");
  });

  test("is deterministic for identical params (usable as cache key)", () => {
    const params = { naf: ["62.01Z"], department: "33", page: 2 };
    expect(buildCompanySearchUrl(params)).toBe(buildCompanySearchUrl(params));
  });
});

describe("RechercheEntreprisesClient.search", () => {
  test("requests the built URL and maps records", async () => {
    mocked = installMockFetch(() => pageResponse([rawCompany("111222333")]));
    const client = new RechercheEntreprisesClient();
    const result = await client.search({ naf: ["62.01Z"], department: "69" });

    expect(mocked.calls).toHaveLength(1);
    const qs = queryOf(mocked.calls[0]!);
    expect(qs.get("activite_principale")).toBe("62.01Z");
    expect(qs.get("departement")).toBe("69");

    expect(result.total).toBe(1);
    const record = result.records[0]!;
    expect(record.siren).toBe("111222333");
    expect(record.name).toBe("Company 111222333");
    expect(record.siret).toBe("11122233300011");
    expect(record.provenance.sourceRecordId).toBe("111222333");
  });

  test("masks diffusion-P records and reports maskedCount", async () => {
    mocked = installMockFetch(() =>
      pageResponse(
        [
          rawCompany("111111111"),
          rawCompany("222222222", { statut_diffusion: "P" }),
          rawCompany("333333333"),
        ],
        3,
      ),
    );
    const client = new RechercheEntreprisesClient();
    const result = await client.search({});

    expect(result.records.map((r) => r.siren)).toEqual([
      "111111111",
      "333333333",
    ]);
    expect(result.maskedCount).toBe(1);
    expect(result.records.every((r) => r.diffusionStatus !== "P")).toBe(true);
  });

  test("never writes diffusion-P records to the cache", async () => {
    mocked = installMockFetch(() =>
      pageResponse([
        rawCompany("111111111"),
        rawCompany("222222222", { statut_diffusion: "P" }),
      ]),
    );
    const cache = new MemoryCache();
    const client = new RechercheEntreprisesClient({ cache });
    await client.search({ naf: ["62.01Z"] });

    const key = `french-open-data:recherche-entreprises:v1:${buildCompanySearchUrl({ naf: ["62.01Z"] })}`;
    const stored = await cache.get(key);
    expect(stored).not.toBeNull();
    expect(stored).not.toContain("222222222");
    expect(stored).toContain("111111111");
  });

  test("serves repeat searches from the cache (single upstream fetch)", async () => {
    mocked = installMockFetch(() => pageResponse([rawCompany("111111111")]));
    const client = new RechercheEntreprisesClient({ cache: new MemoryCache() });

    const first = await client.search({ naf: ["62.01Z"] });
    const second = await client.search({ naf: ["62.01Z"] });

    expect(mocked.calls).toHaveLength(1);
    expect(second.records.map((r) => r.siren)).toEqual(
      first.records.map((r) => r.siren),
    );
    expect(second.maskedCount).toBe(first.maskedCount);
  });

  test("fails open when the cache throws on get and set", async () => {
    mocked = installMockFetch(() => pageResponse([rawCompany("111111111")]));
    const brokenCache: ResponseCache = {
      get: () => Promise.reject(new Error("cache down")),
      set: () => Promise.reject(new Error("cache down")),
    };
    const client = new RechercheEntreprisesClient({ cache: brokenCache });

    const result = await client.search({});
    expect(result.records).toHaveLength(1);
    expect(mocked.calls).toHaveLength(1);
  });

  test("fails open when the cache throws synchronously", async () => {
    mocked = installMockFetch(() => pageResponse([rawCompany("111111111")]));
    const brokenCache: ResponseCache = {
      get: () => {
        throw new Error("boom");
      },
      set: () => {
        throw new Error("boom");
      },
    };
    const client = new RechercheEntreprisesClient({ cache: brokenCache });

    const result = await client.search({});
    expect(result.records).toHaveLength(1);
  });
});
