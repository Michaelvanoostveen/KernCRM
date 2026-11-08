/**
 * Inloggen met een gebruikersnaam. Supabase Auth werkt altijd met een e-mailadres, dus een gebruikersnaam zoals "frits" wordt intern
 * het adres "info+frits@kernkozijnen.nl". Dat is een plusadres: de post komt in dezelfde mailbox als info@kernkozijnen.nl terecht, dus een
 * herstelmail voor een monteur komt bij kantoor uit. De monteur ziet dat adres nooit.
 *
 * Het aliasadres staat in de omgevingsvariabele ALIAS_ADRES (standaard info@kernkozijnen.nl). Later wordt dit een instelling per bedrijf.
 */
export const STANDAARD_ALIAS_ADRES = "info@kernkozijnen.nl";

const GEBRUIKERSNAAM = /^[a-z0-9._-]{2,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Maakt van een ingevoerde gebruikersnaam of e-mailadres het adres waarmee in Supabase wordt ingelogd. Null als de invoer geen van beide is. */
export function naarInlogAdres(invoer: string | null | undefined, alias: string = STANDAARD_ALIAS_ADRES): string | null {
  const tekst = (invoer ?? "").trim().toLowerCase();
  if (tekst === "") return null;
  if (tekst.includes("@")) return EMAIL.test(tekst) ? tekst : null;
  if (!GEBRUIKERSNAAM.test(tekst)) return null;
  const [lokaal, domein] = alias.trim().toLowerCase().split("@");
  if (!lokaal || !domein) return null;
  return `${lokaal}+${tekst}@${domein}`;
}

/** Is dit een adres dat uit een gebruikersnaam is gemaakt (een plusadres op het aliasadres)? Dan gaat herstelmail naar kantoor. */
export function isAliasAdres(adres: string, alias: string = STANDAARD_ALIAS_ADRES): boolean {
  const [lokaal, domein] = alias.trim().toLowerCase().split("@");
  const a = adres.trim().toLowerCase();
  return !!lokaal && !!domein && a.startsWith(`${lokaal}+`) && a.endsWith(`@${domein}`);
}

/** Wachtwoordregels bij het instellen van een nieuw wachtwoord. Geeft de foutmelding, of null als het wachtwoord goed is. */
export function controleerNieuwWachtwoord(wachtwoord: string, herhaling: string): string | null {
  if (wachtwoord.length < 10) return "Kies een wachtwoord van minstens 10 tekens.";
  if (wachtwoord.length > 72) return "Het wachtwoord is te lang (maximaal 72 tekens).";
  if (wachtwoord !== herhaling) return "De twee wachtwoorden zijn niet hetzelfde.";
  if (/^(.)\1+$/.test(wachtwoord)) return "Kies een wachtwoord met verschillende tekens.";
  return null;
}
