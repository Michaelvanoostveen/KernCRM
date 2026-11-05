import { describe, expect, it } from "vitest";
import { maakAdresRijen } from "./adresrijen";

const project = { straat: "Vijverlaan", huisnummer: "5", toevoeging: null, postcode: "7547 AB", plaats: "Aadorp", bouwjaar: 1975, woningtype: "Hoekwoning", bereikbaarheid: null, monument: false };
const basis = { tenantId: "t", klantId: "k", land: "NL", project };

describe("maakAdresRijen", () => {
  it("geeft alle rijen dezelfde kolommen", () => {
    const [a, b] = maakAdresRijen({ ...basis, factuur: null });
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    const anders = maakAdresRijen({ ...basis, factuur: { straat: "Dam", huisnummer: "1", toevoeging: null, postcode: "1012 JS", plaats: "Amsterdam" } });
    expect(Object.keys(anders[0]).sort()).toEqual(Object.keys(anders[1]).sort());
  });
  it("laat monument nooit leeg", () => {
    for (const rij of maakAdresRijen({ ...basis, factuur: null })) expect(typeof rij.monument).toBe("boolean");
  });
  it("gebruikt het projectadres als factuuradres als er geen apart is", () => {
    const [, factuur] = maakAdresRijen({ ...basis, factuur: null });
    expect(factuur.soort).toBe("factuur");
    expect(factuur.plaats).toBe("Aadorp");
    expect(factuur.bouwjaar).toBeNull();
  });
  it("neemt een apart factuuradres over", () => {
    const [, factuur] = maakAdresRijen({ ...basis, factuur: { straat: "Dam", huisnummer: "1", toevoeging: null, postcode: "1012 JS", plaats: "Amsterdam" } });
    expect(factuur.plaats).toBe("Amsterdam");
  });
});
