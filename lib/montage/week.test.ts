import { describe, expect, it } from "vitest";
import { factuurActies } from "./factuurhint";
import { eersteWerkdag, isWerkdag, isoWeekdag, montageOpDag, plusDagen, weekNummer, weekStart, werkdagEind, werkweek } from "./week";

describe("weken en werkdagen", () => {
  it("vindt de maandag en de werkweek", () => {
    expect(weekStart("2026-11-05")).toBe("2026-11-02"); // donderdag
    expect(weekStart("2026-11-08")).toBe("2026-11-02"); // zondag
    expect(weekStart("2026-11-02")).toBe("2026-11-02");
    expect(werkweek("2026-11-02")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
  });
  it("rekent door de maandwissel en de wisseling van zomer- naar wintertijd", () => {
    expect(plusDagen("2026-10-31", 1)).toBe("2026-11-01");
    expect(plusDagen("2026-10-25", 1)).toBe("2026-10-26");
    expect(plusDagen("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("herkent werkdagen en slaat het weekend over", () => {
    expect(isoWeekdag("2026-11-08")).toBe(7);
    expect(isWerkdag("2026-11-07")).toBe(false);
    expect(eersteWerkdag("2026-11-07")).toBe("2026-11-09");
    expect(eersteWerkdag("2026-11-09")).toBe("2026-11-09");
  });
  it("telt het einde van een montage in werkdagen, gelijk aan de database", () => {
    expect(werkdagEind("2026-11-06", 3)).toBe("2026-11-10"); // vrijdag, maandag, dinsdag
    expect(werkdagEind("2026-11-09", 5)).toBe("2026-11-13");
    expect(werkdagEind("2026-11-09", 1)).toBe("2026-11-09");
    expect(() => werkdagEind("2026-11-07", 2)).toThrow();
    expect(() => werkdagEind("2026-11-09", 0)).toThrow();
  });
  it("geeft het ISO-weeknummer", () => {
    expect(weekNummer("2026-11-05")).toBe(45);
    expect(weekNummer("2026-01-01")).toBe(1);
    expect(weekNummer("2027-01-01")).toBe(53);
  });
  it("laat een montage op de juiste dagen zien en geannuleerde niet", () => {
    const m = { id: "m", ploegId: "p", startDatum: "2026-11-06", eindDatum: "2026-11-10", status: "definitief" };
    expect(montageOpDag(m, "2026-11-06")).toBe(true);
    expect(montageOpDag(m, "2026-11-10")).toBe(true);
    expect(montageOpDag(m, "2026-11-11")).toBe(false);
    expect(montageOpDag({ ...m, status: "geannuleerd" }, "2026-11-06")).toBe(false);
  });
});

describe("factuuracties uit de montage", () => {
  const f = (termijn: number, status = "open") => ({ projectId: "p", termijn, status });
  it("zet de 65%-factuur klaar op de eerste montagedag", () => {
    const m = [{ projectId: "p", status: "definitief", startDatum: "2026-11-09", eindDatum: "2026-11-11" }];
    expect(factuurActies(m, [f(1)], "2026-11-09")).toMatchObject([{ projectId: "p", termijn: 2 }]);
    expect(factuurActies(m, [f(1)], "2026-11-06")).toEqual([]);
    expect(factuurActies(m, [f(1), f(2)], "2026-11-09")).toEqual([]);
    expect(factuurActies(m, [], "2026-11-09")).toEqual([]);
  });
  it("wacht niet op een voorlopige montage", () => {
    expect(factuurActies([{ projectId: "p", status: "voorlopig", startDatum: "2026-11-09", eindDatum: "2026-11-09" }], [f(1)], "2026-11-12")).toEqual([]);
  });
  it("zet de eindfactuur klaar na afronden, en negeert een geannuleerde termijn 2", () => {
    const m = [{ projectId: "p", status: "afgerond", startDatum: "2026-11-09", eindDatum: "2026-11-11" }];
    expect(factuurActies(m, [f(1), f(2)], "2026-11-12")).toMatchObject([{ termijn: 3 }]);
    expect(factuurActies(m, [f(1), f(2), f(3)], "2026-11-12")).toEqual([]);
    expect(factuurActies(m, [f(1), f(2, "geannuleerd")], "2026-11-12")).toEqual([]);
  });
});
