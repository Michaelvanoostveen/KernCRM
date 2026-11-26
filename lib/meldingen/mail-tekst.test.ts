import { describe, expect, it } from "vitest";
import { maakMeldingMail } from "./mail-tekst";

describe("maakMeldingMail", () => {
  it("noemt in het onderwerp of de offerte geopend of getekend is", () => {
    expect(maakMeldingMail("offerte_geopend", "Jan heeft de offerte voor P1 N geopend.", "https://x/p", "Kern").onderwerp).toBe("Offerte geopend: Jan heeft de offerte voor P1 N geopend");
    expect(maakMeldingMail("offerte_akkoord", "Jan heeft de offerte voor P1 N ondertekend: akkoord.", "https://x/p", "Kern").onderwerp).toMatch(/^Offerte getekend: /);
  });
  it("zet de link en de afzender in de tekst", () => {
    const t = maakMeldingMail("offerte_geopend", "Zin.", "https://x/projecten/1", "KernKozijnen").tekst;
    expect(t).toContain("https://x/projecten/1");
    expect(t).toContain("KernKozijnen");
  });
});
