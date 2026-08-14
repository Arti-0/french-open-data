/**
 * Catalog of major French cities with their INSEE commune codes, usable
 * directly as the `communeCodes` filter of
 * {@link RechercheEntreprisesClient.search} (city-precise, unlike the
 * department filter).
 *
 * Cities with arrondissements (Paris, Lyon, Marseille) list their
 * arrondissement codes: in the Sirene registry, establishments are attached
 * to the arrondissement code, never to the parent commune code — filtering
 * Paris by "75056" returns nothing.
 *
 * Every code is validated EMPIRICALLY against the live API by
 * `scripts/validate-catalog.ts` (a wrong code returns zero companies and
 * fails the script).
 */

export interface Commune {
  /** URL-safe identifier, e.g. "aix-en-provence". */
  slug: string;
  name: string;
  /** INSEE commune codes (multiple = arrondissement codes). */
  inseeCodes: string[];
  /** Department code, e.g. "13". */
  department: string;
}

/**
 * Arrondissement codes as prefix + zero-padded range, e.g.
 * `arrondissementCodes("751", 1, 20)` → `["75101", …, "75120"]` (Paris).
 */
export function arrondissementCodes(
  prefix: string,
  from: number,
  to: number,
): string[] {
  return Array.from(
    { length: to - from + 1 },
    (_, i) => `${prefix}${String(from + i).padStart(2, "0")}`,
  );
}

export const COMMUNES: Commune[] = [
  { slug: "paris", name: "Paris", inseeCodes: arrondissementCodes("751", 1, 20), department: "75" },
  { slug: "marseille", name: "Marseille", inseeCodes: arrondissementCodes("132", 1, 16), department: "13" },
  { slug: "lyon", name: "Lyon", inseeCodes: arrondissementCodes("693", 81, 89), department: "69" },
  { slug: "toulouse", name: "Toulouse", inseeCodes: ["31555"], department: "31" },
  { slug: "nice", name: "Nice", inseeCodes: ["06088"], department: "06" },
  { slug: "nantes", name: "Nantes", inseeCodes: ["44109"], department: "44" },
  { slug: "montpellier", name: "Montpellier", inseeCodes: ["34172"], department: "34" },
  { slug: "strasbourg", name: "Strasbourg", inseeCodes: ["67482"], department: "67" },
  { slug: "bordeaux", name: "Bordeaux", inseeCodes: ["33063"], department: "33" },
  { slug: "lille", name: "Lille", inseeCodes: ["59350"], department: "59" },
  { slug: "rennes", name: "Rennes", inseeCodes: ["35238"], department: "35" },
  { slug: "reims", name: "Reims", inseeCodes: ["51454"], department: "51" },
  { slug: "saint-etienne", name: "Saint-Étienne", inseeCodes: ["42218"], department: "42" },
  { slug: "toulon", name: "Toulon", inseeCodes: ["83137"], department: "83" },
  { slug: "le-havre", name: "Le Havre", inseeCodes: ["76351"], department: "76" },
  { slug: "grenoble", name: "Grenoble", inseeCodes: ["38185"], department: "38" },
  { slug: "dijon", name: "Dijon", inseeCodes: ["21231"], department: "21" },
  { slug: "angers", name: "Angers", inseeCodes: ["49007"], department: "49" },
  { slug: "nimes", name: "Nîmes", inseeCodes: ["30189"], department: "30" },
  { slug: "clermont-ferrand", name: "Clermont-Ferrand", inseeCodes: ["63113"], department: "63" },
  { slug: "villeurbanne", name: "Villeurbanne", inseeCodes: ["69266"], department: "69" },
  { slug: "le-mans", name: "Le Mans", inseeCodes: ["72181"], department: "72" },
  { slug: "aix-en-provence", name: "Aix-en-Provence", inseeCodes: ["13001"], department: "13" },
  { slug: "brest", name: "Brest", inseeCodes: ["29019"], department: "29" },
  { slug: "tours", name: "Tours", inseeCodes: ["37261"], department: "37" },
  { slug: "amiens", name: "Amiens", inseeCodes: ["80021"], department: "80" },
  { slug: "limoges", name: "Limoges", inseeCodes: ["87085"], department: "87" },
  { slug: "annecy", name: "Annecy", inseeCodes: ["74010"], department: "74" },
  { slug: "perpignan", name: "Perpignan", inseeCodes: ["66136"], department: "66" },
  { slug: "boulogne-billancourt", name: "Boulogne-Billancourt", inseeCodes: ["92012"], department: "92" },
  { slug: "orleans", name: "Orléans", inseeCodes: ["45234"], department: "45" },
  { slug: "metz", name: "Metz", inseeCodes: ["57463"], department: "57" },
  { slug: "besancon", name: "Besançon", inseeCodes: ["25056"], department: "25" },
  { slug: "rouen", name: "Rouen", inseeCodes: ["76540"], department: "76" },
  { slug: "mulhouse", name: "Mulhouse", inseeCodes: ["68224"], department: "68" },
  { slug: "caen", name: "Caen", inseeCodes: ["14118"], department: "14" },
  { slug: "nancy", name: "Nancy", inseeCodes: ["54395"], department: "54" },
  { slug: "avignon", name: "Avignon", inseeCodes: ["84007"], department: "84" },
  { slug: "poitiers", name: "Poitiers", inseeCodes: ["86194"], department: "86" },
  { slug: "versailles", name: "Versailles", inseeCodes: ["78646"], department: "78" },
  { slug: "pau", name: "Pau", inseeCodes: ["64445"], department: "64" },
  { slug: "la-rochelle", name: "La Rochelle", inseeCodes: ["17300"], department: "17" },
  { slug: "cannes", name: "Cannes", inseeCodes: ["06029"], department: "06" },
  { slug: "antibes", name: "Antibes", inseeCodes: ["06004"], department: "06" },
  { slug: "colmar", name: "Colmar", inseeCodes: ["68066"], department: "68" },
  { slug: "bourges", name: "Bourges", inseeCodes: ["18033"], department: "18" },
  { slug: "dunkerque", name: "Dunkerque", inseeCodes: ["59183"], department: "59" },
  { slug: "niort", name: "Niort", inseeCodes: ["79191"], department: "79" },
  { slug: "chambery", name: "Chambéry", inseeCodes: ["73065"], department: "73" },
  { slug: "troyes", name: "Troyes", inseeCodes: ["10387"], department: "10" },
  { slug: "lorient", name: "Lorient", inseeCodes: ["56121"], department: "56" },
  { slug: "saint-nazaire", name: "Saint-Nazaire", inseeCodes: ["44184"], department: "44" },
  { slug: "valence", name: "Valence", inseeCodes: ["26362"], department: "26" },
  { slug: "quimper", name: "Quimper", inseeCodes: ["29232"], department: "29" },
  { slug: "vannes", name: "Vannes", inseeCodes: ["56260"], department: "56" },
  { slug: "bayonne", name: "Bayonne", inseeCodes: ["64102"], department: "64" },
  { slug: "montauban", name: "Montauban", inseeCodes: ["82121"], department: "82" },
  { slug: "angouleme", name: "Angoulême", inseeCodes: ["16015"], department: "16" },
  { slug: "beziers", name: "Béziers", inseeCodes: ["34032"], department: "34" },
  { slug: "la-roche-sur-yon", name: "La Roche-sur-Yon", inseeCodes: ["85191"], department: "85" },
];

export const communeBySlug: ReadonlyMap<string, Commune> = new Map(
  COMMUNES.map((commune) => [commune.slug, commune]),
);
