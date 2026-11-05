import { describe, expect, it } from "vitest";
import { klantNaarFormulier, leesFormulier } from "./formulier";

const maak = (o: Record<string, string>) => {
  const f = new FormData();
  Object.entries(o).forEach(([k, v]) => f.set(k, v));
  return f;
};
const basis = { type: "particulier", achternaam: "Dijk" };

describe("leesFormulier", () => {
  it("vereist een achternaam bij een particulier", () => {
    expect(leesFormulier(maak({ type: "particulier" }))).toMatchObject({ ok: false });
  });
  it("accepteert een klant zonder adres", () => {
    expect(leesFormulier(maak(basis))).toMatchObject({ ok: true, project: null, factuur: null });
  });
  it("weigert een half ingevuld adres", () => {
    expect(leesFormulier(maak({ ...basis, postcode: "7547 AB" }))).toMatchObject({ ok: false });
  });
  it("normaliseert de postcode en splitst het huisnummer", () => {
    const r = leesFormulier(maak({ ...basis, postcode: "7547ab", huisnummer: "5a", straat: "Vijverlaan", plaats: "Aadorp" }));
    expect(r).toMatchObject({ ok: true, project: { postcode: "7547 AB", huisnummer: "5", toevoeging: "a" } });
  });
  it("weigert een ongeldige postcode in Nederland", () => {
    expect(leesFormulier(maak({ ...basis, postcode: "99", huisnummer: "1", straat: "X", plaats: "Y" }))).toMatchObject({ ok: false });
  });
  it("vereist een compleet factuuradres als het vinkje aan staat", () => {
    const r = leesFormulier(maak({ ...basis, postcode: "7547 AB", huisnummer: "5", straat: "V", plaats: "A", factuur_anders: "on" }));
    expect(r).toMatchObject({ ok: false });
  });
  it("laat bedrijfsgegevens weg bij een particulier", () => {
    const r = leesFormulier(maak({ ...basis, bedrijfsnaam: "BV", kvk: "123" }));
    expect(r).toMatchObject({ ok: true, klant: { bedrijfsnaam: null, kvk: null } });
  });
});

describe("klantNaarFormulier", () => {
  it("zet een klant met adres om naar formulierwaarden", () => {
    const w = klantNaarFormulier({
      type: "particulier", achternaam: "Dijk", marketing_toestemming: true,
      adressen: [
        { soort: "project", straat: "Vijverlaan", huisnummer: "5", toevoeging: "a", postcode: "7547 AB", plaats: "Aadorp", land: "NL", bouwjaar: 1975, monument: false },
        { soort: "factuur", straat: "Vijverlaan", huisnummer: "5", toevoeging: "a", postcode: "7547 AB", plaats: "Aadorp", land: "NL" },
      ],
    });
    expect(w).toMatchObject({ achternaam: "Dijk", huisnummer: "5a", bouwjaar: "1975", marketing_toestemming: "on" });
    expect(w.factuur_anders).toBeUndefined();
  });
  it("herkent een afwijkend factuuradres", () => {
    const w = klantNaarFormulier({
      type: "zakelijk",
      adressen: [
        { soort: "project", straat: "A", huisnummer: "1", postcode: "1000 AA", plaats: "X", toevoeging: null },
        { soort: "factuur", straat: "Dam", huisnummer: "1", postcode: "1012 JS", plaats: "Amsterdam", toevoeging: null },
      ],
    });
    expect(w).toMatchObject({ factuur_anders: "on", f_plaats: "Amsterdam" });
  });
});
