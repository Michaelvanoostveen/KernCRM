import { describe, expect, it } from "vitest";
import { creditnotaBestandsnaam, factuurBestandsnaam, maakFactuurPdf } from "./pdf";

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

describe("creditnota-pdf", () => {
  it("maakt een geldig PDF-bestand", async () => {
    const pdf = await maakFactuurPdf({
      soort: "creditnota", verwijstNaar: "2026-0001", nummer: "CN-2026-0001", factuurdatum: "2026-11-06", vervaldatum: "2026-11-06", omschrijving: "Correctie op factuur 2026-0001",
      toelichting: null, bedragExcl: 851.79, btwHoog: 125.21, btwLaag: 23, totaal: 1000, meerwerk: 0, status: "open",
      projectNummer: "2026-0003", projectNaam: "Kozijnen Voorbeeldstraat 1", klantNaam: "Jan Jansen", begroeting: "Beste heer Jansen,", adresRegels: ["Voorbeeldstraat 1", "7551 AB Hengelo"],
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(creditnotaBestandsnaam("CN-2026-0001")).toBe("Creditnota-CN-2026-0001.pdf");
  });
});

describe("factuur-pdf met betaallink", () => {
  it("maakt een geldig PDF-bestand", async () => {
    const pdf = await maakFactuurPdf({
      nummer: "2026-0001", factuurdatum: "2026-11-05", vervaldatum: "2026-11-08", omschrijving: "Aanbetaling", toelichting: null, bedragExcl: 2555.4, btwHoog: 536.63, btwLaag: 68.97, totaal: 3161,
      meerwerk: 0, status: "open", projectNummer: "2026-0003", projectNaam: "Kozijnen", klantNaam: "Jan Jansen", begroeting: "Beste heer Jansen,", adresRegels: [], betaalLink: "https://pay.example/abc123",
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
