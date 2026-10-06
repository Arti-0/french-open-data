import { afterEach, describe, expect, test } from "bun:test";
import {
  buildCompanySearchUrl,
  RechercheEntreprisesClient,
} from "../src/company-search";
import { MemoryCache } from "../src/cache";
import { OpenDataError } from "../src/http";
import type { ResponseCache } from "../src/types";
import {
  hangUntilAborted,
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
    expect(record.street).toBeNull();
    expect(record.latitude).toBeNull();
    expect(record.tradeName).toBeNull();
    expect(record.managers).toEqual([]);
  });

  test("maps street, coordinates, shop sign and managers; never birth dates", async () => {
    const stored: string[] = [];
    const cache: ResponseCache = {
      get: async () => null,
      set: async (_key, value) => {
        stored.push(value);
      },
    };
    mocked = installMockFetch(() =>
      pageResponse([
        rawCompany("111222333", {
          siege: {
            siret: "11122233300011",
            adresse: "12 RUE DE LA PAIX 69001 LYON",
            code_postal: "69001",
            latitude: "45.767",
            longitude: "4.834",
            liste_enseignes: [null, "AU BON PAIN"],
          },
          dirigeants: [
            {
              nom: "DUPONT",
              prenoms: "Marie",
              qualite: "Gérant",
              type_dirigeant: "personne physique",
              annee_de_naissance: "1980",
              date_de_naissance: "1980-05",
            },
            {
              denomination: "HOLDING X",
              qualite: "Président",
              type_dirigeant: "personne morale",
            },
            { type_dirigeant: "personne physique" },
          ],
        }),
      ]),
    );
    const client = new RechercheEntreprisesClient({ cache });
    const record = (await client.search({ department: "69" })).records[0]!;
    expect(record.street).toBe("12 RUE DE LA PAIX");
    expect(record.latitude).toBe(45.767);
    expect(record.longitude).toBe(4.834);
    expect(record.tradeName).toBe("AU BON PAIN");
    expect(record.managers).toEqual([
      { name: "Marie DUPONT", role: "Gérant", kind: "person" },
      { name: "HOLDING X", role: "Président", kind: "company" },
    ]);
    expect(JSON.stringify(record)).not.toContain("1980");
    expect(stored).toHaveLength(1);
    expect(stored[0]).not.toContain("naissance");
  });

  test("a search filtered by place reports the active establishment in that place", async () => {
    mocked = installMockFetch(() =>
      pageResponse([
        rawCompany("111222333", {
          siege: { siret: "11122233300011", est_siege: true, code_postal: "75008", libelle_commune: "PARIS", adresse: "1 RUE DU SIEGE 75008 PARIS" },
          matching_etablissements: [
            { siret: "11122233300029", est_siege: false, etat_administratif: "F", code_postal: "93100", libelle_commune: "MONTREUIL", adresse: "5 RUE FERMEE 93100 MONTREUIL" },
            { siret: "11122233300037", est_siege: false, etat_administratif: "A", code_postal: "93100", libelle_commune: "MONTREUIL", adresse: "9 RUE DE PARIS 93100 MONTREUIL", latitude: "48.86", longitude: "2.44" },
          ],
        }),
      ]),
    );
    const byPostcode = await new RechercheEntreprisesClient().search({ postalCode: "93100", naf: ["10.71C"] });
    const shop = byPostcode.records[0]!;
    expect(shop.siret).toBe("11122233300037");
    expect(shop.isHeadOffice).toBe(false);
    expect(shop.street).toBe("9 RUE DE PARIS");
    expect(shop.postalCode).toBe("93100");
    expect(shop.city).toBe("MONTREUIL");
    expect(shop.latitude).toBe(48.86);

    const unfiltered = await new RechercheEntreprisesClient().search({ query: "company" });
    expect(unfiltered.records[0]!.siret).toBe("11122233300011");
    expect(unfiltered.records[0]!.isHeadOffice).toBe(true);
  });

  test("a place filter the head office satisfies keeps the head office", async () => {
    mocked = installMockFetch(() =>
      pageResponse([
        rawCompany("111222333", {
          siege: { siret: "11122233300011", est_siege: true, code_postal: "93100", commune: "93048", departement: "93" },
          matching_etablissements: [{ siret: "11122233300037", est_siege: false, code_postal: "93100", commune: "93048", departement: "93" }],
        }),
      ]),
    );
    for (const params of [{ postalCode: "93100" }, { communeCodes: ["93048"] }, { department: "93" }]) {
      const result = await new RechercheEntreprisesClient().search(params);
      expect(result.records[0]!.siret).toBe("11122233300011");
      expect(result.records[0]!.isHeadOffice).toBe(true);
    }
  });

  test("fills nafLabel from the offline INSEE table when the API sends none", async () => {
    mocked = installMockFetch(() =>
      pageResponse([
        rawCompany("111222333", { activite_principale: "10.71C" }),
        rawCompany("444555666", { activite_principale: "62.01Z", libelle_activite_principale: "Programmation informatique (API)" }),
        rawCompany("777888999", { activite_principale: "99.99X" }),
      ]),
    );
    const { records } = await new RechercheEntreprisesClient().search({ query: "x" });
    expect(records[0]!.nafLabel).toBe("Boulangerie et boulangerie-pâtisserie");
    expect(records[1]!.nafLabel).toBe("Programmation informatique (API)");
    expect(records[2]!.nafLabel).toBeNull();
  });

  test("an injected fetch carries every request; globalThis.fetch is never called", async () => {
    mocked = installMockFetch(() => {
      throw new Error("globalThis.fetch must not be used");
    });
    const seen: string[] = [];
    const budget = 2;
    const counting = async (url: string, init?: RequestInit): Promise<Response> => {
      if (seen.length >= budget) return new Response("Too Many Requests", { status: 429 });
      seen.push(url);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return pageResponse([rawCompany("111222333")]);
    };
    const client = new RechercheEntreprisesClient({ fetch: counting });
    expect((await client.search({ query: "a" })).records).toHaveLength(1);
    expect((await client.search({ query: "b" })).records).toHaveLength(1);
    const err = await client.search({ query: "c" }).catch((e) => e);
    expect(err).toBeInstanceOf(OpenDataError);
    expect((err as OpenDataError).status).toBe(429);
    expect(seen).toHaveLength(2);
    expect(mocked.calls).toHaveLength(0);
  });

  test("an injected fetch still masks protected records and keeps the deadline", async () => {
    const client = new RechercheEntreprisesClient({ fetch: hangUntilAborted, timeoutMs: 20 });
    const err = await client.search({ query: "slow" }).catch((e) => e);
    expect(err).toBeInstanceOf(OpenDataError);
    expect((err as OpenDataError).message).toContain("timed out");

    const masking = new RechercheEntreprisesClient({
      fetch: async () => pageResponse([rawCompany("111222333"), rawCompany("444555666", { statut_diffusion: "P" })]),
    });
    const result = await masking.search({ query: "x" });
    expect(result.records.map((r) => r.siren)).toEqual(["111222333"]);
    expect(result.maskedCount).toBe(1);
  });

  test("a SIRET query reports the matching establishment, not the head office", async () => {
    mocked = installMockFetch(() =>
      pageResponse([
        rawCompany("111222333", {
          siege: {
            siret: "11122233300011",
            code_postal: "75001",
            adresse: "1 RUE A 75001 PARIS",
          },
          matching_etablissements: [
            {
              siret: "11122233300029",
              code_postal: "93100",
              libelle_commune: "MONTREUIL",
              adresse: "5 RUE B 93100 MONTREUIL",
            },
          ],
        }),
      ]),
    );
    const client = new RechercheEntreprisesClient();
    const shop = (await client.search({ query: "111 222 333 00029" }))
      .records[0]!;
    expect(shop.siret).toBe("11122233300029");
    expect(shop.street).toBe("5 RUE B");
    expect(shop.city).toBe("MONTREUIL");
    const head = (await client.search({ query: "company" })).records[0]!;
    expect(head.siret).toBe("11122233300011");
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

    const key = `french-open-data:recherche-entreprises:v2:${buildCompanySearchUrl({ naf: ["62.01Z"] })}`;
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
