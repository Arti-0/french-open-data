/**
 * Client for the **France Travail "Offres d'emploi v2"** API
 * (https://francetravail.io).
 *
 * Auth: OAuth2 client-credentials. Register a (free) application on
 * francetravail.io and pass the client id/secret to the constructor — this
 * library never reads environment variables.
 *
 * Access tokens (~25 min lifetime) are cached per client instance and
 * refreshed 60 seconds before their announced expiry, so a token is never
 * used in its final, race-prone minute.
 */
import { fetchWithTimeout, OpenDataError } from "./http.js";
import type {
  JobOffer,
  JobOfferSearchParams,
  JobOfferSearchResult,
  Provenance,
} from "./types.js";

const TOKEN_URL =
  "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
const SEARCH_URL =
  "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search";
const SCOPE = "api_offresdemploiv2 o2dsoffre";
const DEFAULT_MAX_RESULTS = 20;
const HARD_MAX_RESULTS = 100;
const TOKEN_SAFETY_MARGIN_SECONDS = 60;
const SOURCE = "France Travail — Offres d'emploi v2 (francetravail.io)";

interface RawOffer {
  id?: string;
  intitule?: string;
  entreprise?: { nom?: string; siret?: string };
  lieuTravail?: { libelle?: string; codePostal?: string };
  typeContrat?: string;
  dateCreation?: string;
  origineOffre?: { urlOrigine?: string };
}

interface RawSearchResponse {
  resultats?: RawOffer[];
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

export interface FranceTravailOptions {
  /** OAuth2 client id from francetravail.io. */
  clientId: string;
  /** OAuth2 client secret from francetravail.io. */
  clientSecret: string;
  /** Request timeout in milliseconds (default 10 000). */
  timeoutMs?: number;
}

export class FranceTravailClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly timeoutMs?: number;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(options: FranceTravailOptions) {
    if (!options.clientId || !options.clientSecret) {
      throw new OpenDataError(
        "FranceTravailClient requires clientId and clientSecret (register at francetravail.io)",
      );
    }
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.timeoutMs = options.timeoutMs;
  }

  async searchOffers(
    params: JobOfferSearchParams = {},
  ): Promise<JobOfferSearchResult> {
    const token = await this.getAccessToken();
    const max = Math.min(
      params.maxResults ?? DEFAULT_MAX_RESULTS,
      HARD_MAX_RESULTS,
    );

    const qs = new URLSearchParams({ range: `0-${max - 1}` });
    if (params.keywords) qs.set("motsCles", params.keywords);
    if (params.department) qs.set("departement", params.department);
    if (params.commune) qs.set("commune", params.commune);

    const res = await fetchWithTimeout(`${SEARCH_URL}?${qs.toString()}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      timeoutMs: this.timeoutMs,
    });

    // 204 = no matching offers (empty body); 206 = partial content, the
    // normal answer for any ranged request that does not exhaust the results.
    if (res.status === 204) return { offers: [], total: 0 };
    if (!res.ok && res.status !== 206) {
      throw new OpenDataError(
        `France Travail search responded ${res.status}`,
        res.status,
      );
    }

    const body = (await res.json()) as RawSearchResponse;
    const fetchedAt = new Date().toISOString();
    const offers = (body.resultats ?? [])
      .map((raw) => toOffer(raw, fetchedAt))
      .filter((offer) => offer.id !== "");
    return { offers, total: offers.length };
  }

  /** Fetch or reuse the OAuth token (cached until expiry minus the margin). */
  private async getAccessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) {
      return this.token.value;
    }
    const res = await fetchWithTimeout(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: SCOPE,
      }),
      timeoutMs: this.timeoutMs,
    });
    if (!res.ok) {
      throw new OpenDataError(
        `France Travail OAuth responded ${res.status}`,
        res.status,
      );
    }
    const body = (await res.json()) as TokenResponse;
    this.token = {
      value: body.access_token,
      expiresAt:
        Date.now() + (body.expires_in - TOKEN_SAFETY_MARGIN_SECONDS) * 1000,
    };
    return body.access_token;
  }
}

function toOffer(raw: RawOffer, fetchedAt: string): JobOffer {
  const provenance: Provenance = {
    source: SOURCE,
    sourceRecordId: raw.id ?? null,
    fetchedAt,
  };
  return {
    id: raw.id ?? "",
    title: raw.intitule ?? "",
    companyName: raw.entreprise?.nom ?? null,
    siret: raw.entreprise?.siret ?? null,
    city: raw.lieuTravail?.libelle ?? null,
    department: raw.lieuTravail?.codePostal?.slice(0, 2) ?? null,
    contractType: raw.typeContrat ?? null,
    publishedAt: raw.dateCreation ?? null,
    url: raw.origineOffre?.urlOrigine ?? null,
    provenance,
  };
}
