import { describe, expect, it } from "vitest";
import { PrijsFout } from "../prijs/berekenen";
import { REGELS_KERNKOZIJNEN as regels } from "../prijs/regels-kernkozijnen";
import { leesConfiguratie, positieOmschrijving, prijsVanConfiguratie, regelTotaal } from "./positie";
import { faseIndex, faseLabel } from "./fase";

const geldig = { product: "raam", variant: "stolp", w: "1400", h: 1200, glas: "hrpp", kleur: "wit", beslag: "rc2", binnen: "witglad", profiel: "schuco" };

describe("leesConfiguratie", () => {
  it("accepteert een geldige configuratie en maakt getallen van maten", () => {
    expect(leesConfiguratie(geldig)).toMatchObject({ w: 1400, h: 1200, kleurVleugel: null, cols: null });
  });
  it("weigert ontbrekende of onleesbare velden", () => {
    expect(() => leesConfiguratie(null)).toThrow(PrijsFout);
    expect(() => leesConfiguratie({ ...geldig, glas: "" })).toThrow(PrijsFout);
    expect(() => leesConfiguratie({ ...geldig, w: "abc" })).toThrow(PrijsFout);
  });
  it("negeert ongeldige vakken", () => {
    expect(leesConfiguratie({ ...geldig, cols: [1, 2] }).cols).toBeNull();
    expect(leesConfiguratie({ ...geldig, cols: ["fixed", "turnR"] }).cols).toEqual(["fixed", "turnR"]);
  });
});

describe("prijs en omschrijving", () => {
  it("rekent de prijs zelf uit", () => {
    expect(prijsVanConfiguratie(regels, leesConfiguratie(geldig))).toBeGreaterThan(2000);
  });
  it("zet een omschrijving samen", () => {
    expect(positieOmschrijving(regels, leesConfiguratie(geldig))).toBe("Raamkozijn · Stolpraam · 1400 × 1200 mm");
  });
  it("rondt regeltotalen op centen af", () => {
    expect(regelTotaal(2870, 3)).toBe(8610);
    expect(regelTotaal(0.1, 3)).toBe(0.3);
  });
});

describe("fasen", () => {
  it("kent labels en volgorde", () => {
    expect(faseLabel("inmeting")).toBe("Inmeting");
    expect(faseLabel("verloren")).toBe("Verloren");
    expect(faseIndex("offerte")).toBe(1);
    expect(faseIndex("verloren")).toBe(-1);
  });
});
