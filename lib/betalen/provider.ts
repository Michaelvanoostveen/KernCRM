export type BetaalStatus = "open" | "betaald" | "verlopen" | "mislukt";

export interface BetaalVerzoek {
  /** Bedrag incl. btw dat de klant moet betalen. */
  bedrag: number;
  omschrijving: string;
  factuurNummer: string;
  /** Waar de klant na het betalen terechtkomt. */
  terugUrl: string;
  /** Waar de betaaldienst een bericht stuurt als de status verandert. */
  meldUrl: string;
}

/**
 * De aansluiting met een betaaldienst (Mollie, later andere). Het CRM praat alleen met dit contract. Een aansluiting maakt een betaling aan
 * (en geeft de link voor de klant terug) en kan de status van een betaling opvragen.
 */
export interface BetaalProvider {
  naam: string;
  controleer(): Promise<{ ok: boolean; melding: string }>;
  maakBetaling(verzoek: BetaalVerzoek): Promise<{ externId: string; url: string; geldigTot: string | null }>;
  haalStatus(externId: string): Promise<BetaalStatus>;
}

/** Zolang er geen echte verbinding is: elke handeling meldt vriendelijk dat de koppeling nog niet is verbonden. */
export class NietVerbondenBetaalProvider implements BetaalProvider {
  constructor(public readonly naam: string) {}
  async controleer() {
    return { ok: false, melding: `De koppeling met ${this.naam} is nog niet verbonden. Tot die tijd maak je de betaallink zelf in het dashboard van ${this.naam} en leg je hem vast bij de factuur.` };
  }
  async maakBetaling(): Promise<{ externId: string; url: string; geldigTot: string | null }> {
    throw new Error(`De koppeling met ${this.naam} is nog niet verbonden.`);
  }
  async haalStatus(): Promise<BetaalStatus> {
    throw new Error(`De koppeling met ${this.naam} is nog niet verbonden.`);
  }
}

/** Kiest de aansluiting voor een bedrijf. Mollie volgt zodra we een API-sleutel hebben; tot dan is dat een niet-verbonden aansluiting. */
export function maakBetaalProvider(provider: string): BetaalProvider {
  switch (provider) {
    case "mollie": return new NietVerbondenBetaalProvider("Mollie");
    default: return new NietVerbondenBetaalProvider("de betaaldienst");
  }
}

/** Dezelfde controle als in de database: alleen https, een gewone hostnaam (geen gebruikersnaam of wachtwoord in de link), alleen URL-veilige tekens. */
const BETAALLINK = /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?(\/[A-Za-z0-9._~!$&()*+,;=:@%/?#-]*)?$/i;

/** Is dit een bruikbare betaallink? Alleen https, geen aanhalingstekens of spaties, geen inloggegevens in de link en niet te lang. */
export function isBetaalLink(url: string): boolean {
  const t = url.trim();
  if (t.length > 500 || !BETAALLINK.test(t)) return false;
  try {
    return new URL(t).protocol === "https:";
  } catch {
    return false;
  }
}
