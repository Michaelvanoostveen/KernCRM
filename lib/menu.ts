export type MenuItem = { href: string; label: string; /** Aantal ongelezen meldingen of dergelijke, als teken bij het onderdeel. */ badge?: number };

const START = { href: "/", label: "Start" };
const MELDINGEN = { href: "/meldingen", label: "Meldingen" };
const KLANTEN = { href: "/klanten", label: "Klanten" };
const PROJECTEN = { href: "/projecten", label: "Projecten" };
const MIJN_MONTAGES = { href: "/monteur", label: "Mijn montages" };
const INMETING = { href: "/inmeting", label: "Inmeting" };
const MONTAGE = { href: "/montage", label: "Montage" };
const WERKBONNEN = { href: "/werkbonnen", label: "Werkbonnen" };
const FACTUREN = { href: "/facturen", label: "Facturen" };
const BOEKHOUDING = { href: "/instellingen/boekhouding", label: "Boekhouding" };
const EMAIL = { href: "/instellingen/email", label: "E-mail" };
const CATALOGUS = { href: "/instellingen/catalogus", label: "Catalogus" };
const GEBRUIKERS = { href: "/instellingen/gebruikers", label: "Gebruikers" };

/**
 * Het hoofdmenu per rol. Een inmeter ziet alleen zijn inmetingen. Werkbonnen en facturen zijn voor directie, kantoor en verkoop (de PDF van een werkbon alleen voor directie en kantoor).
 * De boekhouding (export en wachtrij) is voor directie en kantoor. De catalogus mogen directie, verkoop en kantoor inzien (alleen de directie beheert hem); de gebruikers beheert alleen de directie.
 * Meldingen (bijvoorbeeld "de klant heeft de offerte geopend") zijn voor directie, kantoor en verkoop. De monteur ziet alleen zijn eigen montages. Een onbekende rol ziet alleen Start.
 */
export function menuVoorRol(rol: string | null | undefined): MenuItem[] {
  switch (rol) {
    case "directie": return [START, MELDINGEN, KLANTEN, PROJECTEN, INMETING, MONTAGE, WERKBONNEN, FACTUREN, BOEKHOUDING, EMAIL, CATALOGUS, GEBRUIKERS];
    case "verkoop":
    case "kantoor": return rol === "kantoor" ? [START, MELDINGEN, KLANTEN, PROJECTEN, INMETING, MONTAGE, WERKBONNEN, FACTUREN, BOEKHOUDING, EMAIL, CATALOGUS] : [START, MELDINGEN, KLANTEN, PROJECTEN, INMETING, MONTAGE, WERKBONNEN, FACTUREN, CATALOGUS];
    case "inmeter": return [INMETING];
    case "monteur": return [MIJN_MONTAGES];
    default: return [START];
  }
}

export type MenuGroep = { titel: string | null; items: MenuItem[] };

const GROEP_VAN: Record<string, string> = {
  "/klanten": "Verkoop", "/projecten": "Verkoop",
  "/inmeting": "Uitvoering", "/montage": "Uitvoering", "/werkbonnen": "Uitvoering",
  "/facturen": "Financieel", "/instellingen/boekhouding": "Financieel",
  "/instellingen/email": "Beheer", "/instellingen/catalogus": "Beheer", "/instellingen/gebruikers": "Beheer",
};
const GROEP_VOLGORDE = ["Verkoop", "Uitvoering", "Financieel", "Beheer"];

/**
 * Het menu in groepen voor de zijbalk: bovenaan de losse onderdelen (Start), dan Verkoop, Uitvoering, Financieel en Beheer. Wie maar een of twee onderdelen heeft
 * (een monteur of inmeter) krijgt één groep zonder titels. Dezelfde onderdelen en rechten als menuVoorRol.
 */
export function menuGroepen(rol: string | null | undefined): MenuGroep[] {
  const items = menuVoorRol(rol);
  if (items.length <= 3) return [{ titel: null, items }];
  const los = items.filter((i) => !GROEP_VAN[i.href]);
  const groepen: MenuGroep[] = los.length ? [{ titel: null, items: los }] : [];
  for (const titel of GROEP_VOLGORDE) {
    const leden = items.filter((i) => GROEP_VAN[i.href] === titel);
    if (leden.length) groepen.push({ titel, items: leden });
  }
  return groepen;
}
