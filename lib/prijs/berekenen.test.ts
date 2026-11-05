import { describe, expect, it } from "vitest";
import golden from "./prijs.golden.json";
import { PrijsFout, berekenPrijs, softCap } from "./berekenen";
import { REGELS_KERNKOZIJNEN as regels } from "./regels-kernkozijnen";
import type { Configuratie } from "./types";

describe("prijs gelijk aan de website-configurator", () => {
  it(`komt voor alle ${golden.gevallen.length} gouden gevallen exact overeen`, () => {
    const afwijkend = golden.gevallen
      .map((g) => ({ g, nu: berekenPrijs(regels, g.cfg as Configuratie).prijs }))
      .filter(({ g, nu }) => nu !== g.prijs)
      .map(({ g, nu }) => `${g.cfg.product}/${g.cfg.variant} ${g.cfg.w}x${g.cfg.h}: website ${g.prijs}, CRM ${nu}`);
    expect(afwijkend).toEqual([]);
  });

  it("dekt alle producten en alle indelingen", () => {
    const aantalVarianten = Object.values(regels.producten).reduce((n, p) => n + p.variants.length, 0);
    expect(golden.gevallen.length).toBe(aantalVarianten * 3);
  });
});

describe("bekende stelposten (prijzen.py, 21-10-2026)", () => {
  const basis = { glas: "hrpp", kleur: "wit", beslag: "rc2", binnen: "witglad" };
  const op = (product: string, variant: string, profiel: string): Configuratie => {
    const p = regels.producten[product];
    return { product, variant, w: p.wDef, h: p.hDef, profiel, ...basis };
  };
  it("raam Schüco kost € 2.100 bij de standaardmaat van 1,20 m²", () => {
    // 1000 x 1200 mm = 1,20 m² = de standaardmaat, dus geen meerprijs
    expect(berekenPrijs(regels, op("raam", "draaikiep", "schuco")).prijs).toBe(2100);
  });
  it("raam Aluplast kost € 1.890", () => {
    expect(berekenPrijs(regels, op("raam", "draaikiep", "aluplast")).prijs).toBe(1890);
  });
});

describe("berekenPrijs", () => {
  const cfg: Configuratie = { product: "raam", variant: "draaikiep", w: 1000, h: 1200, glas: "hrpp", kleur: "wit", beslag: "rc2", binnen: "witglad", profiel: "schuco" };

  it("rekent meerprijs per m² boven de standaardmaat", () => {
    const r = berekenPrijs(regels, { ...cfg, w: 1500, h: 1200 }); // 1,8 m²
    expect(r.basis).toBeCloseTo(2100 + 0.6 * 385, 6);
  });
  it("gebruikt bij twee kleuren de duurste factor", () => {
    const een = berekenPrijs(regels, { ...cfg, kleur: "antraciet" });
    const twee = berekenPrijs(regels, { ...cfg, kleur: "wit", kleurVleugel: "antraciet" });
    expect(twee.factoren.kleur).toBe(een.factoren.kleur);
  });
  it("laat de prijs nooit boven het plafond uitkomen", () => {
    const r = berekenPrijs(regels, { ...cfg, w: 3000, h: 2400, glas: "triple", kleur: "staalblauw", beslag: "rc3", binnen: "structuur", variant: "dk_l_boven" });
    expect(r.prijs).toBeLessThanOrEqual(regels.producten.raam.priceMax);
    expect(r.plafondActief).toBe(true);
  });
  it("waarschuwt bij een maat buiten het bereik, maar rekent door", () => {
    const r = berekenPrijs(regels, { ...cfg, w: 200 });
    expect(r.waarschuwingen).toHaveLength(1);
    expect(r.prijs).toBeGreaterThan(0);
  });
  it("weigert onbekende keuzes in plaats van stil iets anders te rekenen", () => {
    expect(() => berekenPrijs(regels, { ...cfg, glas: "bestaat-niet" })).toThrow(PrijsFout);
    expect(() => berekenPrijs(regels, { ...cfg, variant: "bestaat-niet" })).toThrow(PrijsFout);
    expect(() => berekenPrijs(regels, { ...cfg, w: 0 })).toThrow(PrijsFout);
  });
  it("maakt een andere vakindeling duurder of goedkoper, nooit gratis", () => {
    const vast = berekenPrijs(regels, { ...cfg, cols: ["fixed"] });
    expect(vast.prijs).toBeLessThan(berekenPrijs(regels, cfg).prijs);
  });
});

describe("softCap", () => {
  it("laat lage prijzen ongemoeid", () => expect(softCap(1000, 3000)).toBe(1000));
  it("buigt af tot het maximum", () => {
    expect(softCap(100000, 3000)).toBeCloseTo(3000, 3);
    expect(softCap(2500, 3000)).toBeLessThan(2500);
  });
});
