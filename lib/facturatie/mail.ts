import { euroTekst } from "../offerte/bereken";

export interface FactuurMailGegevens {
  begroeting: string;
  nummer: string;
  termijn: number;
  omschrijving: string;
  bedrag: number;
  /** Vervaldatum als tekst, bijvoorbeeld "8 november 2026". */
  vervaldatum: string;
  adres: string;
  bedrijf: string;
}

const afsluiting = (bedrijf: string) => ["Met vriendelijke groet,", bedrijf].join("\n");

/** Concepttekst voor de mail met de factuur. Tot de koppeling met Microsoft 365 er is, kopieert de medewerker deze tekst en voegt de PDF toe. */
export function maakFactuurMail(g: FactuurMailGegevens): { onderwerp: string; tekst: string } {
  const bedrag = euroTekst(g.bedrag, 2);
  const kern =
    g.termijn === 1
      ? `Bedankt voor uw opdracht! Hierbij ontvangt u de factuur voor de aanbetaling van uw nieuwe kozijnen (${g.adres}). Wilt u het bedrag van ${bedrag} voor ${g.vervaldatum} overmaken? Dan zorgen wij ervoor dat alles vlot in gang wordt gezet.`
      : g.termijn === 2
        ? `Vandaag leveren wij uw nieuwe kozijnen (${g.adres}) en beginnen wij met de montage. Hierbij ontvangt u de factuur voor deze termijn. Conform onze voorwaarden vragen wij u het bedrag van ${bedrag} vandaag over te maken. Alvast hartelijk bedankt!`
        : `Fijn dat uw nieuwe kozijnen (${g.adres}) zijn opgeleverd! Hierbij ontvangt u de eindfactuur. Wilt u het bedrag van ${bedrag} voor ${g.vervaldatum} overmaken?`;
  return {
    onderwerp: `Factuur ${g.nummer} - ${g.omschrijving}`,
    tekst: [g.begroeting, "", kern, "", "U vindt de factuur als bijlage. Heeft u een vraag? Laat het ons gerust weten.", "", afsluiting(g.bedrijf)].join("\n"),
  };
}

export interface HerinneringGegevens {
  begroeting: string;
  nummer: string;
  bedrag: number;
  vervaldatum: string;
  bedrijf: string;
  /** 1 = vriendelijke herinnering, 2 = tweede herinnering, 3 = laatste herinnering. */
  niveau: number;
}

/** Concepttekst voor een betalingsherinnering: vriendelijk, en bij elke volgende stap iets duidelijker. */
export function maakHerinneringMail(g: HerinneringGegevens): { onderwerp: string; tekst: string } {
  const bedrag = euroTekst(g.bedrag, 2);
  const kern =
    g.niveau <= 1
      ? `Wellicht is het u ontgaan, maar volgens onze administratie hebben wij het bedrag van factuur ${g.nummer} (${bedrag}, vervaldatum ${g.vervaldatum}) nog niet ontvangen. Wilt u dit bedrag overmaken? Heeft u al betaald, dan kunt u deze mail als niet verzonden beschouwen.`
      : g.niveau === 2
        ? `Op onze eerdere herinnering hebben wij nog geen betaling van factuur ${g.nummer} (${bedrag}, vervaldatum ${g.vervaldatum}) ontvangen. Wilt u het bedrag binnen 7 dagen overmaken? Is er iets niet duidelijk of loopt u tegen een probleem aan, neem dan contact met ons op, dan denken wij graag met u mee.`
        : `Dit is onze laatste herinnering voor factuur ${g.nummer} (${bedrag}, vervaldatum ${g.vervaldatum}). Wij verzoeken u het bedrag binnen 7 dagen over te maken. Kunt u om welke reden dan ook niet op tijd betalen? Neem dan vandaag nog contact met ons op, dan zoeken wij samen naar een oplossing.`;
  return {
    onderwerp: g.niveau <= 1 ? `Herinnering factuur ${g.nummer}` : g.niveau === 2 ? `Tweede herinnering factuur ${g.nummer}` : `Laatste herinnering factuur ${g.nummer}`,
    tekst: [g.begroeting, "", kern, "", "De factuur vindt u opnieuw als bijlage.", "", afsluiting(g.bedrijf)].join("\n"),
  };
}

/** Aantal dagen dat een factuur over de vervaldatum is (0 als hij nog niet verlopen is). */
export function dagenTeLaat(vervaldatumIso: string, vandaagIso: string): number {
  const ms = new Date(`${vandaagIso}T00:00:00Z`).getTime() - new Date(`${vervaldatumIso}T00:00:00Z`).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

export interface BetalingBevestigingGegevens {
  begroeting: string;
  nummer: string;
  /** Het bedrag van deze betaling. */
  bedrag: number;
  /** Datum van de betaling als tekst, bijvoorbeeld "8 november 2026". */
  betaaldOp: string;
  /** Wat er na deze betaling nog openstaat (0 = volledig voldaan). */
  resterend: number;
  /** Vervaldatum als tekst; alleen nodig bij een deelbetaling. */
  vervaldatum: string;
  bedrijf: string;
}

/** Concepttekst voor de bevestiging van een ontvangen betaling: volledig voldaan, of een deelbetaling met het resterende bedrag. */
export function maakBetalingBevestigingMail(g: BetalingBevestigingGegevens): { onderwerp: string; tekst: string } {
  const bedrag = euroTekst(g.bedrag, 2);
  const voldaan = g.resterend <= 0;
  const kern = voldaan
    ? `Wij hebben uw betaling van ${bedrag} (ontvangen op ${g.betaaldOp}) voor factuur ${g.nummer} in goede orde ontvangen. Daarmee is deze factuur volledig voldaan. Hartelijk dank!`
    : `Wij hebben uw betaling van ${bedrag} (ontvangen op ${g.betaaldOp}) voor factuur ${g.nummer} ontvangen. Hartelijk dank! Er staat nog ${euroTekst(g.resterend, 2)} open. Wilt u dit bedrag voor ${g.vervaldatum} overmaken?`;
  return {
    onderwerp: voldaan ? `Betaling ontvangen - factuur ${g.nummer}` : `Deelbetaling ontvangen - factuur ${g.nummer}`,
    tekst: [g.begroeting, "", kern, "", "Heeft u een vraag? Laat het ons gerust weten.", "", afsluiting(g.bedrijf)].join("\n"),
  };
}

/** Maakt een mailto-link waarmee het mailprogramma van de medewerker opent met adres, onderwerp en tekst al ingevuld. */
export function mailtoLink(aan: string | null | undefined, onderwerp: string, tekst: string): string {
  return `mailto:${encodeURIComponent((aan ?? "").trim()).replace(/%40/g, "@")}?subject=${encodeURIComponent(onderwerp)}&body=${encodeURIComponent(tekst).replace(/%0A/g, "%0D%0A")}`;
}
