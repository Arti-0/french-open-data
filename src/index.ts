export { OpenDataError, fetchJson, fetchWithTimeout } from "./http.js";
export type { FetchLike, RequestOptions } from "./http.js";

export type {
  BodaccAnnouncement,
  BodaccSearchParams,
  BodaccSearchResult,
  Company,
  CompanyEstablishments,
  CompanyFinances,
  CompanyManager,
  CompanyNearbyParams,
  CompanyNearbyResult,
  CompanySearchParams,
  CompanySearchResult,
  JobOffer,
  JobOfferSearchParams,
  JobOfferSearchResult,
  NearbyCompany,
  Provenance,
  ResponseCache,
  StorageLike,
} from "./types.js";

export { MemoryCache, StorageCache } from "./cache.js";
export type { StorageCacheOptions } from "./cache.js";

export {
  RechercheEntreprisesClient,
  buildCompanyNearbyUrl,
  buildCompanySearchUrl,
} from "./company-search.js";
export type { RechercheEntreprisesOptions } from "./company-search.js";

export { BodaccClient } from "./bodacc.js";
export type { BodaccOptions } from "./bodacc.js";

export { FranceTravailClient } from "./france-travail.js";
export type { FranceTravailOptions } from "./france-travail.js";

export { NAF_SECTORS, nafSectorBySlug } from "./catalog/naf.js";
export type { NafSector } from "./catalog/naf.js";
export { NAF_LABELS, nafLabel } from "./catalog/naf-labels.js";

export {
  COMMUNES,
  communeBySlug,
  arrondissementCodes,
} from "./catalog/communes.js";
export type { Commune } from "./catalog/communes.js";
