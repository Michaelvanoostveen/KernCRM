import { describe, expect, it } from "vitest";
import { splitsBtw } from "../facturatie/bereken";
import { INSTELLINGEN_KERNKOZIJNEN } from "../offerte/instellingen";
import { BOEKINGEN_KOP, boekingRijen, type ExportBron } from "./export";
import { leesInstellingen } from "./instellingen";

const inst = leesInstellingen({ dagboek: "VRK", omzetrekening_hoog: "8000", omzetrekening_laag: "8010", btwcode_hoog: "VH", btwcode_laag: "VL" });
const tarief = { hoog: 0.21, laag: 0.09 };
const bron = (nummer: string, datum: string, totaal: number, soort: "factuur" | "creditnota" = "factuur", status = "open"): ExportBron => {
  const b = splitsBtw(totaal, INSTELLINGEN_KERNKOZIJNEN);
  return { soort, nummer, datum, vervaldatum: "2026-12-01", omschrijving: "x", bedragExcl: b.exclBtw, btwHoog: b.btwHoog, btwLaag: b.btwLaag, totaalIncl: b.totaal, debiteurNaam: "K", projectNummer: "P1", status };
};

describe("export verkoopboekingen", () => {
  it("maakt per document twee boekregels en zet de status erbij", () => {
    const rijen = boekingRijen([bron("2026-0001", "2026-11-05", 3000, "factuur", "betaald")], inst, tarief);
    expect(rijen).toHaveLength(2);
    expect(rijen[0].length).toBe(BOEKINGEN_KOP.length);
    expect(rijen.every((r) => r[r.length - 1] === "betaald")).toBe(true);
  });
  it("sorteert op datum en nummer en geeft een creditnota negatieve bedragen", () => {
    const rijen = boekingRijen([bron("CN-2026-0001", "2026-11-07", 1000, "creditnota", "creditnota"), bron("2026-0002", "2026-11-06", 500), bron("2026-0001", "2026-11-05", 3000)], inst, tarief);
    expect(rijen.map((r) => r[2])).toEqual(["2026-0001", "2026-0001", "2026-0002", "2026-0002", "CN-2026-0001", "CN-2026-0001"]);
    const credit = rijen.filter((r) => r[0] === "creditnota");
    expect(credit.every((r) => Number(r[13]) === -1000 && Number(r[11]) <= 0)).toBe(true);
  });
  it("geeft niets terug voor een lege selectie", () => expect(boekingRijen([], inst, tarief)).toEqual([]));
});
