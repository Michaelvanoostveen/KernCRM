export type MenuItem = { href: string; label: string };

const START = { href: "/", label: "Start" };
const KLANTEN = { href: "/klanten", label: "Klanten" };
const PROJECTEN = { href: "/projecten", label: "Projecten" };
const INMETING = { href: "/inmeting", label: "Inmeting" };
const FACTUREN = { href: "/facturen", label: "Facturen" };
const CATALOGUS = { href: "/instellingen/catalogus", label: "Catalogus" };
const GEBRUIKERS = { href: "/instellingen/gebruikers", label: "Gebruikers" };

/**
 * Het hoofdmenu per rol. Een inmeter ziet alleen zijn inmetingen. Facturen zijn voor directie, kantoor en verkoop.
 * De catalogus mogen directie, verkoop en kantoor inzien (alleen de directie beheert hem); de gebruikers beheert alleen de directie.
 * Een rol zonder eigen schermen (bijvoorbeeld de monteur, tot de montage-app er is) ziet alleen Start.
 */
export function menuVoorRol(rol: string | null | undefined): MenuItem[] {
  switch (rol) {
    case "directie": return [START, KLANTEN, PROJECTEN, INMETING, FACTUREN, CATALOGUS, GEBRUIKERS];
    case "verkoop":
    case "kantoor": return [START, KLANTEN, PROJECTEN, INMETING, FACTUREN, CATALOGUS];
    case "inmeter": return [INMETING];
    default: return [START];
  }
}
