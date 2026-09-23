export { OpenDataError, fetchJson, fetchWithTimeout } from "./http.js";
export type { RequestOptions } from "./http.js";

export type {
  BodaccAnnouncement,
  BodaccSearchParams,
  BodaccSearchResult,
  Company,
  CompanySearchParams,
  CompanySearchResult,
  JobOffer,
  JobOfferSearchParams,
  JobOfferSearchResult,
  Provenance,
  ResponseCache,
} from "./types.js";

export { MemoryCache } from "./cache.js";

export {
  RechercheEntreprisesClient,
  buildCompanySearchUrl,
} from "./company-search.js";
export type { RechercheEntreprisesOptions } from "./company-search.js";

export { BodaccClient } from "./bodacc.js";
export type { BodaccOptions } from "./bodacc.js";

export { FranceTravailClient } from "./france-travail.js";
export type { FranceTravailOptions } from "./france-travail.js";

export { NAF_SECTORS, nafSectorBySlug } from "./catalog/naf.js";
export type { NafSector } from "./catalog/naf.js";

export {
  COMMUNES,
  communeBySlug,
  arrondissementCodes,
} from "./catalog/communes.js";
export type { Commune } from "./catalog/communes.js";
