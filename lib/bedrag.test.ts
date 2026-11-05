import { describe, expect, it } from "vitest";
import { parseBedrag } from "./bedrag";

describe("parseBedrag", () => {
  it("leest Nederlandse en gewone notatie", () => {
    expect(parseBedrag("1.250,50")).toBe(1250.5);
    expect(parseBedrag("125,5")).toBe(125.5);
    expect(parseBedrag("125.5")).toBe(125.5);
    expect(parseBedrag("€ 3000")).toBe(3000);
    expect(parseBedrag("-200")).toBe(-200);
  });
  it("geeft null voor leeg en NaN voor onzin", () => {
    expect(parseBedrag("  ")).toBeNull();
    expect(parseBedrag(null)).toBeNull();
    expect(Number.isNaN(parseBedrag("abc"))).toBe(true);
  });
});
