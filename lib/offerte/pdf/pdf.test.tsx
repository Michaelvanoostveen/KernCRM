import { describe, expect, it } from "vitest";
import { maakOffertePdf, pdfBestandsnaam } from "./maak";
import { pdfTekst } from "./tekst";
import { svgOnderdelen } from "./svg";
import type { PubliekeOfferte } from "../publiek";

const cfg = (product: string, variant: string, w: number, h: number) => ({ product, variant, w, h, glas: "hrpp", kleur: "antraciet", kleurVleugel: null, beslag: "rc2", binnen: "witglad", profiel: "schuco", cols: null });
export const voorbeeld: PubliekeOfferte = {
  bedrijf: "KernKozijnen B.V.", nummer: "2026-0001", versie: 1, status: "verstuurd", geldig_tot: "2026-11-19", verstuurd_op: "2026-11-05T10:00:00Z",
  project_naam: "Vijverlaan 31, Aadorp", klant_naam: "Jan Dijk", aanhef: "dhr", achternaam: "Dijk",
  adres: { straat: "Vijverlaan", huisnummer: "31", toevoeging: null, postcode: "7547 AB", plaats: "Aadorp" },
  eigen_totaal: null, akkoord: null,
  regels: [
    { soort: "tekst", titel: null, tekst: "Beste {aanhef} {achternaam},\n\nHartelijk dank voor ons gesprek. Hieronder vindt u onze offerte voor {adres}.", aantal: 1, prijs: 0, modus: null, waarde: null, eenheid: null, positie: null },
    { soort: "kop", titel: "Voorzijde woning", tekst: null, aantal: 1, prijs: 0, modus: null, waarde: null, eenheid: null, positie: null },
    { soort: "positie", titel: null, tekst: null, aantal: 1, prijs: 2350, modus: null, waarde: null, eenheid: null, positie: { nummer: 1, ruimte: "Woonkamer", config: cfg("raam", "draaikiep", 1000, 1200) } },
    { soort: "positie", titel: null, tekst: null, aantal: 2, prijs: 5360, modus: null, waarde: null, eenheid: null, positie: { nummer: 2, ruimte: null, config: cfg("voordeur", "zijboven", 1300, 2300) } },
    { soort: "artikel", titel: "Steiger plaatsen en verwijderen", tekst: null, aantal: 1, prijs: 450, modus: null, waarde: null, eenheid: "stuk", positie: null },
    { soort: "korting", titel: "Actiekorting", tekst: null, aantal: 1, prijs: 0, modus: "percentage", waarde: 5, eenheid: null, positie: null },
    { soort: "tekst", titel: "Voorwaarden en garantie", tekst: "Op onze kozijnen en de montage geldt 10 jaar garantie. Prijzen zijn inclusief btw. ✓ → test", aantal: 1, prijs: 0, modus: null, waarde: null, eenheid: null, positie: null },
  ],
};

describe("pdf", () => {
  it("maakt een geldig PDF-bestand met de naam van de offerte", async () => {
    const pdf = await maakOffertePdf(voorbeeld);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(3000);
    expect(pdfBestandsnaam(voorbeeld)).toBe("Offerte-2026-0001-v1.pdf");
  }, 30_000);
  it("maakt ook een PDF van een getekende offerte met handtekening", async () => {
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const pdf = await maakOffertePdf({ ...voorbeeld, status: "akkoord", akkoord: { naam: "Jan Dijk", op: "2026-11-06T09:00:00Z", handtekening: png } });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);
  it("verwijdert tekens die de PDF niet kent", () => {
    expect(pdfTekst("− 5 ✓ → ok")).toBe("- 5 v  ok");
    expect(pdfTekst(null)).toBe("");
  });
  it("zet de onderdelen van een tekening om", () => {
    const delen = svgOnderdelen('<rect x="1" y="2" width="3" height="4" fill="#fff"/><line x1="0" y1="0" x2="5" y2="5" stroke="#000" stroke-width="1"/><circle cx="2" cy="2" r="1" fill="#b9933f"/><path d="M0"/>');
    expect(delen).toHaveLength(3);
  });
});
