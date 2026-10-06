/**
 * Client for the **API Recherche d'Entreprises**
 * (https://recherche-entreprises.api.gouv.fr) — the keyless open-data search
 * over the INSEE Sirene registry.
 *
 * - No credentials, no quota key: open data.
 * - Records with Sirene diffusion status "P" (diffusion partielle — subjects
 *   who opted out of full publication) are masked deny-by-default: they are
 *   removed before anything is returned OR cached, and `maskedCount` reports
 *   how many were removed so callers can tell filtering happened.
 * - Responses are optionally cached through a pluggable {@link ResponseCache}
 *   keyed by the request URL (a deterministic serialization of the params).
 *   Cache errors are swallowed: a broken cache falls back to a live request.
 */
import { fetchJson, type FetchLike } from "./http.js";
import { nafLabel } from "./catalog/naf-labels.js";
import type {
  Company,
  CompanyManager,
  CompanySearchParams,
  CompanySearchResult,
  Provenance,
  ResponseCache,
} from "./types.js";

const SEARCH_ENDPOINT = "https://recherche-entreprises.api.gouv.fr/search";
const SOURCE = "API Recherche d'Entreprises (recherche-entreprises.api.gouv.fr)";
const MAX_PER_PAGE = 25;
const DEFAULT_CACHE_TTL_SECONDS = 900;
// v2: cached pages no longer hold the birth dates of managers.
const CACHE_PREFIX = "french-open-data:recherche-entreprises:v2:";

interface RawEstablishment {
  siret?: string | null;
  est_siege?: boolean | null;
  etat_administratif?: string | null;
  adresse?: string | null;
  code_postal?: string | null;
  commune?: string | null;
  libelle_commune?: string | null;
  departement?: string | null;
  region?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  nom_commercial?: string | null;
  liste_enseignes?: (string | null)[] | null;
}

interface RawManager {
  nom?: string | null;
  prenoms?: string | null;
  denomination?: string | null;
  qualite?: string | null;
  type_dirigeant?: string | null;
  annee_de_naissance?: unknown;
  date_de_naissance?: unknown;
}

interface RawCompany {
  siren: string;
  nom_complet?: string | null;
  nom_raison_sociale?: string | null;
  nature_juridique?: string | null;
  activite_principale?: string | null;
  libelle_activite_principale?: string | null;
  tranche_effectif_salarie?: string | null;
  date_creation?: string | null;
  statut_diffusion?: string | null;
  siege?: RawEstablishment | null;
  matching_etablissements?: RawEstablishment[] | null;
  dirigeants?: RawManager[] | null;
}

interface RawSearchResponse {
  results?: RawCompany[];
  total_results?: number;
  page?: number;
  per_page?: number;
}

/**
 * What actually enters the cache: the upstream page with protected
 * (diffusion "P") records already removed, plus the count of removals so
 * cache hits report the same `maskedCount` as live fetches.
 */
interface MaskedPage {
  results: RawCompany[];
  total: number | null;
  page: number | null;
  perPage: number | null;
  maskedCount: number;
}

function withoutBirthDate(manager: RawManager): RawManager {
  const kept = { ...manager };
  delete kept.annee_de_naissance;
  delete kept.date_de_naissance;
  return kept;
}

function maskProtected(data: RawSearchResponse): MaskedPage {
  const all = data.results ?? [];
  // Birth dates of managers are personal data no caller needs: dropped here,
  // before the page is returned or cached.
  const visible = all
    .filter((raw) => raw.statut_diffusion !== "P")
    .map((raw) =>
      raw.dirigeants
        ? { ...raw, dirigeants: raw.dirigeants.map(withoutBirthDate) }
        : raw,
    );
  return {
    results: visible,
    total: data.total_results ?? null,
    page: data.page ?? null,
    perPage: data.per_page ?? null,
    maskedCount: all.length - visible.length,
  };
}

/** "12 RUE X 93100 MONTREUIL" → "12 RUE X": the street line only. */
function streetOf(etab: RawEstablishment): string | null {
  const full = etab.adresse?.trim();
  if (!full) return null;
  const cut = etab.code_postal ? full.indexOf(` ${etab.code_postal}`) : -1;
  return (cut > 0 ? full.slice(0, cut) : full).trim() || null;
}

