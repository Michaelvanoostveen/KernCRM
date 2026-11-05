export type OfferteStatus = "concept" | "verstuurd" | "akkoord" | "vervallen";

/** Eén project met de gegevens van zijn laatste offerte, voor het startscherm. */
export interface StartItem {
  projectId: string;
  nummer: string;
  naam: string;
  klantNaam: string;
  fase: string;
  verkoperId: string | null;
  gewijzigd: string;
  versie: number;
  status: OfferteStatus;
  verstuurdOp: string | null;
  geldigTot: string | null;
  totaal: number;
  aantalRegels: number;
  geopend: number;
  laatstGeopend: string | null;
  akkoordOp: string | null;
}

export type ActieSoort = "getekend" | "verlopen" | "verloopt" | "warm" | "ongeopend" | "stil" | "concept";

export interface Actie {
  projectId: string;
  nummer: string;
  naam: string;
  klantNaam: string;
  soort: ActieSoort;
  label: string;
  reden: string;
  bedrag: number;
  prioriteit: number;
}

const DAG = 86_400_000;
const dagenGeleden = (iso: string, nu: Date) => (nu.getTime() - new Date(iso).getTime()) / DAG;
const datumKort = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", timeZone: "Europe/Amsterdam" }).format(new Date(iso));
const datumTijd = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));
/** Datum van vandaag in Nederland als jjjj-mm-dd, om met een geldigheidsdatum te vergelijken. */
export const vandaag = (nu: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(nu);
const dagenTot = (datum: string, nu: Date) => Math.round((new Date(`${datum}T00:00:00Z`).getTime() - new Date(`${vandaag(nu)}T00:00:00Z`).getTime()) / DAG);

/** Bepaalt per project hooguit één actie, de belangrijkste, en sorteert op belang en bedrag. */
export function bepaalActies(items: StartItem[], nu: Date): Actie[] {
  const acties: Actie[] = [];
  for (const i of items) {
    const basis = { projectId: i.projectId, nummer: i.nummer, naam: i.naam, klantNaam: i.klantNaam, bedrag: i.totaal };
    const voeg = (soort: ActieSoort, prioriteit: number, label: string, reden: string) => acties.push({ ...basis, soort, prioriteit, label, reden });

    if (i.status === "akkoord" && i.fase === "akkoord") {
      voeg("getekend", 1, "Getekend", `Getekend door de klant${i.akkoordOp ? ` op ${datumKort(i.akkoordOp)}` : ""}. Klaar om de inmeting te plannen.`);
    } else if (i.status === "verstuurd" && i.geldigTot && dagenTot(i.geldigTot, nu) < 0) {
      voeg("verlopen", 2, "Verlopen", `Geldig tot ${datumKort(`${i.geldigTot}T12:00:00Z`)}, niet getekend. Maak een nieuwe versie of sluit het project af.`);
    } else if (i.status === "verstuurd" && i.geldigTot && dagenTot(i.geldigTot, nu) <= 3) {
      const n = dagenTot(i.geldigTot, nu);
      voeg("verloopt", 3, "Verloopt bijna", `De offerte verloopt ${n === 0 ? "vandaag" : n === 1 ? "morgen" : `over ${n} dagen`} en is nog niet getekend.`);
    } else if (i.status === "verstuurd" && i.geopend > 0 && i.laatstGeopend && dagenGeleden(i.laatstGeopend, nu) <= 3) {
      voeg("warm", 4, "Warm", `${i.geopend}× door de klant bekeken, laatst ${datumTijd(i.laatstGeopend)}. Goed moment om na te bellen.`);
    } else if (i.status === "verstuurd" && i.geopend === 0 && i.verstuurdOp && dagenGeleden(i.verstuurdOp, nu) >= 3) {
      voeg("ongeopend", 5, "Niet geopend", `Verstuurd op ${datumKort(i.verstuurdOp)} en nog niet geopend. Controleer of de mail is aangekomen.`);
    } else if (i.status === "verstuurd" && i.geopend > 0 && i.laatstGeopend && dagenGeleden(i.laatstGeopend, nu) >= 7) {
      voeg("stil", 6, "Geen reactie", `Laatst bekeken op ${datumKort(i.laatstGeopend)}, sindsdien geen reactie.`);
    } else if (i.status === "concept" && i.aantalRegels > 0 && dagenGeleden(i.gewijzigd, nu) >= 7) {
      voeg("concept", 7, "Concept", `Het concept staat al ${Math.floor(dagenGeleden(i.gewijzigd, nu))} dagen open.`);
    }
  }
  return acties.sort((a, b) => a.prioriteit - b.prioriteit || b.bedrag - a.bedrag);
}

export const FASE_VOLGORDE = ["lead", "offerte", "akkoord", "inmeting", "bestelling", "montage", "oplevering", "service"] as const;

export interface Kolom {
  fase: string;
  items: StartItem[];
  totaal: number;
}

/** Groepeert de projecten per fase. De eerste drie fases tonen we altijd, de rest alleen als er iets in staat. */
export function groepeerPijplijn(items: StartItem[]): Kolom[] {
  return FASE_VOLGORDE.map((fase, index) => {
    const lijst = items.filter((i) => i.fase === fase).sort((a, b) => new Date(b.gewijzigd).getTime() - new Date(a.gewijzigd).getTime());
    return { fase, items: lijst, totaal: Math.round(lijst.reduce((s, i) => s + i.totaal, 0) * 100) / 100, altijd: index < 3 };
  })
    .filter((k) => k.items.length > 0 || k.altijd)
    .map(({ fase, items: lijst, totaal }) => ({ fase, items: lijst, totaal }));
}

export interface Activiteit {
  offerteSleutel: string;
  projectId: string;
  naam: string;
  klantNaam: string;
  soort: "verstuurd" | "geopend" | "akkoord";
  op: string;
  aantal: number;
}

export function begroeting(nu: Date): string {
  const uur = Number(new Intl.DateTimeFormat("nl-NL", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Amsterdam" }).format(nu));
  return uur < 12 ? "Goedemorgen" : uur < 18 ? "Goedemiddag" : "Goedenavond";
}
