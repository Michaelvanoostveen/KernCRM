import { describe, expect, it } from "vitest";
import { REGELS_KERNKOZIJNEN as regels } from "../prijs/regels-kernkozijnen";
import type { Configuratie } from "../prijs/types";
import { AFWIJKING_DREMPEL_MM, afwijkingTekst, amsterdamNaarIso, bepaalAfwijking, indicatieMeerwerk } from "./afwijking";

describe("bepaalAfwijking", () => {
  it("meldt geen afwijking binnen de marge", () => {
    expect(bepaalAfwijking({ w: 1000, h: 1200 }, { breedte: 1005, hoogte: 1195 })).toMatchObject({ afwijkend: false });
  });
  it("meldt een afwijking boven de marge, in beide richtingen", () => {
    const a = bepaalAfwijking({ w: 1000, h: 1200 }, { breedte: 1014, hoogte: 1194 })!;
    expect(a).toMatchObject({ breedte: 14, hoogte: -6, afwijkend: true });
    expect(afwijkingTekst(a)).toBe("breedte +14 mm, hoogte -6 mm");
    expect(AFWIJKING_DREMPEL_MM).toBe(5);
  });
  it("noemt alleen de maat die afwijkt", () => {
    expect(afwijkingTekst(bepaalAfwijking({ w: 1000, h: 1200 }, { breedte: 1000, hoogte: 1230 })!)).toBe("hoogte +30 mm");
  });
  it("geeft niets terug zolang de maten niet zijn ingevuld", () => {
    expect(bepaalAfwijking({ w: 1000, h: 1200 }, { breedte: null, hoogte: 1200 })).toBeNull();
  });
});

describe("indicatieMeerwerk", () => {
  const cfg: Configuratie = { product: "raam", variant: "draaikiep", w: 1000, h: 1200, glas: "hrpp", kleur: "wit", beslag: "rc2", binnen: "witglad", profiel: "schuco" };
  it("is 0 als de gemeten maat gelijk is", () => {
    expect(indicatieMeerwerk(regels, cfg, { breedte: 1000, hoogte: 1200 }, 1)).toBe(0);
  });
  it("geeft meerwerk bij een grotere en minderwerk bij een kleinere maat, per stuk keer aantal", () => {
    const meer = indicatieMeerwerk(regels, cfg, { breedte: 1500, hoogte: 1400 }, 1);
    expect(meer).toBeGreaterThan(0);
    expect(indicatieMeerwerk(regels, cfg, { breedte: 1500, hoogte: 1400 }, 3)).toBeCloseTo(meer * 3, 2);
    expect(indicatieMeerwerk(regels, { ...cfg, w: 2000, h: 1500 }, { breedte: 1000, hoogte: 1200 }, 1)).toBeLessThan(0);
  });
});

describe("amsterdamNaarIso", () => {
  it("rekent wintertijd en zomertijd goed om", () => {
    expect(amsterdamNaarIso("2026-11-12T09:30")).toBe("2026-11-12T08:30:00.000Z");
    expect(amsterdamNaarIso("2026-07-15T09:30")).toBe("2026-07-15T07:30:00.000Z");
  });
  it("kent de overgang naar zomertijd", () => {
    expect(amsterdamNaarIso("2026-03-29T01:30")).toBe("2026-03-29T00:30:00.000Z");
    expect(amsterdamNaarIso("2026-03-29T04:00")).toBe("2026-03-29T02:00:00.000Z");
  });
  it("weigert ongeldige invoer", () => {
    expect(amsterdamNaarIso("morgen")).toBeNull();
    expect(amsterdamNaarIso("")).toBeNull();
  });
});
