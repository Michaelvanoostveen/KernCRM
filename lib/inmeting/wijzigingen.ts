import { berekenPrijs, PrijsFout, zoekProduct, zoekVariant } from "../prijs/berekenen";
import type { Configuratie, Prijsregels } from "../prijs/types";
import { effectieveVariant } from "../tekening/tekenen";

/** Wat de inmeter mag aanpassen aan een positie: indeling, draairichting per vak, kleur en glas. De maat blijft de offertemaat. */
export interface Voorstel {
  variant: string;
  cols: string[] | null;
  kleur: string;
  kleurVleugel: string | null;
  glas: string;
}

export interface Wijziging {
  id: string;
  positie_id: string | null;
  soort: "configuratie" | "extra";
  nieuwe_config: unknown;
  omschrijving: string;
  aantal: number;
  meerprijs: number;
  status: "voorgesteld" | "akkoord" | "vervallen";
}

export function leesWijzigingen(invoer: unknown): Wijziging[] {
  if (!Array.isArray(invoer)) return [];
  return invoer.flatMap((r) => {
    if (typeof r !== "object" || r === null) return [];
    const o = r as Record<string, unknown>;
    const meerprijs = Number(o.meerprijs);
    if (typeof o.id !== "string" || !Number.isFinite(meerprijs)) return [];
    if (o.soort !== "configuratie" && o.soort !== "extra") return [];
    if (o.status !== "voorgesteld" && o.status !== "akkoord" && o.status !== "vervallen") return [];
    return [{
      id: o.id, positie_id: typeof o.positie_id === "string" ? o.positie_id : null, soort: o.soort, nieuwe_config: o.nieuwe_config ?? null,
      omschrijving: String(o.omschrijving ?? ""), aantal: Number(o.aantal) || 1, meerprijs, status: o.status,
    }];
  });
}

/** Bouwt de nieuwe configuratie: alleen de toegestane velden veranderen, de rest (product, maat, beslag, profiel) blijft zoals in de offerte. */
export function pasVoorstelToe(oud: Configuratie, v: Voorstel): Configuratie {
  return { ...oud, variant: v.variant, cols: v.cols, kleur: v.kleur, kleurVleugel: v.kleurVleugel, glas: v.glas };
}

/**
 * Meerprijs van een gewijzigde configuratie, voor het totale aantal van de positie. Kan negatief zijn.
 * Gooit een PrijsFout als de keuzes niet bestaan of niet kloppen.
 */
export function meerprijsConfiguratie(regels: Prijsregels, oud: Configuratie, nieuw: Configuratie, aantal: number): number {
  const product = zoekProduct(regels, nieuw.product);
  const variant = zoekVariant(product, nieuw.variant);
  const effectief = effectieveVariant(variant, nieuw.cols);
  if (nieuw.cols && effectief.cols && nieuw.cols.length !== effectief.cols.length) throw new PrijsFout("Het aantal vakken klopt niet.");
  for (const t of nieuw.cols ?? []) if (!regels.vak[t]) throw new PrijsFout(`Onbekend vaktype "${t}".`);
  if (!regels.glas[nieuw.glas]) throw new PrijsFout("Onbekend glas.");
  if (!regels.kleuren[nieuw.kleur] || (nieuw.kleurVleugel && !regels.kleuren[nieuw.kleurVleugel])) throw new PrijsFout("Onbekende kleur.");
  const verschil = berekenPrijs(regels, nieuw).prijs - berekenPrijs(regels, oud).prijs;
  return Math.round(verschil * aantal * 100) / 100;
}

/** Korte omschrijving van wat er verandert, voor de klant en voor kantoor. */
export function beschrijfWijziging(regels: Prijsregels, oud: Configuratie, nieuw: Configuratie): string {
  const delen: string[] = [];
  const product = regels.producten[oud.product];
  if (oud.variant !== nieuw.variant) {
    const l = (k: string) => product?.variants.find((x) => x.key === k)?.label ?? k;
    delen.push(`indeling ${l(oud.variant)} → ${l(nieuw.variant)}`);
  }
  const vakken = (c: Configuratie) => {
    const v = product?.variants.find((x) => x.key === c.variant);
    return c.cols ?? (v?.cols as string[] | undefined) ?? (v?.stack as string[] | undefined) ?? [];
  };
  const [a, b] = [vakken(oud), vakken(nieuw)];
  if (oud.variant === nieuw.variant) {
    b.forEach((t, i) => { if (a[i] !== t) delen.push(`vak ${i + 1}: ${regels.vak[t]?.kort ?? t}`); });
  }
  const kleurNaam = (k: string | null | undefined) => (k ? regels.kleuren[k]?.label ?? k : "");
  if (oud.kleur !== nieuw.kleur) delen.push(`kleur ${kleurNaam(oud.kleur)} → ${kleurNaam(nieuw.kleur)}`);
  if ((oud.kleurVleugel ?? "") !== (nieuw.kleurVleugel ?? "")) delen.push(`kleur vleugels ${kleurNaam(nieuw.kleurVleugel) || "zelfde als kozijn"}`);
  if (oud.glas !== nieuw.glas) delen.push(`glas ${regels.glas[oud.glas]?.label ?? oud.glas} → ${regels.glas[nieuw.glas]?.label ?? nieuw.glas}`);
  return delen.length ? delen.join("; ") : "Geen wijziging";
}

export function heeftWijziging(oud: Configuratie, nieuw: Configuratie): boolean {
  const gelijk = (x?: string[] | null, y?: string[] | null) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
  return oud.variant !== nieuw.variant || oud.kleur !== nieuw.kleur || (oud.kleurVleugel ?? "") !== (nieuw.kleurVleugel ?? "") || oud.glas !== nieuw.glas || !gelijk(oud.cols, nieuw.cols);
}
