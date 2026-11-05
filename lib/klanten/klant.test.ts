import { describe, expect, it } from "vitest";
import { normaliseerPostcode, splitsHuisnummer, weergavenaam } from "./klant";

describe("weergavenaam", () => {
  it("gebruikt de bedrijfsnaam bij een bedrijf", () => {
    expect(weergavenaam({ type: "vve", bedrijfsnaam: "VvE Dorpsstraat 12", voornaam: "Piet" })).toBe("VvE Dorpsstraat 12");
  });
  it("zet een persoonsnaam samen met tussenvoegsel", () => {
    expect(weergavenaam({ type: "particulier", voornaam: "Jan", tussenvoegsel: "van", achternaam: "Dijk" })).toBe("Jan van Dijk");
  });
  it("valt bij een bedrijf zonder naam terug op de persoon", () => {
    expect(weergavenaam({ type: "zakelijk", voornaam: "Els", achternaam: "Smit" })).toBe("Els Smit");
  });
});

describe("normaliseerPostcode", () => {
  it("zet een spatie en hoofdletters", () => expect(normaliseerPostcode("7551ab")).toBe("7551 AB"));
  it("accepteert een spatie", () => expect(normaliseerPostcode(" 7551 AB ")).toBe("7551 AB"));
  it("wijst een ongeldige postcode af", () => {
    expect(normaliseerPostcode("0123 AB")).toBeNull();
    expect(normaliseerPostcode("75511")).toBeNull();
  });
});

describe("splitsHuisnummer", () => {
  it("splitst nummer en toevoeging", () => {
    expect(splitsHuisnummer("12a")).toEqual({ huisnummer: "12", toevoeging: "a" });
    expect(splitsHuisnummer("12 - 3")).toEqual({ huisnummer: "12", toevoeging: "3" });
    expect(splitsHuisnummer("8")).toEqual({ huisnummer: "8", toevoeging: "" });
  });
});
