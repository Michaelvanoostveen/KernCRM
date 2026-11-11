import type { Boeking } from "./boeking";

export interface BetaalStatus { externRef: string; betaald: boolean; betaaldOp?: string }

/**
 * De aansluiting met een boekhoudpakket. Elk pakket (Twinfield, later andere) is één implementatie; de rest van het CRM praat alleen met dit
 * contract en nooit rechtstreeks met een pakket. Een aansluiting boekt een verkoopfactuur of creditnota en kan de betaalstatus teruggeven.
 */
export interface BoekhoudProvider {
  naam: string;
  /** Kan de aansluiting verbinden met de instellingen van dit bedrijf? */
  controleer(): Promise<{ ok: boolean; melding: string }>;
  /** Boekt een verkoopfactuur of creditnota en geeft de verwijzing in het pakket terug. */
  boek(boeking: Boeking): Promise<{ externRef: string }>;
  /** Vraagt van eerder geboekte facturen op of ze zijn betaald. */
  haalBetaalStatus(externeRefs: string[]): Promise<BetaalStatus[]>;
}

/** Zolang er geen echte verbinding is: elke handeling meldt vriendelijk dat de koppeling nog niet is verbonden. */
export class NietVerbondenProvider implements BoekhoudProvider {
  constructor(public readonly naam: string) {}
  async controleer() {
    return { ok: false, melding: `De koppeling met ${this.naam} is nog niet verbonden. Tot die tijd boek je met de export en markeer je de facturen als verwerkt.` };
  }
  async boek(): Promise<{ externRef: string }> {
    throw new Error(`De koppeling met ${this.naam} is nog niet verbonden.`);
  }
  async haalBetaalStatus(): Promise<BetaalStatus[]> {
    throw new Error(`De koppeling met ${this.naam} is nog niet verbonden.`);
  }
}

/** Kiest de aansluiting voor een bedrijf. Twinfield volgt zodra we toegang hebben tot een Twinfield-account; tot dan is dat een niet-verbonden aansluiting. */
export function maakProvider(provider: string): BoekhoudProvider {
  switch (provider) {
    case "twinfield": return new NietVerbondenProvider("Twinfield");
    default: return new NietVerbondenProvider("de boekhouding");
  }
}
