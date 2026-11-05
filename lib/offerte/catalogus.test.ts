import { describe, expect, it } from "vitest";
import artikelen from "./catalogus-kernkozijnen.json";

describe("standaardcatalogus KernKozijnen", () => {
  it("bevat 97 artikelen met unieke codes", () => {
    expect(artikelen).toHaveLength(97);
    expect(new Set(artikelen.map((a) => a.code)).size).toBe(97);
  });
  it("rekent de prijs incl. btw als excl. x 1,174, op de cent", () => {
    for (const a of artikelen) expect(a.verkoopprijs_incl).toBeCloseTo(Math.round(a.verkoopprijs_excl * 1.174 * 100) / 100, 2);
  });
  it("zet de groepen van de configurator en rolluiken en horren op inactief", () => {
    const inactief = artikelen.filter((a) => !a.actief).map((a) => a.groep.slice(0, 2));
    expect(new Set(inactief)).toEqual(new Set(["01", "02", "03", "04", "05", "07", "08"]));
    expect(artikelen.filter((a) => a.actief)).toHaveLength(41);
  });
  it("heeft geen negatieve of ontbrekende prijzen", () => {
    for (const a of artikelen) {
      expect(a.verkoopprijs_excl).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(a.verkoopprijs_incl)).toBe(true);
    }
  });
});
