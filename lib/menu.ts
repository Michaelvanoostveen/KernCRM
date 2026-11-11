export type MenuItem = { href: string; label: string };

const START = { href: "/", label: "Start" };
const KLANTEN = { href: "/klanten", label: "Klanten" };
const PROJECTEN = { href: "/projecten", label: "Projecten" };
const MIJN_MONTAGES = { href: "/monteur", label: "Mijn montages" };
const INMETING = { href: "/inmeting", label: "Inmeting" };
const MONTAGE = { href: "/montage", label: "Montage" };
const WERKBONNEN = { href: "/werkbonnen", label: "Werkbonnen" };
const FACTUREN = { href: "/facturen", label: "Facturen" };
const BOEKHOUDING = { href: "/instellingen/boekhouding", label: "Boekhouding" };
const CATALOGUS = { href: "/instellingen/catalogus", label: "Catalogus" };
const GEBRUIKERS = { href: "/instellingen/gebruikers", label: "Gebruikers" };

/**
 * Het hoofdmenu per rol. Een inmeter ziet alleen zijn inmetingen. Werkbonnen en facturen zijn voor directie, kantoor en verkoop (de PDF van een werkbon alleen voor directie en kantoor).
 * De boekhouding (export en wachtrij) is voor directie en kantoor. De catalogus mogen directie, verkoop en kantoor inzien (alleen de directie beheert hem); de gebruikers beheert alleen de directie.
 * De monteur ziet alleen zijn eigen montages. Een onbekende rol ziet alleen Start.
 */
export function menuVoorRol(rol: string | null | undefined): MenuItem[] {
  switch (rol) {
    case "directie": return [START, KLANTEN, PROJECTEN, INMETING, MONTAGE, WERKBONNEN, FACTUREN, BOEKHOUDING, CATALOGUS, GEBRUIKERS];
    case "verkoop":
    case "kantoor": return rol === "kantoor" ? [START, KLANTEN, PROJECTEN, INMETING, MONTAGE, WERKBONNEN, FACTUREN, BOEKHOUDING, CATALOGUS] : [START, KLANTEN, PROJECTEN, INMETING, MONTAGE, WERKBONNEN, FACTUREN, CATALOGUS];
    case "inmeter": return [INMETING];
    case "monteur": return [MIJN_MONTAGES];
    default: return [START];
  }
}
