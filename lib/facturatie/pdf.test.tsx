import { describe, expect, it } from "vitest";
import { factuurBestandsnaam, maakFactuurPdf } from "./pdf";

describe("factuur-pdf", () => {
  it("maakt een geldig PDF-bestand", async () => {
    const pdf = await maakFactuurPdf({
      nummer: "2026-0001", factuurdatum: "2026-11-05", vervaldatum: "2026-11-08", omschrijving: "Aanbetaling 30% van de opdracht",
      toelichting: "Bedankt voor uw opdracht!", bedragExcl: 2555.4, btwHoog: 536.63, btwLaag: 68.97 + 0, totaal: 3161, meerwerk: 0, status: "open",
      projectNummer: "2026-0003", projectNaam: "Kozijnen Voorbeeldstraat 1", klantNaam: "Jan Jansen", begroeting: "Beste heer Jansen,", adresRegels: ["Voorbeeldstraat 1", "7551 AB Hengelo"],
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1500);
  });
  it("maakt een veilige bestandsnaam", () => {
    expect(factuurBestandsnaam("2026-0001")).toBe("Factuur-2026-0001.pdf");
    expect(factuurBestandsnaam("../x y")).toBe("Factuur-..-x-y.pdf");
  });
});
