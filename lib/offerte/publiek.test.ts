import { describe, expect, it } from "vitest";
import { INSTELLINGEN_KERNKOZIJNEN as inst } from "./instellingen";
import { berekenPubliek, leesPubliekeOfferte, vulInvoegvelden, type PubliekeOfferte } from "./publiek";
import { datumOver, eersteIp, isGeldigeHandtekening } from "./handtekening";
import { isGeldigeToken, maakToken } from "./token";

const basis: PubliekeOfferte = {
  bedrijf: "KernKozijnen B.V.", nummer: "2026-0001", versie: 1, status: "verstuurd", geldig_tot: "2026-11-19", verstuurd_op: "2026-11-05T10:00:00Z",
  project_naam: "Vijverlaan 31, Aadorp", klant_naam: "Jan Dijk", aanhef: "dhr", achternaam: "Dijk",
  adres: { straat: "Vijverlaan", huisnummer: "31", toevoeging: null, postcode: "7547 AB", plaats: "Aadorp" },
  eigen_totaal: null, akkoord: null,
  regels: [
    { soort: "positie", titel: null, tekst: null, aantal: 1, prijs: 2350, modus: null, waarde: null, eenheid: null, positie: { nummer: 1, ruimte: null, config: {} } },
    { soort: "artikel", titel: "Steiger", tekst: null, aantal: 2, prijs: 450, modus: null, waarde: null, eenheid: "dag", positie: null },
    { soort: "korting", titel: "Actie", tekst: null, aantal: 1, prijs: 0, modus: "percentage", waarde: 5, eenheid: null, positie: null },
  ],
};

describe("berekenPubliek", () => {
  it("rekent met de eindprijzen en toont expliciete korting", () => {
    const b = berekenPubliek(basis, inst);
    expect(b.subtotaal).toBe(3250);
    expect(b.korting).toBe(162.5);
    expect(b.totaal).toBe(3087.5);
  });
  it("neemt de eigen totaalprijs over zonder dat de klant de aanpassing krijgt te zien", () => {
    const b = berekenPubliek({ ...basis, eigen_totaal: 3000 }, inst);
    expect(b.totaal).toBe(3000);
    expect(JSON.stringify(basis)).not.toMatch(/override|reden/i);
  });
});

describe("leesPubliekeOfferte", () => {
  it("accepteert de vorm van de database en weigert de rest", () => {
    expect(leesPubliekeOfferte(basis)).not.toBeNull();
    expect(leesPubliekeOfferte(null)).toBeNull();
    expect(leesPubliekeOfferte({ ...basis, status: "concept" })).toBeNull();
    expect(leesPubliekeOfferte({ ...basis, status: "vervallen" })).not.toBeNull();
    expect(leesPubliekeOfferte({ ...basis, regels: [{ soort: "onbekend" }] })).toBeNull();
  });
});

describe("vulInvoegvelden", () => {
  it("vult aanhef, achternaam, adres, geldigheid en nummer in", () => {
    const t = vulInvoegvelden("Beste {aanhef} {achternaam}, {adres}, geldig tot {geldig_tot} ({offertenummer})", basis);
    expect(t).toBe("Beste heer Dijk, Vijverlaan 31, Aadorp, geldig tot 19 november 2026 (2026-0001-v1)");
  });
  it("valt terug op een neutrale aanhef", () => {
    expect(vulInvoegvelden("{aanhef}", { ...basis, aanhef: null })).toBe("heer/mevrouw");
  });
});

describe("token en handtekening", () => {
  it("maakt een lange, unieke, URL-veilige sleutel", () => {
    const a = maakToken();
    expect(a).toHaveLength(43);
    expect(isGeldigeToken(a)).toBe(true);
    expect(maakToken()).not.toBe(a);
    expect(isGeldigeToken("kort")).toBe(false);
    expect(isGeldigeToken("../etc/passwd" + "a".repeat(30))).toBe(false);
  });
  it("accepteert alleen een PNG-handtekening van redelijke grootte", () => {
    const png = "data:image/png;base64," + "A".repeat(300);
    expect(isGeldigeHandtekening(png)).toBe(true);
    expect(isGeldigeHandtekening("data:image/svg+xml;base64," + "A".repeat(300))).toBe(false);
    expect(isGeldigeHandtekening("data:image/png;base64," + "A".repeat(10))).toBe(false);
    expect(isGeldigeHandtekening("data:image/png;base64," + "A".repeat(400_000))).toBe(false);
    expect(isGeldigeHandtekening("data:image/png;base64,<script>" + "A".repeat(300))).toBe(false);
    expect(isGeldigeHandtekening(null)).toBe(false);
  });
  it("neemt het eerste IP-adres uit x-forwarded-for", () => {
    expect(eersteIp("203.0.113.5, 10.0.0.1")).toBe("203.0.113.5");
    expect(eersteIp(null)).toBeNull();
  });
  it("rekent de geldigheidsdatum uit", () => {
    expect(datumOver(14, new Date("2026-11-05T10:00:00Z"))).toBe("2026-11-19");
  });
});

import { maakMail } from "./mail";
describe("maakMail", () => {
  it("maakt een nette mail met de link en de geldigheid", () => {
    const m = maakMail({ aanhef: "mevr", achternaam: "Jansen", klantNaam: "M. Jansen", nummer: "2026-0001", versie: 1, geldigTot: "2026-11-19", adres: "Vijverlaan 31, Aadorp", link: "https://x.nl/o/abc", bedrijf: "KernKozijnen" });
    expect(m.onderwerp).toBe("Uw offerte 2026-0001 voor Vijverlaan 31, Aadorp");
    expect(m.tekst).toContain("Beste mevrouw Jansen,");
    expect(m.tekst).toContain("https://x.nl/o/abc");
    expect(m.tekst).toContain("geldig tot 19 november 2026");
  });
});
