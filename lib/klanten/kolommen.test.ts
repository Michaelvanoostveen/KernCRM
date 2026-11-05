import { describe, expect, it } from "vitest";
import { KOLOMMEN, STANDAARD_KOLOMMEN, schoneKolommen, type KlantRij } from "./kolommen";
import { adresTekst } from "./klant";

const klant: KlantRij = {
  id: "1", naam: "Jan Dijk", type: "particulier", aanhef: "dhr", voornaam: "Jan", tussenvoegsel: null, achternaam: "Dijk",
  bedrijfsnaam: null, email: "jan@example.nl", telefoon: null, mobiel: "0612345678", website: null, herkomst: "Telefoon",
  aangemaakt: "2026-11-05T09:00:00Z",
  adressen: [
    { soort: "factuur", straat: "Dam", huisnummer: "1", postcode: "1012 JS", plaats: "Amsterdam", land: "NL" },
    { soort: "project", straat: "Vijverlaan", huisnummer: "5", toevoeging: "a", postcode: "7547 AB", plaats: "Aadorp", land: "NL", bouwjaar: 1975 },
  ],
};

describe("schoneKolommen", () => {
  it("valt terug op de standaard bij ongeldige invoer", () => {
    expect(schoneKolommen(undefined)).toEqual(STANDAARD_KOLOMMEN);
    expect(schoneKolommen([])).toEqual(STANDAARD_KOLOMMEN);
    expect(schoneKolommen(["bestaat-niet"])).toEqual(STANDAARD_KOLOMMEN);
  });
  it("negeert onbekende kolommen en zet de rest in vaste volgorde", () => {
    expect(schoneKolommen(["plaats", "xyz", "email"])).toEqual(["email", "plaats"]);
  });
});

describe("kolomwaarden", () => {
  const w = (id: string) => KOLOMMEN.find((k) => k.id === id)!.waarde(klant);
  it("gebruikt het projectadres, niet het factuuradres", () => {
    expect(w("plaats")).toBe("Aadorp");
    expect(w("adres")).toBe("Vijverlaan 5 a, 7547 AB Aadorp");
    expect(w("bouwjaar")).toBe("1975");
  });
  it("laat ontbrekende gegevens leeg", () => {
    expect(w("telefoon")).toBe("");
    expect(w("bedrijfsnaam")).toBe("");
  });
  it("toont een klant zonder adres zonder fout", () => {
    expect(KOLOMMEN.find((k) => k.id === "plaats")!.waarde({ ...klant, adressen: [] })).toBe("");
  });
});

describe("adresTekst", () => {
  it("noemt het land buiten Nederland", () => {
    expect(adresTekst({ straat: "Hauptstr.", huisnummer: "3", postcode: "48599", plaats: "Gronau", land: "DE" })).toBe("Hauptstr. 3, 48599 Gronau, Duitsland");
  });
});
