export { OpenDataError, fetchJson, fetchWithTimeout } from "./http";
export type { RequestOptions } from "./http";

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
} from "./types";

export { MemoryCache } from "./cache";

export {
  RechercheEntreprisesClient,
  buildCompanySearchUrl,
} from "./company-search";
export type { RechercheEntreprisesOptions } from "./company-search";

export { BodaccClient } from "./bodacc";
export type { BodaccOptions } from "./bodacc";

export { FranceTravailClient } from "./france-travail";
export type { FranceTravailOptions } from "./france-travail";

export { NAF_SECTORS, nafSectorBySlug } from "./catalog/naf";
export type { NafSector } from "./catalog/naf";

export {
  COMMUNES,
  communeBySlug,
  arrondissementCodes,
} from "./catalog/communes";
export type { Commune } from "./catalog/communes";
