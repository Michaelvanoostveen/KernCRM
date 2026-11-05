import { berekenOfferte } from "./bereken";
import type { Berekening, Instellingen, OfferteRegel } from "./types";

export interface PubliekeRegel {
  soort: "positie" | "artikel" | "kop" | "tekst" | "korting";
  titel: string | null;
  tekst: string | null;
  aantal: number;
  prijs: number;
  modus: "percentage" | "bedrag" | null;
  waarde: number | null;
  eenheid: string | null;
  positie: { nummer: number; ruimte: string | null; config: unknown } | null;
}

/** Wat de klant van een offerte te zien krijgt: alleen eindprijzen, nooit een aanpassing of reden. */
export interface PubliekeOfferte {
  bedrijf: string;
  nummer: string;
  versie: number;
  status: "verstuurd" | "akkoord";
  geldig_tot: string | null;
  verstuurd_op: string | null;
  project_naam: string;
  klant_naam: string;
  aanhef: string | null;
  achternaam: string | null;
  adres: { straat: string; huisnummer: string; toevoeging: string | null; postcode: string; plaats: string } | null;
  eigen_totaal: number | null;
  akkoord: { naam: string; op: string } | null;
  regels: PubliekeRegel[];
}

const SOORTEN = ["positie", "artikel", "kop", "tekst", "korting"];

/** Controleert de vorm van wat de database teruggeeft. */
export function leesPubliekeOfferte(invoer: unknown): PubliekeOfferte | null {
  if (typeof invoer !== "object" || invoer === null) return null;
  const o = invoer as Record<string, unknown>;
  if (typeof o.bedrijf !== "string" || typeof o.nummer !== "string" || !Array.isArray(o.regels)) return null;
  if (o.status !== "verstuurd" && o.status !== "akkoord") return null;
  if (!o.regels.every((r) => typeof r === "object" && r !== null && SOORTEN.includes((r as { soort?: string }).soort ?? ""))) return null;
  return invoer as PubliekeOfferte;
}

/** Zet de regels om naar de vorm voor de berekening. De prijzen zijn al de eindprijzen. */
export function naarOfferteRegels(p: PubliekeOfferte): OfferteRegel[] {
  return p.regels.map((r, i) => ({
    id: String(i),
    soort: r.soort,
    titel: r.titel,
    tekst: r.tekst,
    aantal: Number(r.aantal),
    prijs: Number(r.prijs),
    modus: r.modus,
    waarde: r.waarde === null ? null : Number(r.waarde),
  }));
}

export function berekenPubliek(p: PubliekeOfferte, inst: Instellingen): Berekening {
  return berekenOfferte(naarOfferteRegels(p), inst, { totaalOverride: p.eigen_totaal === null ? null : Number(p.eigen_totaal) });
}

const AANHEF: Record<string, string> = { dhr: "heer", mevr: "mevrouw" };

/** Vult invoegvelden in een tekst in: {aanhef}, {achternaam}, {adres}, {geldig_tot}, {offertenummer}. */
export function vulInvoegvelden(tekst: string, p: PubliekeOfferte): string {
  const adres = p.adres ? `${p.adres.straat} ${p.adres.huisnummer}${p.adres.toevoeging ? ` ${p.adres.toevoeging}` : ""}, ${p.adres.plaats}` : p.project_naam;
  const geldig = p.geldig_tot ? new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(new Date(p.geldig_tot)) : "";
  return tekst
    .replaceAll("{aanhef}", AANHEF[p.aanhef ?? ""] ?? "heer/mevrouw")
    .replaceAll("{achternaam}", p.achternaam ?? p.klant_naam)
    .replaceAll("{adres}", adres)
    .replaceAll("{geldig_tot}", geldig)
    .replaceAll("{offertenummer}", `${p.nummer}-v${p.versie}`);
}
