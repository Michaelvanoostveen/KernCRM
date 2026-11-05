import type { Instellingen } from "./types";

/** Besluiten van 5 november 2026. Later per bedrijf in te stellen in de database. */
export const INSTELLINGEN_KERNKOZIJNEN: Instellingen = {
  btwHoog: 0.21,
  btwLaag: 0.09,
  deelHoog: 0.7,
  termijnen: [
    { naam: "Bij akkoord", pct: 30, toelichting: "aanbetaling, binnen 3 dagen na uw akkoord" },
    { naam: "Eerste dag van de levering en montage", pct: 65, toelichting: "op de dag dat wij uw kozijnen leveren en gaan monteren" },
    { naam: "Na oplevering", pct: 5, toelichting: "zodra alles is opgeleverd" },
  ],
  maxKortingGebruiker: 10,
};

export const SJABLONEN = {
  betaling: { titel: "Betaling", tekst: "Conform onze voorwaarden betaalt u 30% als aanbetaling, binnen 3 dagen na uw akkoord. De volgende 65% voldoet u op de dag dat wij uw kozijnen leveren en met de montage beginnen. De laatste 5% betaalt u na oplevering. U ontvangt per termijn een factuur." },
  planning: { titel: "Planning", tekst: "Na akkoord plannen wij de inmeting. De levertijd van de kozijnen is circa 6 tot 8 weken. De montage plannen wij zodra de leverdatum bekend is." },
  voorwaarden: { titel: "Voorwaarden en garantie", tekst: "Op onze kozijnen en de montage geldt 10 jaar garantie. Op uw opdracht zijn onze algemene voorwaarden van toepassing. Prijzen zijn inclusief btw." },
} as const;

export type SjabloonSleutel = keyof typeof SJABLONEN;
