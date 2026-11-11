import { describe, expect, it } from "vitest";
import { dagenTeLaat, maakFactuurMail, maakBetalingBevestigingMail, mailtoLink, maakHerinneringMail } from "./mail";

const basis = { begroeting: "Beste heer Jansen,", nummer: "2026-0001", vervaldatum: "8 november 2026", adres: "Voorbeeldstraat 1", bedrijf: "KernKozijnen B.V." };

describe("factuurmail", () => {
  it("is per termijn passend en vriendelijk", () => {
    const t1 = maakFactuurMail({ ...basis, termijn: 1, omschrijving: "Aanbetaling 30%", bedrag: 3000 });
    expect(t1.onderwerp).toBe("Factuur 2026-0001 - Aanbetaling 30%");
    expect(t1.tekst).toContain("Bedankt voor uw opdracht");
    expect(t1.tekst).toContain("8 november 2026");
    expect(maakFactuurMail({ ...basis, termijn: 2, omschrijving: "x", bedrag: 6500 }).tekst).toContain("vandaag");
    expect(maakFactuurMail({ ...basis, termijn: 3, omschrijving: "x", bedrag: 500 }).tekst).toContain("opgeleverd");
  });
  it("begint met de begroeting en eindigt met het bedrijf", () => {
    const m = maakFactuurMail({ ...basis, termijn: 1, omschrijving: "x", bedrag: 1 });
    expect(m.tekst.startsWith("Beste heer Jansen,")).toBe(true);
    expect(m.tekst.trimEnd().endsWith("KernKozijnen B.V.")).toBe(true);
  });
});

describe("herinneringen", () => {
  it("worden bij elke stap duidelijker maar blijven beleefd", () => {
    const een = maakHerinneringMail({ ...basis, bedrag: 3000, niveau: 1 });
    const twee = maakHerinneringMail({ ...basis, bedrag: 3000, niveau: 2 });
    const drie = maakHerinneringMail({ ...basis, bedrag: 3000, niveau: 3 });
    expect(een.onderwerp).toBe("Herinnering factuur 2026-0001");
    expect(twee.onderwerp).toContain("Tweede");
    expect(drie.onderwerp).toContain("Laatste");
    expect(een.tekst).toContain("Wellicht is het u ontgaan");
    expect(drie.tekst).toContain("binnen 7 dagen");
    expect(drie.tekst).not.toMatch(/incasso|deurwaarder|juridisch/i);
  });
});

describe("dagenTeLaat", () => {
  it("telt dagen na de vervaldatum", () => {
    expect(dagenTeLaat("2026-11-08", "2026-11-12")).toBe(4);
    expect(dagenTeLaat("2026-11-08", "2026-11-08")).toBe(0);
    expect(dagenTeLaat("2026-11-08", "2026-11-01")).toBe(0);
  });
});

describe("maakBetalingBevestigingMail", () => {
  const basis = { begroeting: "Beste heer Jansen,", nummer: "2026-0001", bedrag: 1000, betaaldOp: "8 november 2026", vervaldatum: "10 november 2026", bedrijf: "KernKozijnen B.V." };
  it("bevestigt een volledige betaling", () => {
    const m = maakBetalingBevestigingMail({ ...basis, resterend: 0 });
    expect(m.onderwerp).toBe("Betaling ontvangen - factuur 2026-0001");
    expect(m.tekst).toContain("volledig voldaan");
    expect(m.tekst).not.toContain("open");
  });
  it("noemt bij een deelbetaling het resterende bedrag en de vervaldatum", () => {
    const m = maakBetalingBevestigingMail({ ...basis, resterend: 2000 });
    expect(m.onderwerp).toBe("Deelbetaling ontvangen - factuur 2026-0001");
    expect(m.tekst).toContain("nog");
    expect(m.tekst).toContain("10 november 2026");
  });
});

describe("mailtoLink", () => {
  it("codeert onderwerp en tekst met regeleinden", () => {
    const l = mailtoLink("klant@x.nl", "Factuur & meer", "Regel 1\nRegel 2");
    expect(l.startsWith("mailto:klant@x.nl?subject=Factuur%20%26%20meer&body=")).toBe(true);
    expect(l).toContain("Regel%201%0D%0ARegel%202");
  });
  it("werkt zonder adres", () => {
    expect(mailtoLink(null, "a", "b").startsWith("mailto:?subject=")).toBe(true);
  });
});
