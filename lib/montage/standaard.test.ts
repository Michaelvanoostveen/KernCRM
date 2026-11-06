import { describe, expect, it } from "vitest";
import { schoonNaam, STANDAARD_MONTEURS, STANDAARD_PLOEGEN } from "./standaard";

describe("standaard opstelling", () => {
  it("heeft zeven monteurs en drie ploegen van twee", () => {
    expect(STANDAARD_MONTEURS).toHaveLength(7);
    expect(STANDAARD_PLOEGEN).toHaveLength(3);
    expect(STANDAARD_PLOEGEN.every((p) => p.leden.length === 2)).toBe(true);
  });
  it("zet niemand in twee ploegen en gebruikt alleen bestaande monteurs", () => {
    const leden = STANDAARD_PLOEGEN.flatMap((p) => p.leden);
    expect(new Set(leden).size).toBe(leden.length);
    for (const l of leden) expect(STANDAARD_MONTEURS).toContain(l);
    expect(STANDAARD_MONTEURS.filter((m) => !leden.includes(m))).toEqual(["Jeremy"]);
  });
  it("heeft unieke namen", () => {
    expect(new Set(STANDAARD_MONTEURS).size).toBe(7);
    expect(new Set(STANDAARD_PLOEGEN.map((p) => p.naam)).size).toBe(3);
  });
});

describe("schoonNaam", () => {
  it("ruimt spaties op en weigert een lege naam", () => {
    expect(schoonNaam("  Jan   de  Vries ")).toBe("Jan de Vries");
    expect(schoonNaam("   ")).toBeNull();
    expect(schoonNaam(null)).toBeNull();
    expect(schoonNaam("x".repeat(100))).toHaveLength(60);
  });
});

import { dagLabel, leesMonteurDetail, leesMonteurOverzicht } from "./monteur";

describe("monteur-gegevens", () => {
  it("leest alleen geldige rijen en detailgegevens", () => {
    expect(leesMonteurOverzicht([{ id: "a" }, { id: 5 }, null, "x"])).toHaveLength(1);
    expect(leesMonteurOverzicht(null)).toEqual([]);
    expect(leesMonteurDetail(null)).toBeNull();
    expect(leesMonteurDetail({ id: "a" })).toBeNull();
    expect(leesMonteurDetail({ id: "a", posities: [] })?.collegas).toEqual([]);
  });
  it("noemt de dag in gewone woorden", () => {
    expect(dagLabel("2026-11-09", "2026-11-09")).toBe("Vandaag");
    expect(dagLabel("2026-11-10", "2026-11-09")).toBe("Morgen");
    expect(dagLabel("2026-11-08", "2026-11-09")).toBe("Gisteren");
    expect(dagLabel("2026-11-12", "2026-11-09")).toContain("donderdag");
  });
});
