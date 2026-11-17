import type { SupabaseClient } from "@supabase/supabase-js";
import { begroeting } from "./bereken";
import { creditnotaBestandsnaam, factuurBestandsnaam, maakFactuurPdf } from "./pdf";

type Debiteur = { naam?: string; aanhef?: string | null; achternaam?: string | null; regels?: string[] } | null;
const regelsVan = (d: Debiteur) => (Array.isArray(d?.regels) ? d.regels.filter((r): r is string => typeof r === "string") : []);

/** Maakt de PDF van een factuur voor wie leesrechten heeft; null als de factuur voor deze gebruiker niet bestaat. Eén bron voor de download en de mail. */
export async function laadFactuurPdf(supabase: SupabaseClient, id: string): Promise<{ pdf: Buffer; bestandsnaam: string } | null> {
  const { data: f } = await supabase.from("facturen")
    .select("nummer, factuurdatum, vervaldatum, omschrijving, toelichting, bedrag_excl, btw_hoog, btw_laag, totaal_incl, meerwerk, status, debiteur, projecten(nummer, naam)")
    .eq("id", id).maybeSingle();
  if (!f) return null;
  // Een actieve betaallink komt onderaan de factuur (alleen bij een open factuur).
  const vandaag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date());
  const { data: link } = f.status === "open"
    ? await supabase.from("factuur_betaallinks").select("url").eq("factuur_id", id).eq("status", "open").or(`geldig_tot.is.null,geldig_tot.gte.${vandaag}`).maybeSingle()
    : { data: null };
  // De klantgegevens zoals ze waren bij het aanmaken van de factuur, niet zoals ze nu in het klantbestand staan.
  const project = f.projecten as unknown as { nummer: string; naam: string } | null;
  const debiteur = f.debiteur as Debiteur;
  const klantNaam = debiteur?.naam ?? "";
  const pdf = await maakFactuurPdf({
    nummer: f.nummer, factuurdatum: f.factuurdatum, vervaldatum: f.vervaldatum, omschrijving: f.omschrijving, toelichting: f.toelichting,
    bedragExcl: Number(f.bedrag_excl), btwHoog: Number(f.btw_hoog), btwLaag: Number(f.btw_laag), totaal: Number(f.totaal_incl), meerwerk: Number(f.meerwerk),
    status: f.status, betaalLink: (link as { url?: string } | null)?.url ?? null, projectNummer: project?.nummer ?? "", projectNaam: project?.naam ?? "", klantNaam,
    begroeting: begroeting(debiteur?.aanhef, debiteur?.achternaam, klantNaam), adresRegels: regelsVan(debiteur),
  });
  return { pdf, bestandsnaam: factuurBestandsnaam(f.nummer) };
}

/** Maakt de PDF van een creditnota; null als hij voor deze gebruiker niet bestaat. */
export async function laadCreditnotaPdf(supabase: SupabaseClient, id: string): Promise<{ pdf: Buffer; bestandsnaam: string } | null> {
  const { data: c } = await supabase.from("creditnotas")
    .select("nummer, datum, omschrijving, bedrag_excl, btw_hoog, btw_laag, totaal_incl, debiteur, facturen(nummer), projecten(nummer, naam)")
    .eq("id", id).maybeSingle();
  if (!c) return null;
  const project = c.projecten as unknown as { nummer: string; naam: string } | null;
  const factuur = c.facturen as unknown as { nummer: string } | null;
  const debiteur = c.debiteur as Debiteur;
  const klantNaam = debiteur?.naam ?? "";
  const pdf = await maakFactuurPdf({
    soort: "creditnota", verwijstNaar: factuur?.nummer ?? "",
    nummer: c.nummer, factuurdatum: c.datum, vervaldatum: c.datum, omschrijving: c.omschrijving, toelichting: null,
    bedragExcl: Number(c.bedrag_excl), btwHoog: Number(c.btw_hoog), btwLaag: Number(c.btw_laag), totaal: Number(c.totaal_incl), meerwerk: 0,
    status: "open", projectNummer: project?.nummer ?? "", projectNaam: project?.naam ?? "", klantNaam,
    begroeting: begroeting(debiteur?.aanhef, debiteur?.achternaam, klantNaam), adresRegels: regelsVan(debiteur),
  });
  return { pdf, bestandsnaam: creditnotaBestandsnaam(c.nummer) };
}
