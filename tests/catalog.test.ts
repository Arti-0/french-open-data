import { describe, expect, test } from "bun:test";
import { NAF_SECTORS, nafSectorBySlug } from "../src/catalog/naf";
import {
  arrondissementCodes,
  COMMUNES,
  communeBySlug,
} from "../src/catalog/communes";

// Structural checks only — live validation against the API is
// scripts/validate-catalog.ts, which is deliberately NOT part of CI.

describe("NAF catalog", () => {
  test("slugs are unique and indexed", () => {
    expect(new Set(NAF_SECTORS.map((s) => s.slug)).size).toBe(
      NAF_SECTORS.length,
    );
    expect(nafSectorBySlug.get("restaurants")?.nafCodes).toEqual(["56.10A"]);
  });

  test("every code has the NAF 2008 shape NN.NNL", () => {
    for (const sector of NAF_SECTORS) {
      expect(sector.nafCodes.length).toBeGreaterThan(0);
      for (const code of sector.nafCodes) {
        expect(code).toMatch(/^\d{2}\.\d{2}[A-Z]$/);
      }
    }
  });
});

describe("commune catalog", () => {
  test("slugs are unique and indexed", () => {
    expect(new Set(COMMUNES.map((c) => c.slug)).size).toBe(COMMUNES.length);
    expect(communeBySlug.get("bordeaux")?.inseeCodes).toEqual(["33063"]);
  });

  test("every INSEE code is five digits and starts with the department", () => {
    for (const commune of COMMUNES) {
      expect(commune.inseeCodes.length).toBeGreaterThan(0);
      for (const code of commune.inseeCodes) {
        expect(code).toMatch(/^\d{5}$/);
        expect(code.startsWith(commune.department)).toBe(true);
      }
    }
  });

  test("arrondissement cities carry arrondissement codes, not the parent commune", () => {
    expect(communeBySlug.get("paris")?.inseeCodes).toHaveLength(20);
    expect(communeBySlug.get("paris")?.inseeCodes[0]).toBe("75101");
    expect(communeBySlug.get("paris")?.inseeCodes).not.toContain("75056");
    expect(communeBySlug.get("marseille")?.inseeCodes).toHaveLength(16);
    expect(communeBySlug.get("lyon")?.inseeCodes).toEqual([
      "69381",
      "69382",
      "69383",
      "69384",
      "69385",
      "69386",
      "69387",
      "69388",
      "69389",
    ]);
  });
});

describe("arrondissementCodes", () => {
  test("builds a zero-padded range under a prefix", () => {
    expect(arrondissementCodes("751", 1, 3)).toEqual([
      "75101",
      "75102",
      "75103",
    ]);
    expect(arrondissementCodes("132", 15, 16)).toEqual(["13215", "13216"]);
  });
});
