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
import { fetchJson } from "./http";
import type {
  Company,
  CompanySearchParams,
  CompanySearchResult,
  Provenance,
  ResponseCache,
} from "./types";

const SEARCH_ENDPOINT = "https://recherche-entreprises.api.gouv.fr/search";
const SOURCE = "API Recherche d'Entreprises (recherche-entreprises.api.gouv.fr)";
const MAX_PER_PAGE = 25;
const DEFAULT_CACHE_TTL_SECONDS = 900;
const CACHE_PREFIX = "french-open-data:recherche-entreprises:v1:";

interface RawHeadOffice {
  siret?: string | null;
  code_postal?: string | null;
  libelle_commune?: string | null;
  departement?: string | null;
  region?: string | null;
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
  siege?: RawHeadOffice | null;
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

function maskProtected(data: RawSearchResponse): MaskedPage {
  const all = data.results ?? [];
  const visible = all.filter((raw) => raw.statut_diffusion !== "P");
  return {
    results: visible,
    total: data.total_results ?? null,
    page: data.page ?? null,
    perPage: data.per_page ?? null,
    maskedCount: all.length - visible.length,
  };
}

function toCompany(raw: RawCompany, fetchedAt: string): Company {
  const siege = raw.siege ?? {};
  const provenance: Provenance = {
    source: SOURCE,
    sourceRecordId: raw.siren,
    fetchedAt,
  };
  return {
    siren: raw.siren,
    siret: siege.siret ?? null,
    name: raw.nom_complet ?? raw.nom_raison_sociale ?? raw.siren,
    naf: raw.activite_principale ?? null,
    nafLabel: raw.libelle_activite_principale ?? null,
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
}

export class RechercheEntreprisesClient {
  private readonly cache?: ResponseCache;
  private readonly cacheTtlSeconds: number;
  private readonly timeoutMs?: number;

  constructor(options: RechercheEntreprisesOptions = {}) {
    this.cache = options.cache;
    this.cacheTtlSeconds = options.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS;
    this.timeoutMs = options.timeoutMs;
  }

  async search(params: CompanySearchParams): Promise<CompanySearchResult> {
    const url = buildCompanySearchUrl(params);
    const fetchedAt = new Date().toISOString();
    const page = await this.loadPage(url);

    return {
      records: page.results.map((raw) => toCompany(raw, fetchedAt)),
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
