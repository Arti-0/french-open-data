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

/**
 * The subset of the Web Storage API that {@link StorageCache} needs:
 * `localStorage`, `sessionStorage`, or any object with the same three
 * synchronous methods (a test double, a file-backed map…).
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** A company as projected from the Sirene registry (open-data subset). */
/**
 * A registered manager (dirigeant) as published by the open register. Birth
 * dates are dropped by the client and never returned or cached.
 */
export interface CompanyManager {
  /** "Prénoms NOM" for a person, the registered name for a legal entity. */
  name: string;
  /** Role as published, e.g. "Gérant", "Président de SAS". */
  role: string | null;
  kind: "person" | "company";
}

export interface Company {
  siren: string;
  /**
   * SIRET of the establishment the other location fields describe: the one
   * matching a 14-digit SIRET `query`; otherwise, when the search is filtered
   * by place (`postalCode`, `communeCodes` or `department`), the active
   * establishment that matched that place; otherwise the head office (siège).
   */
  siret: string | null;
  /** True when the described establishment is the head office. */
  isHeadOffice: boolean;
  name: string;
  /** Shop sign or trade name of the establishment, when registered. */
  tradeName: string | null;
  /** Street line of the establishment address (no postcode, no city). */
  street: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Registered managers, in register order; empty when none is published. */
  managers: CompanyManager[];
  /** Main activity code (NAF/APE), e.g. "62.01Z". */
  naf: string | null;
  /**
   * French label of `naf`: the API's own label when it sends one, otherwise
   * the offline INSEE table (see `nafLabel()`); null for an unknown code.
   */
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
   * How many establishments the legal unit has, and how many are open: a
   * single shop reads 1/1, a chain 40/38. Null when the register says nothing.
   */
  establishments: CompanyEstablishments;
  /** Latest published yearly accounts, or null when the company files none. */
  finances: CompanyFinances | null;
  /**
   * Raw Sirene diffusion status, passed through untouched so consumers can
   * re-apply their own deny-by-default checks. Records with status "P"
   * (diffusion partielle — protected) never appear in results at all.
   */
  diffusionStatus: string | null;
  provenance: Provenance;
}

export interface CompanyEstablishments {
  total: number | null;
  open: number | null;
}

/** One year of published accounts (source: the register's `finances`). */
export interface CompanyFinances {
  /** Accounting year, "2023". */
  year: string;
  /** Chiffre d'affaires, in euros. */
  revenue: number | null;
  /** Résultat net, in euros (negative for a loss). */
  netIncome: number | null;
}

export interface CompanySearchParams {
  /**
   * Free-text query: company name, address words, a manager's name, or a
   * SIREN/SIRET for a direct lookup.
   */
  query?: string;
  /** Surname of a registered manager or elected official (nom_personne). */
  managerName?: string;
  /** First name(s) of that person (prenoms_personne). */
  managerFirstName?: string;
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
  /** Number of pages for this query, as the API counts them. */
  totalPages: number;
  /**
   * Number of protected records (diffusion status "P") removed from this
   * page. Always reported so callers can tell filtering happened.
   */
  maskedCount: number;
}

/** Parameters of a geographic search (`GET /near_point`). */
export interface CompanyNearbyParams {
  latitude: number;
  longitude: number;
  /** Search radius in kilometres: 1 by default, 50 at most (API limit). */
  radiusKm?: number;
  /** NAF/APE codes, OR-combined. */
  naf?: string[];
  page?: number;
  /** Results per page, capped at the API maximum of 25. */
  perPage?: number;
}

/** A company found around a point: its closest establishment, with the distance. */
export interface NearbyCompany extends Company {
  /** Distance from the searched point to the reported establishment, in metres; null when it has no coordinates. */
  distanceMetres: number | null;
}

export interface CompanyNearbyResult extends Omit<CompanySearchResult, "records"> {
  /** Nearest first; companies without coordinates last. */
  records: NearbyCompany[];
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
