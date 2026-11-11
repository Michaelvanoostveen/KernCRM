import { describe, expect, it } from "vitest";
import { INSTELLINGEN_KERNKOZIJNEN } from "../offerte/instellingen";
import { splitsBtw } from "../facturatie/bereken";
import { boekingKlopt, maakBoeking, type FactuurBron } from "./boeking";
import { csvVeld, maakCsv } from "./csv";
import { leesInstellingen, ontbrekendeInstellingen, schrijfInstellingen } from "./instellingen";
import { maakProvider } from "./provider";

const inst = leesInstellingen({ kantoorcode: "NL1", dagboek: "VRK", debiteurenrekening: "1300", omzetrekening_hoog: "8000", omzetrekening_laag: "8010", btwcode_hoog: "VH", btwcode_laag: "VL" });
const tarief = { hoog: 0.21, laag: 0.09 };
const bron = (totaal: number, soort: "factuur" | "creditnota" = "factuur"): FactuurBron => {
  const b = splitsBtw(totaal, INSTELLINGEN_KERNKOZIJNEN);
  return { soort, nummer: "2026-0001", datum: "2026-11-05", vervaldatum: "2026-11-08", omschrijving: "Aanbetaling", bedragExcl: b.exclBtw, btwHoog: b.btwHoog, btwLaag: b.btwLaag, totaalIncl: b.totaal, debiteurNaam: "K", projectNummer: "P1" };
};

describe("boeking", () => {
  it("verdeelt de omzet over de twee btw-tarieven en klopt op de cent", () => {
    for (const totaal of [3000, 5850, 1234.56, 99.99, 0.5, 12345.67]) {
      const boeking = maakBoeking(bron(totaal), inst, tarief);
      expect(boekingKlopt(boeking), String(totaal)).toBe(true);
      expect(boeking.regels).toHaveLength(2);
      expect(boeking.regels[0].omzetrekening).toBe("8000");
      expect(boeking.regels[1].btwcode).toBe("VL");
    }
  });
  it("maakt van een creditnota negatieve bedragen zonder vervaldatum", () => {
    const boeking = maakBoeking(bron(1000, "creditnota"), inst, tarief);
    expect(boeking.totaalIncl).toBe(-1000);
    expect(boeking.vervaldatum).toBeNull();
    expect(boeking.regels.every((r) => r.bedragExcl <= 0 && r.btwBedrag <= 0)).toBe(true);
    expect(boekingKlopt(boeking)).toBe(true);
  });
  it("neemt dagboek en rekeningen uit de instellingen over", () => {
    const boeking = maakBoeking(bron(3000), inst, tarief);
    expect([boeking.dagboek, boeking.kantoorcode, boeking.debiteurenrekening]).toEqual(["VRK", "NL1", "1300"]);
  });
});

describe("instellingen", () => {
  it("leest standaardwaarden en meldt wat ontbreekt", () => {
    const leeg = leesInstellingen(null);
    expect(leeg.dagboek).toBe("VRK");
    expect(ontbrekendeInstellingen(leeg)).toContain("Kantoorcode (administratie)");
    expect(ontbrekendeInstellingen(inst)).toEqual([]);
  });
  it("schrijft alleen gevulde, korte waarden weg", () => {
    expect(schrijfInstellingen({ kantoorcode: " NL1 ", dagboek: "", omzetrekeningHoog: "x".repeat(60) })).toEqual({ kantoorcode: "NL1", omzetrekening_hoog: "x".repeat(40) });
  });
});

describe("csv", () => {
  it("zet getallen om met decimale komma en citeert waar nodig", () => {
    expect(csvVeld(1234.5)).toBe("1234,50");
    expect(csvVeld("a;b")).toBe('"a;b"');
    expect(csvVeld('zeg "hoi"')).toBe('"zeg ""hoi"""');
    expect(csvVeld(null)).toBe("");
  });
  it("beschermt tegen formules", () => {
    expect(csvVeld("=SOM(A1)")).toBe("'=SOM(A1)");
    expect(csvVeld(-5)).toBe("-5,00");
  });
  it("bouwt een CSV met BOM en regeleinden", () => {
    const csv = maakCsv(["a", "b"], [["x", 1]]);
    expect(csv.startsWith("﻿a;b\r\n")).toBe(true);
    expect(csv.endsWith("x;1,00\r\n")).toBe(true);
  });
});

describe("provider", () => {
  it("meldt vriendelijk dat de koppeling nog niet verbonden is", async () => {
    const p = maakProvider("twinfield");
    expect((await p.controleer()).ok).toBe(false);
    await expect(p.boek({} as never)).rejects.toThrow("nog niet verbonden");
  });
});
