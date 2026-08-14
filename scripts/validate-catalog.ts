/**
 * LIVE catalog smoke test — hits the real API Recherche d'Entreprises.
 *
 * NOT run in CI (network-dependent, ~1 min with rate-limit pauses). Run it
 * manually whenever a catalog entry is added or changed:
 *
 *     bun run validate:catalog
 *
 * Philosophy: the catalogs are only trustworthy because they are checked
 * against reality, not against documentation. Every NAF code must return
 * companies nationwide; every commune code must return restaurants (NAF
 * 56.10A — present in every city of this size). A zero means the code is
 * wrong → exit 1.
 */
import { RechercheEntreprisesClient } from "../src/company-search";
import { NAF_SECTORS } from "../src/catalog/naf";
import { COMMUNES } from "../src/catalog/communes";

const RESTAURANT_NAF = "56.10A";
const PAUSE_MS = 180; // stay well under the public rate limit

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const client = new RechercheEntreprisesClient();
let failures = 0;

console.log(`— ${NAF_SECTORS.length} NAF sectors (nationwide count)`);
for (const sector of NAF_SECTORS) {
  try {
    const res = await client.search({ naf: sector.nafCodes, perPage: 1 });
    if (res.total === 0) {
      failures++;
      console.error(
        `FAIL ${sector.slug} (${sector.nafCodes.join(",")}): 0 companies — wrong NAF code?`,
      );
    } else {
      console.log(`ok   ${sector.slug}: ${res.total}`);
    }
  } catch (err) {
    failures++;
    console.error(
      `FAIL ${sector.slug}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  await pause(PAUSE_MS);
}

console.log(`\n— ${COMMUNES.length} communes (restaurants per commune code)`);
for (const commune of COMMUNES) {
  try {
    const res = await client.search({
      naf: [RESTAURANT_NAF],
      communeCodes: commune.inseeCodes,
      perPage: 1,
    });
    if (res.total === 0) {
      failures++;
      console.error(
        `FAIL ${commune.slug} (${commune.inseeCodes[0]}…): 0 restaurants — wrong INSEE code?`,
      );
    } else {
      console.log(`ok   ${commune.slug}: ${res.total}`);
    }
  } catch (err) {
    failures++;
    console.error(
      `FAIL ${commune.slug}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  await pause(PAUSE_MS);
}

console.log(
  failures === 0 ? "\nCATALOG OK" : `\nCATALOG: ${failures} failure(s)`,
);
process.exit(failures === 0 ? 0 : 1);
