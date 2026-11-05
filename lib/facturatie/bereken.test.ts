import { describe, expect, it } from "vitest";
import { INSTELLINGEN_KERNKOZIJNEN as inst } from "../offerte/instellingen";
import { berekenOfferte } from "../offerte/bereken";
import { bedrijfsgegevensCompleet } from "./bedrijf";
import { begroeting, betaaldagen, factuurTeksten, isTeLaat, maakFactuurplan, openstaand, splitsBtw, vervaldatum } from "./bereken";

describe("splitsBtw", () => {
  it("telt exact op tot het totaal en volgt de regel 21% over 70% en 9% over 30%", () => {
    const s = splitsBtw(11740, inst);
    expect(s.exclBtw).toBe(10000);
    expect(s.btwHoog).toBe(1470);
    expect(s.btwLaag).toBe(270);
    expect(s.exclBtw + s.btwHoog + s.btwLaag).toBeCloseTo(s.totaal, 2);
  });
  it("blijft op de cent kloppen bij lastige bedragen", () => {
    for (const bedrag of [0.01, 99.99, 1234.56, 3521.7, 9999.99, 0]) {
      const s = splitsBtw(bedrag, inst);
      expect(Math.round((s.exclBtw + s.btwHoog + s.btwLaag) * 100)).toBe(Math.round(bedrag * 100));
    }
  });
  it("sluit aan op de offerteberekening", () => {
    const o = berekenOfferte([{ id: "1", soort: "artikel", aantal: 1, prijs: 5871.23 }], inst);
    const s = splitsBtw(o.totaal, inst);
    expect(s.exclBtw).toBe(o.exclBtw);
    expect(s.btwHoog).toBe(o.btwHoog);
    expect(s.btwLaag).toBe(o.btwLaag);
  });
});

describe("factuurplan", () => {
  const termijnen = berekenOfferte([{ id: "1", soort: "artikel", aantal: 1, prijs: 10000 }], inst).termijnen;
  it("volgt de termijnen van de offerte zonder meerwerk", () => {
    const p = maakFactuurplan(termijnen, 0);
    expect(p.map((t) => t.bedrag)).toEqual([3000, 6500, 500]);
    expect(p.reduce((s, t) => s + t.bedrag, 0)).toBe(10000);
  });
  it("zet het meerwerk op de eindfactuur en nergens anders", () => {
    const p = maakFactuurplan(termijnen, 271.5);
    expect(p[0].meerwerk).toBe(0);
    expect(p[1].meerwerk).toBe(0);
    expect(p[2]).toMatchObject({ meerwerk: 271.5, bedragOfferte: 500, bedrag: 771.5 });
  });
  it("laat minderwerk de eindfactuur verlagen", () => {
    expect(maakFactuurplan(termijnen, -200)[2].bedrag).toBe(300);
  });
});

describe("betaling", () => {
  it("geeft de betaaltermijnen uit de voorwaarden", () => {
    expect([1, 2, 3].map(betaaldagen)).toEqual([3, 0, 3]);
  });
  it("rekent de vervaldatum, ook over een maandwissel en schrikkeljaar", () => {
    expect(vervaldatum("2026-11-05", 3)).toBe("2026-11-08");
    expect(vervaldatum("2026-11-29", 3)).toBe("2026-12-02");
    expect(vervaldatum("2028-02-27", 3)).toBe("2028-03-01");
    expect(vervaldatum("2026-11-05", 0)).toBe("2026-11-05");
  });
  it("berekent het openstaande bedrag", () => {
    expect(openstaand(3000, [])).toBe(3000);
    expect(openstaand(3000, [1000, 500.5])).toBe(1499.5);
    expect(openstaand(3000, [3000])).toBe(0);
  });
  it("herkent een te late factuur", () => {
    expect(isTeLaat("open", "2026-11-08", "2026-11-09")).toBe(true);
    expect(isTeLaat("open", "2026-11-08", "2026-11-08")).toBe(false);
    expect(isTeLaat("betaald", "2026-11-08", "2026-11-20")).toBe(false);
  });
});

describe("teksten", () => {
  it("noemt de voorwaarden vriendelijk per termijn", () => {
    expect(factuurTeksten(1, 30, false).toelichting).toContain("binnen 3 dagen");
    expect(factuurTeksten(2, 65, false).toelichting).toContain("vandaag");
    expect(factuurTeksten(3, 5, true).omschrijving).toContain("meer- en minderwerk");
    expect(factuurTeksten(3, 5, false).omschrijving).not.toContain("meer- en minderwerk");
  });
  it("meldt dat de bedrijfsgegevens nog ontbreken zolang er placeholders staan", () => {
    expect(bedrijfsgegevensCompleet()).toBe(false);
    expect(bedrijfsgegevensCompleet({ iban: "NL00BANK0123456789", kvk: "12345678", btwNummer: "NL123456789B01" })).toBe(true);
  });
});

describe("begroeting", () => {
  it("volgt de aanhef van de klant", () => {
    expect(begroeting("dhr", "Jansen", "Jan Jansen")).toBe("Beste heer Jansen,");
    expect(begroeting("mevr", "De Vries", "Els de Vries")).toBe("Beste mevrouw De Vries,");
    expect(begroeting(null, null, "VvE De Linde")).toBe("Beste heer/mevrouw VvE De Linde,");
  });
});
