import { describe, expect, it } from "vitest";
import { leesWerkbon, meerwerkTotaal, type Meerwerk } from "./werkbon";

const m = (meerprijs: number, status: Meerwerk["status"]): Meerwerk => ({ id: String(meerprijs) + status, positie_id: null, omschrijving: "x", aantal: 1, meerprijs, status });

describe("meerwerk op de werkbon", () => {
  it("telt het meerwerk per status op de cent op", () => {
    const lijst = [m(100.1, "voorgesteld"), m(0.2, "voorgesteld"), m(50, "akkoord")];
    expect(meerwerkTotaal(lijst, "voorgesteld")).toBe(100.3);
    expect(meerwerkTotaal(lijst, "akkoord")).toBe(50);
    expect(meerwerkTotaal([], "akkoord")).toBe(0);
  });
  it("leest meerwerk uit de werkbon, ook als het ontbreekt of als tekst binnenkomt", () => {
    const zonder = leesWerkbon({ id: "w1" });
    expect(zonder?.meerwerk).toEqual([]);
    const met = leesWerkbon({ id: "w1", meerwerk: [{ id: "a", positie_id: null, omschrijving: "Extra", aantal: "2", meerprijs: "121.00", status: "voorgesteld" }] });
    expect(met?.meerwerk[0].meerprijs).toBe(121);
    expect(met?.meerwerk[0].aantal).toBe(2);
  });
});
