export interface WerkbonRegel { positie_id: string; geplaatst: boolean; afgesteld: boolean; afgekit: boolean; afgewerkt: boolean; opmerking: string | null }
export interface Opleverpunt { id: string; positie_id: string | null; omschrijving: string; status: "open" | "opgelost"; opgelost_op: string | null }
export interface WerkbonFoto { id: string; positie_id: string | null; soort: "voor" | "na" | "punt" | "overig"; pad: string }
export interface WerkbonUren { monteur: string; monteur_id: string; datum: string; uren: number; notitie: string | null }
export interface Meerwerk { id: string; positie_id: string | null; omschrijving: string; aantal: number; meerprijs: number; status: "voorgesteld" | "akkoord" }
export interface Werkbon {
  id: string;
  status: "open" | "opgeleverd";
  bijzonderheden: string | null;
  kantoor_actie: boolean;
  opgeruimd: boolean;
  kantoor_gezien_op: string | null;
  opgeleverd_op: string | null;
  regels: WerkbonRegel[];
  uren: WerkbonUren[];
  fotos: WerkbonFoto[];
  punten: Opleverpunt[];
  meerwerk: Meerwerk[];
  akkoord: { naam: string; op: string; met_voorbehoud: boolean; aantal_open_punten: number } | null;
}

export const FOTO_BUCKET_WERKBON = "werkbon-fotos";
export const werkbonFotoPad = (montageId: string, fotoId: string) => `${montageId}/${fotoId}.jpg`;

/** De stappen van de checklist per kozijn, in de volgorde waarin de monteur ze afwerkt. */
export const CHECKLIST = [
  { sleutel: "geplaatst", label: "Geplaatst" },
  { sleutel: "afgesteld", label: "Afgesteld, alles sluit en werkt" },
  { sleutel: "afgekit", label: "Afgekit" },
  { sleutel: "afgewerkt", label: "Binnen afgewerkt" },
] as const;
export type ChecklistSleutel = (typeof CHECKLIST)[number]["sleutel"];

export function leesWerkbon(invoer: unknown): Werkbon | null {
  if (typeof invoer !== "object" || invoer === null) return null;
  const o = invoer as Partial<Werkbon>;
  if (typeof o.id !== "string") return null;
  const lijst = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
  return {
    id: o.id, status: o.status === "opgeleverd" ? "opgeleverd" : "open", bijzonderheden: o.bijzonderheden ?? null, kantoor_actie: !!o.kantoor_actie, opgeruimd: !!o.opgeruimd,
    kantoor_gezien_op: o.kantoor_gezien_op ?? null, opgeleverd_op: o.opgeleverd_op ?? null,
    regels: lijst<WerkbonRegel>(o.regels), uren: lijst<WerkbonUren>(o.uren).map((u) => ({ ...u, uren: Number(u.uren) })), fotos: lijst<WerkbonFoto>(o.fotos), punten: lijst<Opleverpunt>(o.punten),
    meerwerk: lijst<Meerwerk>(o.meerwerk).map((x) => ({ ...x, meerprijs: Number(x.meerprijs), aantal: Number(x.aantal) })),
    akkoord: o.akkoord ?? null,
  };
}

export const regelKlaar = (r: WerkbonRegel) => r.geplaatst && r.afgesteld && r.afgekit && r.afgewerkt;

/** Aantal kozijnen dat nog niet kan worden opgeleverd: niet geplaatst, of een stap mist zonder dat daar een open opleverpunt voor staat. Zelfde regel als in de database. */
export function onvolledigeKozijnen(regels: WerkbonRegel[], punten: Opleverpunt[]): number {
  return regels.filter((r) => !r.geplaatst || (!regelKlaar(r) && !punten.some((p) => p.status === "open" && p.positie_id === r.positie_id))).length;
}

export const openPunten = (punten: Opleverpunt[]) => punten.filter((p) => p.status === "open").length;

/** Totaal aantal uren en de uren per monteur. */
export function urenOverzicht(uren: WerkbonUren[]): { totaal: number; perMonteur: { monteur: string; uren: number }[] } {
  const per = new Map<string, number>();
  for (const u of uren) per.set(u.monteur, Math.round(((per.get(u.monteur) ?? 0) + u.uren) * 100) / 100);
  const lijst = [...per.entries()].map(([monteur, u]) => ({ monteur, uren: u }));
  return { totaal: Math.round(lijst.reduce((s, x) => s + x.uren, 0) * 100) / 100, perMonteur: lijst };
}

/** De uren in stappen van een kwartier tot 16 uur, voor de keuzelijst. */
export const URENSTAPPEN: number[] = Array.from({ length: 16 * 4 }, (_, i) => (i + 1) / 4);
export const urenTekst = (u: number) => `${u.toLocaleString("nl-NL", { maximumFractionDigits: 2 })} u`;

/**
 * Welke foto's gaan mee in de PDF? Per kozijn hooguit drie foto's van na de montage en in totaal hooguit zes foto's bij opleverpunten:
 * zo blijft het bestand klein en leesbaar. De rest staat in het CRM.
 */
export function kiesPdfFotos(fotos: WerkbonFoto[], kozijnIds: string[]): { perKozijn: Map<string, WerkbonFoto[]>; punten: WerkbonFoto[] } {
  const perKozijn = new Map<string, WerkbonFoto[]>();
  for (const id of kozijnIds) perKozijn.set(id, fotos.filter((f) => f.soort === "na" && f.positie_id === id).slice(0, 3));
  return { perKozijn, punten: fotos.filter((f) => f.soort === "punt").slice(0, 6) };
}

/** Naam van het PDF-bestand, zonder tekens die in een bestandsnaam niet kunnen. */
export const werkbonBestandsnaam = (projectNummer: string) => `Werkbon-${projectNummer}.pdf`.replace(/[^A-Za-z0-9._-]/g, "-");

/** Totaal (incl. btw) van het meerwerk met een bepaalde status, op de cent afgerond. */
export function meerwerkTotaal(lijst: Meerwerk[], status: Meerwerk["status"]): number {
  return Math.round(lijst.filter((x) => x.status === status).reduce((s, x) => s + Math.round(x.meerprijs * 100), 0)) / 100;
}