function coordinate(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toManagers(raw: RawManager[] | null | undefined): CompanyManager[] {
  const managers: CompanyManager[] = [];
  for (const m of raw ?? []) {
    const person = m.type_dirigeant !== "personne morale";
    const name = (
      person
        ? [m.prenoms, m.nom].filter(Boolean).join(" ")
        : (m.denomination ?? "")
    ).trim();
    if (name) {
      managers.push({
        name,
        role: m.qualite ?? null,
        kind: person ? "person" : "company",
      });
    }
  }
  return managers;
}

/**
 * Which establishment a record describes. A SIRET query names it. A search
 * filtered by place reports the active establishment that matched that place:
 * a company whose head office is elsewhere would otherwise be reported at an
 * address outside the searched zone (observed with multi-establishment
 * bakeries, 2026-10-02). Without either, the head office.
 */
function pickEstablishment(
  raw: RawCompany,
  params: CompanySearchParams,
  siret?: string,
): RawEstablishment {
  const matching = raw.matching_etablissements ?? [];
  const siege = raw.siege ?? {};
  if (siret) return matching.find((etab) => etab.siret === siret) ?? siege;
  const inPlace = (etab: RawEstablishment): boolean =>
    (!!params.postalCode && etab.code_postal === params.postalCode) ||
    (!!params.communeCodes?.length &&
      !!etab.commune &&
      params.communeCodes.includes(etab.commune)) ||
    (!!params.department && etab.departement === params.department);
  if (!params.postalCode && !params.communeCodes?.length && !params.department) {
    return siege;
  }
  if (inPlace(siege)) return siege;
  return (
    matching.find(
      (etab) => inPlace(etab) && (etab.etat_administratif ?? "A") === "A",
    ) ?? siege
  );
}

function toCompany(
  raw: RawCompany,
  fetchedAt: string,
  params: CompanySearchParams,
  siret?: string,
): Company {
  const siege = pickEstablishment(raw, params, siret);
  const provenance: Provenance = {
    source: SOURCE,
    sourceRecordId: raw.siren,
    fetchedAt,
  };
  return {
    siren: raw.siren,
    siret: siege.siret ?? null,
    isHeadOffice:
      siege.est_siege ?? (!!siege.siret && siege.siret === raw.siege?.siret),
    name: raw.nom_complet ?? raw.nom_raison_sociale ?? raw.siren,
    tradeName:
      siege.nom_commercial?.trim() ||
      siege.liste_enseignes?.find((sign) => sign?.trim())?.trim() ||
      null,
    street: streetOf(siege),
    latitude: coordinate(siege.latitude),
    longitude: coordinate(siege.longitude),
    managers: toManagers(raw.dirigeants),
    naf: raw.activite_principale ?? null,
    nafLabel:
      raw.libelle_activite_principale ?? nafLabel(raw.activite_principale),
    legalForm: raw.nature_juridique ?? null,
    postalCode: siege.code_postal ?? null,
    city: siege.libelle_commune ?? null,
    department: siege.departement ?? null,
    region: siege.region ?? null,
    headcountRange: raw.tranche_effectif_salarie ?? null,
    createdDate: raw.date_creation ?? null,
    diffusionStatus: raw.statut_diffusion ?? null,
    provenance,
  };
}

function clampPerPage(perPage: number | undefined): number {
  return Math.min(perPage ?? MAX_PER_PAGE, MAX_PER_PAGE);
}

/**
 * Build the search URL. Exported for inspection/debugging — the URL doubles
 * as the cache key, so it serializes params in a fixed order.
 */
export function buildCompanySearchUrl(params: CompanySearchParams): string {
  const qs = new URLSearchParams();
  if (params.query) qs.set("q", params.query);
  if (params.naf?.length) qs.set("activite_principale", params.naf.join(","));
  if (params.region) qs.set("region", params.region);
  if (params.department) qs.set("departement", params.department);
  if (params.postalCode) qs.set("code_postal", params.postalCode);
  if (params.communeCodes?.length) {
    qs.set("code_commune", params.communeCodes.join(","));
  }
  if (params.headcountBands?.length) {
    qs.set("tranche_effectif_salarie", params.headcountBands.join(","));
  }
  // Active establishments only — callers who need dissolved companies can
  // query the API directly.
  qs.set("etat_administratif", "A");
  qs.set("page", String(Math.max(params.page ?? 1, 1)));
  qs.set("per_page", String(clampPerPage(params.perPage)));
  return `${SEARCH_ENDPOINT}?${qs.toString()}`;
}

export interface RechercheEntreprisesOptions {
  /** Optional response cache (see {@link ResponseCache}); fail-open. */
  cache?: ResponseCache;
  /** Cache TTL in seconds (default 900). */
  cacheTtlSeconds?: number;
  /** Request timeout in milliseconds (default 10 000). */
  timeoutMs?: number;
  /**
   * Transport to use instead of `globalThis.fetch`: a rate limiter, a call
   * counter, a test double. Every search and cache miss goes through it.
   */
  fetch?: FetchLike;
}

export class RechercheEntreprisesClient {
  private readonly cache?: ResponseCache;
  private readonly cacheTtlSeconds: number;
  private readonly timeoutMs?: number;
  private readonly fetch?: FetchLike;

  constructor(options: RechercheEntreprisesOptions = {}) {
    this.cache = options.cache;
    this.cacheTtlSeconds = options.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS;
    this.timeoutMs = options.timeoutMs;
    this.fetch = options.fetch;
  }

  async search(params: CompanySearchParams): Promise<CompanySearchResult> {
    const url = buildCompanySearchUrl(params);
    const fetchedAt = new Date().toISOString();
    const page = await this.loadPage(url);
    const query = params.query?.replace(/\s+/g, "") ?? "";
    const siret = /^[0-9]{14}$/.test(query) ? query : undefined;

    return {
      records: page.results.map((raw) =>
        toCompany(raw, fetchedAt, params, siret),
      ),
      total: page.total ?? page.results.length,
      page: page.page ?? Math.max(params.page ?? 1, 1),
      perPage: page.perPage ?? clampPerPage(params.perPage),
      maskedCount: page.maskedCount,
    };
  }

  /**
   * Load one result page through the cache. Protected records are stripped
   * BEFORE the page is stored, so they never sit in any cache; cache errors
   * fail open to a live request.
   */
  private async loadPage(url: string): Promise<MaskedPage> {
    const key = `${CACHE_PREFIX}${url}`;
    if (this.cache) {
      try {
        const hit = await this.cache.get(key);
        if (hit !== null) return JSON.parse(hit) as MaskedPage;
      } catch {
        // Fail open: a broken cache must never break the lookup.
      }
    }
    const data = await fetchJson<RawSearchResponse>(url, {
      timeoutMs: this.timeoutMs,
      fetch: this.fetch,
    });
    const masked = maskProtected(data);
    if (this.cache) {
      try {
        await this.cache.set(key, JSON.stringify(masked), this.cacheTtlSeconds);
      } catch {
        // Fail open on writes too.
      }
    }
    return masked;
  }
}
