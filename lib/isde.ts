import type { Prijsregels } from "./prijs/types";

export const ISDE_STATUS = [
  { sleutel: "niet_van_toepassing", label: "Niet van toepassing" },
  { sleutel: "klaargezet", label: "Klaargezet" },
  { sleutel: "aangevraagd", label: "Aangevraagd door klant" },
  { sleutel: "toegekend", label: "Toegekend" },
  { sleutel: "afgewezen", label: "Afgewezen" },
] as const;
export type IsdeStatus = (typeof ISDE_STATUS)[number]["sleutel"];
export const isIsdeStatus = (v: string): v is IsdeStatus => ISDE_STATUS.some((s) => s.sleutel === v);

/** Schatting van het aantal m² glas van een positie: 80% van het kozijnoppervlak (zoals de configurator), maal het aantal. */
export function schatGlasM2(breedteMm: number, hoogteMm: number, aantal: number): number {
  return Math.round(Math.max(0, (breedteMm / 1000) * (hoogteMm / 1000) * 0.8 * aantal) * 100) / 100;
}

/** ISDE-indicatie (laag, hoog) voor een glassoort en een aantal m² glas, met de bedragen per m² uit de prijsregels. */
export function isdeIndicatie(regels: Pick<Prijsregels, "glas">, glasKey: string, glasM2: number): { laag: number; hoog: number } {
  const g = regels.glas[glasKey];
  if (!g) return { laag: 0, hoog: 0 };
  return { laag: Math.round(glasM2 * g.isdeLow), hoog: Math.round(glasM2 * g.isdeHigh) };
}

export interface IsdeStuk { sleutel: string; label: string; klaar: boolean | null; uitleg: string }

/**
 * De stukken die de klant bij de aanvraag nodig heeft en of ze er zijn. `klaar` is null als het systeem dat niet kan zien
 * (bijvoorbeeld de glasspecificatie van de leverancier: die bewaart de medewerker zelf).
 */
export function isdeStukken(i: { facturen: { status: string }[]; werkbonOpgeleverd: boolean; naFotos: number | null }): IsdeStuk[] {
  const lopend = i.facturen.filter((f) => f.status !== "geannuleerd");
  const allesBetaald = lopend.length > 0 && lopend.every((f) => f.status === "betaald");
  return [
    { sleutel: "factuur", label: "Factuur met specificatie", klaar: lopend.length > 0, uitleg: lopend.length > 0 ? "De termijnfacturen staan in het CRM." : "Er is nog geen factuur gemaakt." },
    { sleutel: "betaald", label: "Betaalbewijs", klaar: allesBetaald, uitleg: allesBetaald ? "Alle facturen zijn betaald." : "Niet alle facturen zijn betaald; de klant heeft het betaalbewijs nodig." },
    { sleutel: "fotos", label: "Foto's na plaatsing", klaar: i.naFotos === null ? null : i.naFotos > 0, uitleg: i.naFotos === null ? "Alleen zichtbaar voor directie en kantoor." : i.naFotos > 0 ? `${i.naFotos} foto's na de montage.` : "De monteur heeft nog geen foto's na plaatsing gemaakt." },
    { sleutel: "oplevering", label: "Oplevering getekend", klaar: i.werkbonOpgeleverd, uitleg: i.werkbonOpgeleverd ? "De werkbon is opgeleverd en getekend." : "De montage is nog niet opgeleverd." },
    { sleutel: "glas", label: "Glasspecificatie met U-waarde", klaar: null, uitleg: "Vraag de verklaring of het etiket van de glasleverancier op en vul de U-waarde per positie in." },
  ];
}
