import { describe, expect, it } from "vitest";
import { filterFacturen, samenvatting, sorteerOpVervaldatum, teLaatTekst, type OverzichtFactuur } from "./overzicht";

const f = (o: Partial<OverzichtFactuur>): OverzichtFactuur => ({ id: "x", nummer: "2026-0001", projectId: "p", projectNaam: "P", klantNaam: "K", termijn: 1, totaal: 1000, vervaldatum: "2026-11-10", factuurdatum: "2026-11-05", status: "open", verzonden: true, betaald: 0, ...o });
const lijst = [
  f({ id: "a", nummer: "2026-0001", vervaldatum: "2026-11-06" }),                                     // te laat
  f({ id: "b", nummer: "2026-0002", vervaldatum: "2026-11-20", verzonden: false, totaal: 2000 }),      // open, niet verzonden
  f({ id: "c", nummer: "2026-0003", status: "betaald", betaald: 500, totaal: 500 }),
  f({ id: "d", nummer: "2026-0004", status: "geannuleerd", totaal: 9999 }),
  f({ id: "e", nummer: "2026-0005", vervaldatum: "2026-11-01", betaald: 400, totaal: 1000 }),         // deels betaald, te laat
];
const vandaag = "2026-11-12";

describe("facturenoverzicht", () => {
  it("filtert op status", () => {
    const ids = (flt: Parameters<typeof filterFacturen>[1]) => filterFacturen(lijst, flt, vandaag).map((x) => x.id);
    expect(ids("open")).toEqual(["a", "b", "e"]);
    expect(ids("telaat")).toEqual(["a", "e"]);
    expect(ids("onverzonden")).toEqual(["b"]);
    expect(ids("betaald")).toEqual(["c"]);
    expect(ids("alle")).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("telt geannuleerde facturen nergens mee en rekent openstaand na betalingen", () => {
    const s = samenvatting(lijst, vandaag);
    expect(s.aantalOpen).toBe(3);
    expect(s.openstaand).toBe(1000 + 2000 + 600);
    expect(s.aantalTeLaat).toBe(2);
    expect(s.teLaat).toBe(1000 + 600);
    expect(s.gefactureerd).toBe(1000 + 2000 + 500 + 1000);
    expect(s.ontvangen).toBe(900);
  });
  it("sorteert op vervaldatum en benoemt hoe laat het is", () => {
    expect(sorteerOpVervaldatum(lijst).map((x) => x.id)[0]).toBe("e");
    expect(teLaatTekst(lijst[0], vandaag)).toBe("6 dagen te laat");
    expect(teLaatTekst(f({ vervaldatum: "2026-11-11" }), vandaag)).toBe("1 dag te laat");
  });
});
