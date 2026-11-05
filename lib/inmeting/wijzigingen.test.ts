import { describe, expect, it } from "vitest";
import { REGELS_KERNKOZIJNEN as regels } from "../prijs/regels-kernkozijnen";
import type { Configuratie } from "../prijs/types";
import { beschrijfWijziging, heeftWijziging, leesWijzigingen, meerprijsConfiguratie, pasVoorstelToe } from "./wijzigingen";

const p = regels.producten.raam;
const oud: Configuratie = { product: "raam", variant: p.variants[0].key, w: 1200, h: 1200, glas: Object.keys(regels.glas)[0], kleur: Object.keys(regels.kleuren)[0], beslag: Object.keys(regels.beslag)[0], binnen: Object.keys(regels.binnen)[0], profiel: Object.keys(regels.profielen)[0], cols: null };

describe("wijzigingen tijdens de inmeting", () => {
  it("verandert alleen de toegestane velden", () => {
    const nieuw = pasVoorstelToe(oud, { variant: oud.variant, cols: null, kleur: Object.keys(regels.kleuren)[1], kleurVleugel: null, glas: oud.glas });
    expect(nieuw.w).toBe(1200);
    expect(nieuw.product).toBe("raam");
    expect(nieuw.beslag).toBe(oud.beslag);
    expect(nieuw.kleur).not.toBe(oud.kleur);
  });

  it("rekent geen meerprijs bij een ongewijzigde configuratie", () => {
    expect(meerprijsConfiguratie(regels, oud, { ...oud }, 2)).toBe(0);
    expect(heeftWijziging(oud, { ...oud })).toBe(false);
  });

  it("rekent het verschil voor het totale aantal en geeft een negatieve prijs bij goedkoper", () => {
    const kleur = Object.entries(regels.kleuren).find(([, k]) => k.mult > regels.kleuren[oud.kleur].mult)?.[0];
    expect(kleur).toBeDefined();
    const duurder = { ...oud, kleur: kleur! };
    const een = meerprijsConfiguratie(regels, oud, duurder, 1);
    expect(een).toBeGreaterThan(0);
    expect(meerprijsConfiguratie(regels, oud, duurder, 3)).toBeCloseTo(een * 3, 2);
    expect(meerprijsConfiguratie(regels, duurder, oud, 1)).toBeCloseTo(-een, 2);
  });

  it("weigert onbekende keuzes", () => {
    expect(() => meerprijsConfiguratie(regels, oud, { ...oud, glas: "bestaat-niet" }, 1)).toThrow();
    expect(() => meerprijsConfiguratie(regels, oud, { ...oud, kleur: "bestaat-niet" }, 1)).toThrow();
  });

  it("beschrijft wat er verandert", () => {
    const kleur = Object.keys(regels.kleuren)[1];
    expect(beschrijfWijziging(regels, oud, { ...oud, kleur })).toContain("kleur");
    expect(beschrijfWijziging(regels, oud, { ...oud })).toBe("Geen wijziging");
  });

  it("leest alleen geldige rijen uit de database", () => {
    const uit = leesWijzigingen([
      { id: "a", soort: "extra", status: "voorgesteld", meerprijs: "12.5", omschrijving: "Raamdorpel", aantal: 2, positie_id: null },
      { id: "b", soort: "onbekend", status: "voorgesteld", meerprijs: 1 },
      null,
    ]);
    expect(uit).toHaveLength(1);
    expect(uit[0].meerprijs).toBe(12.5);
  });
});
