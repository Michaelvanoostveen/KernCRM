import { describe, expect, it } from "vitest";
import { isdeIndicatie, isdeStukken, isIsdeStatus, schatGlasM2 } from "./isde";

const regels = { glas: { hrpp: { label: "HR++", mult: 1, isdeLow: 23, isdeHigh: 46 }, triple: { label: "Triple", mult: 1.25, isdeLow: 111, isdeHigh: 222 } } };

describe("ISDE", () => {
  it("schat glas als 80% van het oppervlak maal het aantal", () => {
    expect(schatGlasM2(1000, 1000, 1)).toBe(0.8);
    expect(schatGlasM2(1200, 1500, 2)).toBe(2.88);
    expect(schatGlasM2(0, 1500, 1)).toBe(0);
  });
  it("rekent de indicatie met de bedragen per m²", () => {
    expect(isdeIndicatie(regels, "triple", 2)).toEqual({ laag: 222, hoog: 444 });
    expect(isdeIndicatie(regels, "onbekend", 2)).toEqual({ laag: 0, hoog: 0 });
  });
  it("herkent geldige statussen", () => {
    expect(isIsdeStatus("toegekend")).toBe(true);
    expect(isIsdeStatus("x")).toBe(false);
  });
  it("beoordeelt de stukken", () => {
    const leeg = isdeStukken({ facturen: [], werkbonOpgeleverd: false, naFotos: 0 });
    expect(leeg.filter((s) => s.klaar === false).map((s) => s.sleutel)).toEqual(["factuur", "betaald", "fotos", "oplevering"]);
    const klaar = isdeStukken({ facturen: [{ status: "betaald" }, { status: "geannuleerd" }], werkbonOpgeleverd: true, naFotos: 3 });
    expect(klaar.filter((s) => s.klaar === true).map((s) => s.sleutel)).toEqual(["factuur", "betaald", "fotos", "oplevering"]);
    expect(klaar.find((s) => s.sleutel === "glas")?.klaar).toBeNull();
  });
  it("laat foto's onbekend voor wie ze niet mag zien", () => {
    expect(isdeStukken({ facturen: [], werkbonOpgeleverd: false, naFotos: null }).find((s) => s.sleutel === "fotos")?.klaar).toBeNull();
  });
});
