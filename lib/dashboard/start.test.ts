import { describe, expect, it } from "vitest";
import { begroeting, bepaalActies, groepeerPijplijn, type StartItem } from "./start";

const nu = new Date("2026-11-10T09:00:00Z");
const dag = (n: number) => new Date(nu.getTime() - n * 86_400_000).toISOString();
const item = (o: Partial<StartItem>): StartItem => ({
  projectId: "p", nummer: "2026-0001", naam: "Project", klantNaam: "Klant", fase: "offerte", verkoperId: null, gewijzigd: dag(1), versie: 1, status: "verstuurd",
  verstuurdOp: dag(1), geldigTot: "2026-11-24", totaal: 1000, aantalRegels: 3, geopend: 0, laatstGeopend: null, akkoordOp: null, ...o,
});

describe("bepaalActies", () => {
  it("meldt een getekende offerte als eerste", () => {
    const a = bepaalActies([item({ status: "akkoord", fase: "akkoord", akkoordOp: dag(1) })], nu);
    expect(a[0]).toMatchObject({ soort: "getekend", prioriteit: 1 });
    expect(a[0].reden).toContain("inmeting");
  });
  it("herkent een warme offerte: recent bekeken door de klant", () => {
    const a = bepaalActies([item({ geopend: 4, laatstGeopend: dag(1) })], nu);
    expect(a[0]).toMatchObject({ soort: "warm" });
    expect(a[0].reden).toContain("4×");
  });
  it("herkent een offerte die na 3 dagen nog niet is geopend", () => {
    expect(bepaalActies([item({ verstuurdOp: dag(4) })], nu)[0].soort).toBe("ongeopend");
    expect(bepaalActies([item({ verstuurdOp: dag(2) })], nu)).toHaveLength(0);
  });
  it("waarschuwt als de offerte binnen 3 dagen verloopt of al is verlopen", () => {
    expect(bepaalActies([item({ geldigTot: "2026-11-12" })], nu)[0]).toMatchObject({ soort: "verloopt" });
    expect(bepaalActies([item({ geldigTot: "2026-11-10" })], nu)[0].reden).toContain("vandaag");
    expect(bepaalActies([item({ geldigTot: "2026-11-09" })], nu)[0]).toMatchObject({ soort: "verlopen" });
  });
  it("meldt een offerte zonder reactie na een week", () => {
    expect(bepaalActies([item({ geopend: 2, laatstGeopend: dag(8), verstuurdOp: dag(9) })], nu)[0].soort).toBe("stil");
  });
  it("meldt een concept dat al een week openstaat, maar niet als het leeg is", () => {
    expect(bepaalActies([item({ status: "concept", gewijzigd: dag(9), geldigTot: null, verstuurdOp: null })], nu)[0].soort).toBe("concept");
    expect(bepaalActies([item({ status: "concept", gewijzigd: dag(9), aantalRegels: 0, geldigTot: null, verstuurdOp: null })], nu)).toHaveLength(0);
  });
  it("geeft per project één actie en laat een rustige offerte met rust", () => {
    expect(bepaalActies([item({ geopend: 1, laatstGeopend: dag(5) })], nu)).toHaveLength(0);
    expect(bepaalActies([item({ geopend: 4, laatstGeopend: dag(1), geldigTot: "2026-11-11" })], nu)).toHaveLength(1);
  });
  it("sorteert op belang en dan op bedrag", () => {
    const a = bepaalActies([
      item({ projectId: "a", geopend: 1, laatstGeopend: dag(1), totaal: 9000 }),
      item({ projectId: "b", status: "akkoord", fase: "akkoord", totaal: 500 }),
      item({ projectId: "c", geopend: 1, laatstGeopend: dag(1), totaal: 12000 }),
    ], nu);
    expect(a.map((x) => x.projectId)).toEqual(["b", "c", "a"]);
  });
});

describe("groepeerPijplijn", () => {
  it("toont de eerste drie fases altijd en de rest alleen met inhoud", () => {
    const k = groepeerPijplijn([item({ fase: "offerte", totaal: 100.5 }), item({ projectId: "q", fase: "offerte", totaal: 200 }), item({ projectId: "r", fase: "montage", totaal: 50 })]);
    expect(k.map((x) => x.fase)).toEqual(["lead", "offerte", "akkoord", "montage"]);
    expect(k.find((x) => x.fase === "offerte")).toMatchObject({ totaal: 300.5 });
  });
  it("laat verloren of afgeronde projecten buiten de pijplijn", () => {
    expect(groepeerPijplijn([item({ fase: "verloren" })]).flatMap((x) => x.items)).toHaveLength(0);
  });
});

describe("begroeting", () => {
  it("kiest op de tijd in Nederland", () => {
    expect(begroeting(new Date("2026-11-10T07:00:00Z"))).toBe("Goedemorgen");
    expect(begroeting(new Date("2026-11-10T12:30:00Z"))).toBe("Goedemiddag");
    expect(begroeting(new Date("2026-11-10T19:00:00Z"))).toBe("Goedenavond");
  });
});
