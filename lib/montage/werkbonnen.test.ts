import { describe, expect, it } from "vitest";
import { filterWerkbonnen, isWerkbonFilter, type WerkbonRij } from "./werkbonnen";

const w = (id: string, o: Partial<WerkbonRij> = {}): WerkbonRij => ({ id, status: "open", aandacht: false, openPunten: 0, uren: 0, ...o });
const lijst = [w("a"), w("b", { status: "opgeleverd" }), w("c", { aandacht: true }), w("d", { status: "opgeleverd", openPunten: 2 })];

describe("werkbonnen filteren", () => {
  it("lopend toont alleen open werkbonnen", () => expect(filterWerkbonnen(lijst, "lopend").map((r) => r.id)).toEqual(["a", "c"]));
  it("opgeleverd toont alleen opgeleverde", () => expect(filterWerkbonnen(lijst, "opgeleverd").map((r) => r.id)).toEqual(["b", "d"]));
  it("aandacht toont wachtende kantoormeldingen en open opleverpunten", () => expect(filterWerkbonnen(lijst, "aandacht").map((r) => r.id)).toEqual(["c", "d"]));
  it("alle toont alles", () => expect(filterWerkbonnen(lijst, "alle")).toHaveLength(4));
  it("herkent alleen bekende filters", () => {
    expect(isWerkbonFilter("alle")).toBe(true);
    expect(isWerkbonFilter("x")).toBe(false);
    expect(isWerkbonFilter(undefined)).toBe(false);
  });
});
