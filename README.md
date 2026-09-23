# french-open-data

Typed, zero-dependency TypeScript clients for three French public open-data APIs:

| API | What it gives you | Auth |
| --- | --- | --- |
| [API Recherche d'Entreprises](https://recherche-entreprises.api.gouv.fr) | Company search over the INSEE Sirene registry (SIREN/SIRET, NAF, location, headcount) | none |
| [BODACC](https://bodacc-datadila.opendatasoft.com) | Official legal announcements: incorporations, collective proceedings, sales, radiations | none |
| [France Travail — Offres d'emploi v2](https://francetravail.io) | Job offers with company, location and contract data | OAuth2 client credentials |

Plus a small bounded-timeout fetch core and a curated, **empirically validated** catalog of NAF sector codes and INSEE commune codes.

**Why this library**: these APIs are excellent and free, but their docs are French-only, their conventions are uneven (ranged responses, `206` as a success, arrondissement quirks, privacy statuses), and no typed TypeScript client covers them together. This package encodes those sharp edges once, with tests.

- Zero runtime dependencies — global `fetch` only (Node 18+, Bun, Deno, edge runtimes)
- Strict TypeScript, every response fully typed
- Every record carries a `provenance` stamp (source, upstream record id, fetch time)

## Install

```sh
bun add french-open-data   # or npm / pnpm / yarn
```

The npm package is pending its first publication. Until then, install a packed
release artifact from this repository. Published releases contain compiled ESM
JavaScript and TypeScript declarations; Node 18+ can import them without a
TypeScript loader.

## Company search (keyless)

```ts
import { RechercheEntreprisesClient, MemoryCache, communeBySlug } from "french-open-data";

const client = new RechercheEntreprisesClient({ cache: new MemoryCache() });

const result = await client.search({
  naf: ["10.71C"],                                   // bakeries
  communeCodes: communeBySlug.get("lyon")!.inseeCodes, // all 9 arrondissements
  perPage: 25,
});

for (const company of result.records) {
  console.log(company.siren, company.name, company.city);
}
console.log(result.total, "matches;", result.maskedCount, "protected records masked");
```

Filters: free-text `query`, `naf` codes, `region`, `department`, `postalCode`, `communeCodes`, `headcountBands`, plus paging. Only active establishments are returned.

## BODACC legal announcements (keyless)

```ts
import { BodaccClient } from "french-open-data";

const bodacc = new BodaccClient();
const { announcements } = await bodacc.announcements({ siren: "552032534", limit: 10 });
// → [{ type: "Procédures collectives", date: "2026-01-15", summary: "…", provenance: {…} }]
```

## France Travail job offers (OAuth2)

Create a free application on [francetravail.io](https://francetravail.io) to get a client id/secret, then pass them explicitly — the library never reads environment variables:

```ts
import { FranceTravailClient } from "french-open-data";

const jobs = new FranceTravailClient({
  clientId: process.env.FT_CLIENT_ID!,      // your code decides where secrets come from
  clientSecret: process.env.FT_CLIENT_SECRET!,
});

const { offers } = await jobs.searchOffers({ keywords: "plombier", department: "69" });
```

## Design notes

- **Bounded timeouts, typed errors.** Every request runs under an `AbortController` deadline (default 10 s). All failures — timeout, network, non-2xx — throw a single `OpenDataError`; `error.status` carries the HTTP status when there is one.
- **Fail-open cache.** Company-search responses can be cached through a two-method `ResponseCache` interface (`get`/`set` with TTL) keyed by the deterministic request URL. A bundled `MemoryCache` is the default choice; plug in Redis or anything else. If the cache throws, the client silently falls back to a live request — a broken cache never breaks a lookup.
- **Token cache with safety margin.** France Travail access tokens (~25 min) are cached per client instance and refreshed 60 seconds *before* their announced expiry, so a token is never used in its race-prone final minute. `204` (no results) and `206` (partial ranged content) are handled as the normal responses they are, not errors.
- **Diffusion-P privacy masking, deny-by-default.** Sirene lets individuals restrict publication of their data (statut de diffusion "P" — *diffusion partielle*). This client removes those records **before** returning or caching anything and reports the removals via `maskedCount`. Deny-by-default because the safe failure mode is to show less: a bug in permissive filtering leaks protected personal data; a bug in restrictive filtering hides a row. The raw `diffusionStatus` is passed through on visible records so downstream code can re-apply its own checks.

## Catalog validation philosophy

`NAF_SECTORS` (37 sectors → NAF 2008 codes) and `COMMUNES` (60+ major cities → INSEE codes, arrondissement-aware for Paris/Lyon/Marseille) are validated **against the live API**, not against documentation:

```sh
bun run validate:catalog   # live smoke test — NOT run in CI
```

Every NAF code must return companies nationwide and every commune code must return restaurants (present in any city of this size); a single zero fails the script. This catches the classic silent failures — retired NAF codes, and the Paris/Lyon/Marseille trap where establishments are registered under arrondissement codes, so filtering by the parent commune code returns nothing.

## Development

```sh
bun install
bun run typecheck && bun run lint && bun run test
bun run build && node scripts/smoke-package.mjs
```

Tests mock `fetch` — CI never touches the live APIs.

## License

[MIT](LICENSE) © 2026 Andréas Bodin
