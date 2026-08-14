/**
 * Curated catalog of common business sectors mapped to their NAF 2008 (APE)
 * codes, usable directly as the `naf` filter of
 * {@link RechercheEntreprisesClient.search}.
 *
 * Every code is validated EMPIRICALLY against the live API by
 * `scripts/validate-catalog.ts`: a code that returns zero companies
 * nationwide is treated as wrong data and fails the script. Never add a
 * sector without re-running it.
 */

export interface NafSector {
  /** URL-safe identifier, e.g. "boulangeries". */
  slug: string;
  /** French label. */
  labelFr: string;
  /** English label. */
  labelEn: string;
  /** NAF 2008 codes for this sector (OR-combined when searching). */
  nafCodes: string[];
}

export const NAF_SECTORS: NafSector[] = [
  { slug: "boulangeries", labelFr: "Boulangeries", labelEn: "Bakeries", nafCodes: ["10.71C"] },
  { slug: "patisseries", labelFr: "Pâtisseries", labelEn: "Pastry shops", nafCodes: ["10.71D"] },
  { slug: "restaurants", labelFr: "Restaurants", labelEn: "Restaurants", nafCodes: ["56.10A"] },
  { slug: "cafes-bars", labelFr: "Cafés et bars", labelEn: "Cafés & bars", nafCodes: ["56.30Z"] },
  { slug: "traiteurs", labelFr: "Traiteurs", labelEn: "Caterers", nafCodes: ["56.21Z"] },
  { slug: "hotels", labelFr: "Hôtels", labelEn: "Hotels", nafCodes: ["55.10Z"] },
  { slug: "coiffeurs", labelFr: "Salons de coiffure", labelEn: "Hair salons", nafCodes: ["96.02A"] },
  { slug: "instituts-de-beaute", labelFr: "Instituts de beauté", labelEn: "Beauty salons", nafCodes: ["96.02B"] },
  { slug: "plombiers", labelFr: "Plombiers", labelEn: "Plumbers", nafCodes: ["43.22A"] },
  { slug: "electriciens", labelFr: "Électriciens", labelEn: "Electricians", nafCodes: ["43.21A"] },
  { slug: "macons", labelFr: "Maçons", labelEn: "Masons", nafCodes: ["43.99C"] },
  { slug: "peintres-en-batiment", labelFr: "Peintres en bâtiment", labelEn: "Painting companies", nafCodes: ["43.34Z"] },
  { slug: "menuisiers", labelFr: "Menuisiers", labelEn: "Carpenters", nafCodes: ["43.32A"] },
  { slug: "couvreurs", labelFr: "Couvreurs", labelEn: "Roofers", nafCodes: ["43.91B"] },
  { slug: "paysagistes", labelFr: "Paysagistes", labelEn: "Landscapers", nafCodes: ["81.30Z"] },
  { slug: "societes-de-nettoyage", labelFr: "Sociétés de nettoyage", labelEn: "Cleaning companies", nafCodes: ["81.21Z"] },
  { slug: "garages-automobiles", labelFr: "Garages automobiles", labelEn: "Car repair shops", nafCodes: ["45.20A"] },
  { slug: "controle-technique", labelFr: "Centres de contrôle technique", labelEn: "Vehicle inspection centers", nafCodes: ["71.20A"] },
  { slug: "taxis", labelFr: "Taxis", labelEn: "Taxi companies", nafCodes: ["49.32Z"] },
  { slug: "demenageurs", labelFr: "Déménageurs", labelEn: "Moving companies", nafCodes: ["49.42Z"] },
  { slug: "agences-immobilieres", labelFr: "Agences immobilières", labelEn: "Real-estate agencies", nafCodes: ["68.31Z"] },
  { slug: "agences-de-voyage", labelFr: "Agences de voyage", labelEn: "Travel agencies", nafCodes: ["79.11Z"] },
  { slug: "agences-de-communication", labelFr: "Agences de communication", labelEn: "Advertising agencies", nafCodes: ["73.11Z"] },
  { slug: "agences-web", labelFr: "Agences web et studios de développement", labelEn: "Web agencies & dev studios", nafCodes: ["62.01Z"] },
  { slug: "experts-comptables", labelFr: "Experts-comptables", labelEn: "Accounting firms", nafCodes: ["69.20Z"] },
  { slug: "avocats", labelFr: "Cabinets d'avocats", labelEn: "Law firms", nafCodes: ["69.10Z"] },
  { slug: "architectes", labelFr: "Architectes", labelEn: "Architecture firms", nafCodes: ["71.11Z"] },
  { slug: "photographes", labelFr: "Photographes", labelEn: "Photographers", nafCodes: ["74.20Z"] },
  { slug: "pharmacies", labelFr: "Pharmacies", labelEn: "Pharmacies", nafCodes: ["47.73Z"] },
  { slug: "boucheries", labelFr: "Boucheries", labelEn: "Butcher shops", nafCodes: ["47.22Z"] },
  { slug: "fleuristes", labelFr: "Fleuristes", labelEn: "Florists", nafCodes: ["47.76Z"] },
  { slug: "librairies", labelFr: "Librairies", labelEn: "Bookstores", nafCodes: ["47.61Z"] },
  { slug: "opticiens", labelFr: "Opticiens", labelEn: "Opticians", nafCodes: ["47.78A"] },
  { slug: "salles-de-sport", labelFr: "Salles de sport", labelEn: "Gyms", nafCodes: ["93.13Z"] },
  { slug: "auto-ecoles", labelFr: "Auto-écoles", labelEn: "Driving schools", nafCodes: ["85.53Z"] },
  { slug: "veterinaires", labelFr: "Vétérinaires", labelEn: "Veterinarians", nafCodes: ["75.00Z"] },
  { slug: "dentistes", labelFr: "Cabinets dentaires", labelEn: "Dental practices", nafCodes: ["86.23Z"] },
];

export const nafSectorBySlug: ReadonlyMap<string, NafSector> = new Map(
  NAF_SECTORS.map((sector) => [sector.slug, sector]),
);
