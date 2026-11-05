import { describe, expect, it } from "vitest";
import { berekenOfferte, kortingToegestaan } from "./bereken";
import { INSTELLINGEN_KERNKOZIJNEN as inst } from "./instellingen";
import type { OfferteRegel } from "./types";

const positie = (prijs: number, aantal = 1): OfferteRegel => ({ id: `p${prijs}`, soort: "positie", positieId: `x${prijs}`, aantal, prijs });
const optelling = (b: ReturnType<typeof berekenOfferte>) => Math.round((b.exclBtw + b.btwHoog + b.btwLaag) * 100);

describe("berekenOfferte", () => {
  it("telt posities en artikelregels op tot het subtotaal", () => {
    const b = berekenOfferte([positie(2170), positie(5360), { id: "a", soort: "artikel", aantal: 2, prijs: 450 }], inst);
    expect(b.subtotaal).toBe(8430);
    expect(b.totaal).toBe(8430);
  });
  it("laat koppen en tekst buiten het bedrag", () => {
    const b = berekenOfferte([{ id: "k", soort: "kop", titel: "Voorzijde", aantal: 1, prijs: 999 }, { id: "t", soort: "tekst", tekst: "x", aantal: 1, prijs: 999 }, positie(1000)], inst);
    expect(b.totaal).toBe(1000);
  });
  it("splitst de btw 21% over 70% en 9% over 30% van het bedrag excl. btw", () => {
    const b = berekenOfferte([positie(10810)], inst);
    expect(b.exclBtw).toBeCloseTo(10810 / 1.174, 2);
    expect(b.btwHoog).toBeCloseTo(b.exclBtw * 0.7 * 0.21, 1);
    expect(b.btwLaag).toBeCloseTo(b.exclBtw * 0.3 * 0.09, 1);
  });
  it("laat excl. btw plus btw altijd exact optellen tot het totaal", () => {
    for (const bedrag of [1, 99.99, 1234.56, 10810, 52300.01, 0.5]) {
      const b = berekenOfferte([positie(bedrag)], inst);
      expect(optelling(b)).toBe(Math.round(b.totaal * 100));
    }
  });
  it("rekent procentuele korting over het subtotaal", () => {
    const b = berekenOfferte([positie(10000), { id: "k", soort: "korting", modus: "percentage", waarde: 5, aantal: 1, prijs: 0 }], inst);
    expect(b.korting).toBe(500);
    expect(b.totaal).toBe(9500);
    expect(b.kortingPct).toBeCloseTo(5);
  });
  it("rekent kortingen in bedrag en procent bij elkaar op", () => {
    const b = berekenOfferte([positie(10000), { id: "k1", soort: "korting", modus: "bedrag", waarde: 250, aantal: 1, prijs: 0 }, { id: "k2", soort: "korting", modus: "percentage", waarde: 10, aantal: 1, prijs: 0 }], inst);
    expect(b.korting).toBe(1250);
  });
  it("laat korting nooit boven het subtotaal uitkomen", () => {
    const b = berekenOfferte([positie(100), { id: "k", soort: "korting", modus: "bedrag", waarde: 500, aantal: 1, prijs: 0 }], inst);
    expect(b.totaal).toBe(0);
    expect(b.kortingPct).toBe(100);
  });
  it("verdeelt het totaal over de termijnen, 30/65/5, zonder rest", () => {
    const b = berekenOfferte([positie(9188.5)], inst);
    expect(b.termijnen.map((t) => t.pct)).toEqual([30, 65, 5]);
    expect(Math.round(b.termijnen.reduce((s, t) => s + t.bedrag, 0) * 100)).toBe(918850);
    expect(b.termijnen[0].bedrag).toBe(2756.55);
  });
  it("werkt met een lege offerte", () => {
    const b = berekenOfferte([], inst);
    expect(b.totaal).toBe(0);
    expect(b.kortingPct).toBe(0);
  });
});

describe("kortingToegestaan", () => {
  it("staat gewone gebruikers tot en met 10% toe", () => {
    expect(kortingToegestaan(10, "verkoop", inst)).toBe(true);
    expect(kortingToegestaan(10.01, "verkoop", inst)).toBe(false);
    expect(kortingToegestaan(10.01, "kantoor", inst)).toBe(false);
    expect(kortingToegestaan(10.01, null, inst)).toBe(false);
  });
  it("laat de directie onbeperkt korting geven", () => {
    expect(kortingToegestaan(60, "directie", inst)).toBe(true);
  });
});

describe("handmatige prijsaanpassing", () => {
  const regel = (o: Partial<OfferteRegel>): OfferteRegel => ({ id: "r", soort: "positie", positieId: "x", aantal: 1, prijs: 1000, ...o });

  it("rekent met de overschreven prijs en bewaart de berekende prijs als basis", () => {
    const b = berekenOfferte([regel({ prijsOverride: 900 })], inst);
    expect(b.subtotaal).toBe(900);
    expect(b.basisSubtotaal).toBe(1000);
    expect(b.verlagingPct).toBeCloseTo(10);
  });
  it("telt een prijsverhoging niet mee als verlaging", () => {
    const b = berekenOfferte([regel({ prijsOverride: 1200 })], inst);
    expect(b.totaal).toBe(1200);
    expect(b.verlagingPct).toBe(0);
  });
  it("neemt een eigen totaalprijs over en toont het verschil als aanpassing", () => {
    const b = berekenOfferte([regel({ prijs: 10360 })], inst, { totaalOverride: 10000 });
    expect(b.totaal).toBe(10000);
    expect(b.aanpassing).toBe(-360);
    expect(b.verlagingPct).toBeCloseTo(3.475, 2);
    expect(Math.round((b.exclBtw + b.btwHoog + b.btwLaag) * 100)).toBe(1000000);
    expect(b.termijnen.reduce((s, t) => s + t.bedrag, 0)).toBeCloseTo(10000, 2);
  });
  it("telt korting, regelprijs en totaalprijs samen mee voor de kortinggrens", () => {
    const regels = [regel({ prijsOverride: 950 }), { id: "k", soort: "korting", modus: "percentage", waarde: 5, aantal: 1, prijs: 0 } as OfferteRegel];
    const b = berekenOfferte(regels, inst);
    expect(b.verlagingPct).toBeCloseTo(9.75, 2);
    const c = berekenOfferte(regels, inst, { totaalOverride: 850 });
    expect(c.verlagingPct).toBeCloseTo(15, 5);
    expect(kortingToegestaan(c.verlagingPct, "verkoop", inst)).toBe(false);
    expect(kortingToegestaan(c.verlagingPct, "directie", inst)).toBe(true);
  });
  it("laat een lege totaalprijs de berekende prijs gebruiken", () => {
    expect(berekenOfferte([regel({})], inst, { totaalOverride: null }).totaal).toBe(1000);
  });
});
