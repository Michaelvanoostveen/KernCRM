import { describe, expect, it } from "vitest";
import { controleerNieuwWachtwoord, isAliasAdres, naarInlogAdres } from "./gebruikersnaam";

describe("naarInlogAdres", () => {
  it("maakt van een gebruikersnaam een plusadres op het aliasadres", () => {
    expect(naarInlogAdres("frits")).toBe("info+frits@kernkozijnen.nl");
    expect(naarInlogAdres("  Frits  ")).toBe("info+frits@kernkozijnen.nl");
    expect(naarInlogAdres("jan.de-vries_2")).toBe("info+jan.de-vries_2@kernkozijnen.nl");
  });
  it("laat een e-mailadres ongemoeid (wel in kleine letters)", () => {
    expect(naarInlogAdres("Info@KernKozijnen.nl")).toBe("info@kernkozijnen.nl");
    expect(naarInlogAdres("a@b.nl")).toBe("a@b.nl");
  });
  it("gebruikt een ander aliasadres als dat is ingesteld", () => {
    expect(naarInlogAdres("sem", "kantoor@bedrijf.nl")).toBe("kantoor+sem@bedrijf.nl");
  });
  it("weigert onzin, te korte of vreemde namen", () => {
    for (const x of ["", "  ", "a", "met spatie", "naam!", "x".repeat(31), "a@b", "@b.nl", "a@@b.nl", "../x", "naam+extra"]) {
      expect(naarInlogAdres(x)).toBeNull();
    }
    expect(naarInlogAdres(null)).toBeNull();
    expect(naarInlogAdres("sem", "kapot")).toBeNull();
  });
});

describe("isAliasAdres", () => {
  it("herkent adressen die uit een gebruikersnaam zijn gemaakt", () => {
    expect(isAliasAdres("info+frits@kernkozijnen.nl")).toBe(true);
    expect(isAliasAdres("INFO+Frits@KernKozijnen.nl")).toBe(true);
    expect(isAliasAdres("info@kernkozijnen.nl")).toBe(false);
    expect(isAliasAdres("jan@kernkozijnen.nl")).toBe(false);
    expect(isAliasAdres("info+frits@ander.nl")).toBe(false);
  });
});

describe("controleerNieuwWachtwoord", () => {
  it("eist lengte, gelijke herhaling en variatie", () => {
    expect(controleerNieuwWachtwoord("kort", "kort")).toContain("10");
    expect(controleerNieuwWachtwoord("langgenoeg123", "anders12345")).toContain("niet hetzelfde");
    expect(controleerNieuwWachtwoord("aaaaaaaaaaaa", "aaaaaaaaaaaa")).toContain("verschillende");
    expect(controleerNieuwWachtwoord("x".repeat(73), "x".repeat(73))).toContain("lang");
    expect(controleerNieuwWachtwoord("goedwachtwoord1", "goedwachtwoord1")).toBeNull();
  });
});
