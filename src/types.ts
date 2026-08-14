/**
 * Shared types: provenance envelope, pluggable cache contract, and the record
 * shapes returned by each client.
 */

/**
 * Where a record came from. Attached to every record this library emits so
 * downstream consumers can always answer "which API, which upstream id, when".
 */
export interface Provenance {
  /** Human-readable upstream source name. */
  source: string;
  /** The upstream record identifier (SIREN, announcement number, offer id…). */
  sourceRecordId: string | null;
  /** ISO-8601 timestamp of when this record was fetched. */
  fetchedAt: string;
}

/**
 * Pluggable response cache. Implement with anything that can store strings
 * with a TTL (in-process map, Redis, KV store…).
 *
 * Semantics are fail-open: if `get` or `set` throws, the client logs nothing,
 * skips the cache, and performs the live request — a broken cache never
 * breaks a lookup.
 */
export interface ResponseCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/** A company as projected from the Sirene registry (open-data subset). */
export interface Company {
  siren: string;
  /** SIRET of the head office (siège), when published. */
  siret: string | null;
  name: string;
  /** Main activity code (NAF/APE), e.g. "62.01Z". */
  naf: string | null;
  nafLabel: string | null;
  /** INSEE legal-category code, e.g. "5710" (SAS). */
  legalForm: string | null;
  postalCode: string | null;
  city: string | null;
  department: string | null;
  region: string | null;
  /** INSEE headcount band code (tranche d'effectif), e.g. "12" = 20–49. */
  headcountRange: string | null;
  createdDate: string | null;
  /**
   * Raw Sirene diffusion status, passed through untouched so consumers can
   * re-apply their own deny-by-default checks. Records with status "P"
   * (diffusion partielle — protected) never appear in results at all.
   */
  diffusionStatus: string | null;
  provenance: Provenance;
}

export interface CompanySearchParams {
  /** Free-text query (name, activity, address…). */
  query?: string;
  /** NAF/APE codes, OR-combined (e.g. ["62.01Z", "62.02A"]). */
  naf?: string[];
  /** INSEE region code, e.g. "84" (Auvergne-Rhône-Alpes). */
  region?: string;
  /** Department code, e.g. "69". */
  department?: string;
  postalCode?: string;
  /**
   * INSEE commune codes, OR-combined — city-precise filtering. For Paris,
   * Lyon and Marseille use arrondissement codes: establishments are attached
   * to the arrondissement, never to the parent commune code.
   */
  communeCodes?: string[];
  /** INSEE headcount band codes (tranche d'effectif), e.g. ["12", "21"]. */
  headcountBands?: string[];
  page?: number;
  /** Results per page, capped at the API maximum of 25. */
  perPage?: number;
}

export interface CompanySearchResult {
  records: Company[];
  total: number;
  page: number;
  perPage: number;
  /**
   * Number of protected records (diffusion status "P") removed from this
   * page. Always reported so callers can tell filtering happened.
   */
  maskedCount: number;
}

/** One BODACC announcement (public legal register — companies, not persons). */
export interface BodaccAnnouncement {
  /** Announcement family, e.g. "Procédures collectives", "Ventes et cessions". */
  type: string;
  /** Publication date (YYYY-MM-DD) when present. */
  date: string | null;
  /** Short human-readable summary (announcement kind + registered name). */
  summary: string;
  provenance: Provenance;
}

export interface BodaccSearchParams {
  /** SIREN of the company to look up. */
  siren: string;
  /** Maximum announcements to return (default 20). */
  limit?: number;
}

export interface BodaccSearchResult {
  siren: string;
  announcements: BodaccAnnouncement[];
}

/** A job offer from France Travail "Offres d'emploi v2". */
export interface JobOffer {
  id: string;
  title: string;
  companyName: string | null;
  siret: string | null;
  city: string | null;
  /** Department inferred from the workplace postal code. */
  department: string | null;
  /** Contract type code, e.g. "CDI", "CDD". */
  contractType: string | null;
  publishedAt: string | null;
  /** Original posting URL when the offer comes from a partner site. */
  url: string | null;
  provenance: Provenance;
}

export interface JobOfferSearchParams {
  /** Free-text keywords (role, skill…). */
  keywords?: string;
  /** Department code, e.g. "33". */
  department?: string;
  /** INSEE commune code, e.g. "33063" (Bordeaux). */
  commune?: string;
  /** Maximum offers to return (default 20, hard cap 100). */
  maxResults?: number;
}

export interface JobOfferSearchResult {
  offers: JobOffer[];
  total: number;
}
