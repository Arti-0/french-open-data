/**
 * Client for **BODACC** (Bulletin officiel des annonces civiles et
 * commerciales) via the DILA Opendatasoft portal
 * (https://bodacc-datadila.opendatasoft.com) — public legal announcements:
 * incorporations, collective proceedings, sales, radiations.
 *
 * Open data, no credentials. Announcements concern legal entities (a public
 * register), not private individuals.
 */
import { fetchJson } from "./http";
import type {
  BodaccAnnouncement,
  BodaccSearchParams,
  BodaccSearchResult,
  Provenance,
} from "./types";

const ENDPOINT =
  "https://bodacc-datadila.opendatasoft.com/api/records/1.0/search/";
const SOURCE = "BODACC (DILA, bodacc-datadila.opendatasoft.com)";
const DEFAULT_LIMIT = 20;

interface RawRecord {
  fields?: {
    dateparution?: string;
    commercant?: string;
    familleavis_lib?: string;
    typeavis_lib?: string;
    numeroannonce?: number | string;
  };
}

interface RawResponse {
  records?: RawRecord[];
}

function toAnnouncement(raw: RawRecord, fetchedAt: string): BodaccAnnouncement {
  const fields = raw.fields ?? {};
  const provenance: Provenance = {
    source: SOURCE,
    sourceRecordId:
      fields.numeroannonce != null ? String(fields.numeroannonce) : null,
    fetchedAt,
  };
  return {
    type: fields.familleavis_lib ?? fields.typeavis_lib ?? "annonce",
    date: fields.dateparution ?? null,
    summary: [fields.typeavis_lib, fields.commercant]
      .filter(Boolean)
      .join(" — "),
    provenance,
  };
}

export interface BodaccOptions {
  /** Request timeout in milliseconds (default 10 000). */
  timeoutMs?: number;
}

export class BodaccClient {
  private readonly timeoutMs?: number;

  constructor(options: BodaccOptions = {}) {
    this.timeoutMs = options.timeoutMs;
  }

  /** Latest announcements for a SIREN, most recent first. */
  async announcements(params: BodaccSearchParams): Promise<BodaccSearchResult> {
    const qs = new URLSearchParams({
      dataset: "annonces-commerciales",
      q: params.siren,
      rows: String(params.limit ?? DEFAULT_LIMIT),
      sort: "dateparution",
    });
    const fetchedAt = new Date().toISOString();
    const data = await fetchJson<RawResponse>(`${ENDPOINT}?${qs.toString()}`, {
      timeoutMs: this.timeoutMs,
    });
    return {
      siren: params.siren,
      announcements: (data.records ?? []).map((r) =>
        toAnnouncement(r, fetchedAt),
      ),
    };
  }
}
