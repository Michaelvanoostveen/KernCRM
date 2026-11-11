"use server";

import { redirect } from "next/navigation";
import { maakServerClient } from "@/lib/supabase/server";
import { parseBedrag } from "@/lib/bedrag";
import { INSTELLINGEN_KERNKOZIJNEN } from "@/lib/offerte/instellingen";
import { betaaldagen, factuurTeksten, splitsBtw } from "@/lib/facturatie/bereken";
import { isBetaalLink } from "@/lib/betalen/provider";
import { laadFactuurplan } from "./plan";

type FactuurRij = { id: string; omschrijving: string; toelichting: string | null; vervaldatum: string; totaal_incl: number | string; bedrag_excl: number | string; btw_hoog: number | string; btw_laag: number | string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Meldingscodes die de projectpagina laat zien (?factuur=...). */
const terug = (projectId: string, code: string): never => redirect(`/projecten/${projectId}?factuur=${code}#facturen`);

/** Terug naar de factuurpagina (formulier met naar=factuur) of naar de projectpagina. */
const keer = (formData: FormData, projectId: string, factuurId: string, code: string): never =>
  formData.get("naar") === "factuur" && UUID.test(factuurId) ? redirect(`/facturen/${factuurId}?m=${code}`) : terug(projectId, code);

/** Maakt de factuur voor een termijn: bedragen uit de getekende offerte, bij de eindtermijn met het goedgekeurde meerwerk. */
export async function maakFactuur(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  if (!UUID.test(projectId)) redirect("/projecten");
  const nr = Number(formData.get("termijn"));
  const supabase = await maakServerClient();

  const plan = await laadFactuurplan(supabase, projectId);
  if (!plan || plan.offerteStatus !== "akkoord") return terug(projectId, "geen_akkoord");
  const termijn = plan.plan.find((t) => t.nr === nr);
  if (!termijn) return terug(projectId, "ongeldig");
  if (termijn.nr === plan.plan.length && plan.inmetingOpen) return terug(projectId, "inmeting_open");

  const btw = splitsBtw(termijn.bedrag, INSTELLINGEN_KERNKOZIJNEN);
  const tekst = factuurTeksten(termijn.nr, termijn.pct, termijn.meerwerk !== 0);
  const { data, error } = await supabase.rpc("maak_factuur", {
    p_project: projectId, p_termijn: termijn.nr, p_pct: termijn.pct, p_omschrijving: tekst.omschrijving, p_toelichting: tekst.toelichting,
    p_dagen: betaaldagen(termijn.nr), p_excl: btw.exclBtw, p_hoog: btw.btwHoog, p_laag: btw.btwLaag, p_incl: btw.totaal, p_meerwerk: termijn.meerwerk,
  });
  if (error) {
    console.error("factuur maken mislukt:", error.code, error.message);
    return terug(projectId, "mislukt");
  }
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  return terug(projectId, uitkomst?.ok ? "gemaakt" : uitkomst?.fout ?? "mislukt");
}

/** Registreert een betaling op een factuur (handmatig, bijvoorbeeld na het zien van de bankafschriften). */
export async function registreerBetaling(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const factuurId = String(formData.get("factuur_id") ?? "");
  if (!UUID.test(projectId)) redirect("/projecten");
  if (!UUID.test(factuurId)) return keer(formData, projectId, factuurId, "ongeldig");
  const bedrag = parseBedrag(String(formData.get("bedrag") ?? ""));
  const datum = String(formData.get("datum") ?? "");
  if (bedrag === null || Number.isNaN(bedrag) || bedrag <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return keer(formData, projectId, factuurId, "ongeldig");

  const supabase = await maakServerClient();
  const { data, error } = await supabase.rpc("registreer_betaling", { p_factuur: factuurId, p_bedrag: bedrag, p_datum: datum, p_notitie: String(formData.get("notitie") ?? "") });
  if (error) {
    console.error("betaling registreren mislukt:", error.code, error.message);
    return keer(formData, projectId, factuurId, "mislukt");
  }
  const uitkomst = data as { ok?: boolean; fout?: string; betaald?: boolean } | null;
  return keer(formData, projectId, factuurId, uitkomst?.ok ? (uitkomst.betaald ? "betaald" : "deelbetaling") : uitkomst?.fout ?? "mislukt");
}

/** Annuleert een factuur zonder betalingen, met een reden. Daarna kan de termijn opnieuw worden gefactureerd. */
export async function annuleerFactuur(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const factuurId = String(formData.get("factuur_id") ?? "");
  if (!UUID.test(projectId)) redirect("/projecten");
  if (!UUID.test(factuurId)) return terug(projectId, "ongeldig");
  const supabase = await maakServerClient();
  const { data } = await supabase.rpc("annuleer_factuur", { p_factuur: factuurId, p_reden: String(formData.get("reden") ?? "") });
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  return terug(projectId, uitkomst?.ok ? "geannuleerd" : uitkomst?.fout ?? "mislukt");
}

/**
 * Past een open factuur aan: omschrijving, begeleidende tekst, vervaldatum en (met toestemming en reden) het bedrag.
 * Het btw-bedrag rekent de server opnieuw uit volgens dezelfde regel als de offerte.
 */
export async function wijzigFactuur(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const factuurId = String(formData.get("factuur_id") ?? "");
  if (!UUID.test(projectId)) redirect("/projecten");
  if (!UUID.test(factuurId)) return terug(projectId, "ongeldig");
  const omschrijving = String(formData.get("omschrijving") ?? "").trim();
  const toelichting = String(formData.get("toelichting") ?? "").trim();
  const vervaldatum = String(formData.get("vervaldatum") ?? "");
  const nieuwBedrag = parseBedrag(String(formData.get("totaal") ?? ""));
  if (!omschrijving || !/^\d{4}-\d{2}-\d{2}$/.test(vervaldatum) || (nieuwBedrag !== null && (Number.isNaN(nieuwBedrag) || nieuwBedrag <= 0))) return terug(projectId, "ongeldig");

  const supabase = await maakServerClient();
  const { data: rij } = await supabase.from("facturen").select("id, omschrijving, toelichting, vervaldatum, totaal_incl, bedrag_excl, btw_hoog, btw_laag").eq("id", factuurId).eq("project_id", projectId).maybeSingle();
  const f = rij as FactuurRij | null;
  if (!f) return terug(projectId, "ongeldig");

  // Is het bedrag niet veranderd, dan geven we de bestaande bedragen door; anders splitsen we het nieuwe bedrag in excl. en btw.
  const veranderd = nieuwBedrag !== null && Math.round(nieuwBedrag * 100) !== Math.round(Number(f.totaal_incl) * 100);
  const btw = veranderd ? splitsBtw(nieuwBedrag!, INSTELLINGEN_KERNKOZIJNEN) : { exclBtw: Number(f.bedrag_excl), btwHoog: Number(f.btw_hoog), btwLaag: Number(f.btw_laag), totaal: Number(f.totaal_incl) };
  const { data, error } = await supabase.rpc("wijzig_factuur", {
    p_factuur: factuurId, p_omschrijving: omschrijving, p_toelichting: toelichting, p_vervaldatum: vervaldatum,
    p_excl: btw.exclBtw, p_hoog: btw.btwHoog, p_laag: btw.btwLaag, p_incl: btw.totaal, p_reden: String(formData.get("reden") ?? ""),
  });
  if (error) {
    console.error("factuur wijzigen mislukt:", error.code, error.message);
    return terug(projectId, "mislukt");
  }
  const uitkomst = data as { ok?: boolean; fout?: string; gewijzigd?: boolean; betaald?: boolean } | null;
  if (!uitkomst?.ok) return terug(projectId, uitkomst?.fout ?? "mislukt");
  return terug(projectId, uitkomst.gewijzigd === false ? "niets_gewijzigd" : uitkomst.betaald ? "betaald" : "gewijzigd");
}

/** Legt vast dat de factuur naar de klant is gestuurd (tot de mailkoppeling er is, stuurt de medewerker hem zelf). */
export async function markeerVerzonden(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const factuurId = String(formData.get("factuur_id") ?? "");
  if (!UUID.test(projectId)) redirect("/projecten");
  if (!UUID.test(factuurId)) return keer(formData, projectId, factuurId, "ongeldig");
  const supabase = await maakServerClient();
  const { data } = await supabase.rpc("markeer_factuur_verzonden", { p_factuur: factuurId });
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  return keer(formData, projectId, factuurId, uitkomst?.ok ? "verzonden" : uitkomst?.fout ?? "mislukt");
}

/** Legt vast dat er een betalingsherinnering is gestuurd. De database bewaakt de volgorde en de wachttijd tussen herinneringen. */
export async function registreerHerinnering(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const factuurId = String(formData.get("factuur_id") ?? "");
  if (!UUID.test(projectId)) redirect("/projecten");
  if (!UUID.test(factuurId)) return keer(formData, projectId, factuurId, "ongeldig");
  const supabase = await maakServerClient();
  const { data } = await supabase.rpc("registreer_herinnering", { p_factuur: factuurId });
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  return keer(formData, projectId, factuurId, uitkomst?.ok ? "herinnerd" : uitkomst?.fout ?? "mislukt");
}

/** Legt vast dat de bevestiging van een betaling naar de klant is gestuurd. Alleen vanaf de factuurpagina. */
export async function markeerBetalingBevestigd(formData: FormData) {
  const factuurId = String(formData.get("factuur_id") ?? "");
  const betalingId = String(formData.get("betaling_id") ?? "");
  if (!UUID.test(factuurId)) redirect("/facturen");
  const gaTerug = (code: string): never => redirect(`/facturen/${factuurId}?m=${code}`);
  if (!UUID.test(betalingId)) return gaTerug("ongeldig");
  const supabase = await maakServerClient();
  const { data } = await supabase.rpc("markeer_betaling_bevestigd", { p_betaling: betalingId });
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  return gaTerug(uitkomst?.ok ? "bevestigd" : uitkomst?.fout ?? "mislukt");
}

const CREDIT_FOUT: Record<string, string> = { niet_verzonden: "credit_niet_verzonden", geen_toestemming: "credit_geen_toestemming", reden: "credit_reden", dubbel: "credit_dubbel" };

/** Maakt een (gedeeltelijke) creditnota op een verzonden, openstaande factuur. Het btw-bedrag rekent de server opnieuw uit volgens dezelfde regel als de offerte. */
export async function maakCreditnota(formData: FormData) {
  const factuurId = String(formData.get("factuur_id") ?? "");
  if (!UUID.test(factuurId)) redirect("/facturen");
  const gaTerug = (code: string): never => redirect(`/facturen/${factuurId}?m=${code}`);
  const bedrag = parseBedrag(String(formData.get("bedrag") ?? ""));
  const omschrijving = String(formData.get("omschrijving") ?? "").trim();
  if (bedrag === null || Number.isNaN(bedrag) || bedrag <= 0 || !omschrijving) return gaTerug("ongeldig");
  const supabase = await maakServerClient();
  // Crediteer je al het resterende bedrag, dan nemen we de resterende btw-componenten van de factuur over (anders kan een cent afrondingsverschil de btw boven de factuur uit tillen).
  const { data: fRij } = await supabase.from("facturen").select("bedrag_excl, btw_hoog, btw_laag, totaal_incl, gecrediteerd").eq("id", factuurId).maybeSingle();
  const { data: cRijen } = await supabase.from("creditnotas").select("bedrag_excl, btw_hoog, btw_laag").eq("factuur_id", factuurId);
  const rest = (veld: "bedrag_excl" | "btw_hoog" | "btw_laag") => Math.round((Number((fRij as Record<string, number | string> | null)?.[veld] ?? 0) - ((cRijen ?? []) as Record<string, number | string>[]).reduce((s, c) => s + Number(c[veld]), 0)) * 100) / 100;
  const restTotaal = fRij ? Math.round((Number(fRij.totaal_incl) - Number(fRij.gecrediteerd)) * 100) / 100 : 0;
  const btw = fRij && Math.round(bedrag * 100) === Math.round(restTotaal * 100)
    ? { exclBtw: rest("bedrag_excl"), btwHoog: rest("btw_hoog"), btwLaag: rest("btw_laag"), totaal: restTotaal }
    : splitsBtw(bedrag, INSTELLINGEN_KERNKOZIJNEN);
  const { data, error } = await supabase.rpc("maak_creditnota", {
    p_factuur: factuurId, p_omschrijving: omschrijving.slice(0, 300), p_excl: btw.exclBtw, p_hoog: btw.btwHoog, p_laag: btw.btwLaag, p_incl: btw.totaal,
    p_reden: String(formData.get("reden") ?? ""),
  });
  if (error) {
    console.error("creditnota maken mislukt:", error.code, error.message);
    return gaTerug("mislukt");
  }
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  return gaTerug(uitkomst?.ok ? "creditnota_gemaakt" : CREDIT_FOUT[uitkomst?.fout ?? ""] ?? uitkomst?.fout ?? "mislukt");
}

/** Legt vast dat de creditnota naar de klant is gestuurd. */
export async function markeerCreditnotaVerzonden(formData: FormData) {
  const factuurId = String(formData.get("factuur_id") ?? "");
  const creditnotaId = String(formData.get("creditnota_id") ?? "");
  if (!UUID.test(factuurId)) redirect("/facturen");
  const gaTerug = (code: string): never => redirect(`/facturen/${factuurId}?m=${code}`);
  if (!UUID.test(creditnotaId)) return gaTerug("ongeldig");
  const supabase = await maakServerClient();
  const { data } = await supabase.rpc("markeer_creditnota_verzonden", { p_creditnota: creditnotaId });
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  return gaTerug(uitkomst?.ok ? "creditnota_verzonden" : uitkomst?.fout ?? "mislukt");
}

/** Legt een betaallink vast bij een open factuur (de link maak je in het dashboard van de betaaldienst). Een eerdere link wordt ingetrokken. */
export async function voegBetaallinkToe(formData: FormData) {
  const factuurId = String(formData.get("factuur_id") ?? "");
  if (!UUID.test(factuurId)) redirect("/facturen");
  const gaTerug = (code: string): never => redirect(`/facturen/${factuurId}?m=${code}`);
  const url = String(formData.get("url") ?? "").trim();
  const geldigTot = String(formData.get("geldig_tot") ?? "");
  if (!isBetaalLink(url) || (geldigTot !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(geldigTot))) return gaTerug("betaallink_ongeldig");
  const supabase = await maakServerClient();
  const { data, error } = await supabase.rpc("betaallink_toevoegen", { p_factuur: factuurId, p_url: url, p_geldig_tot: geldigTot === "" ? null : geldigTot });
  if (error) {
    console.error("betaallink toevoegen mislukt:", error.code, error.message);
    return gaTerug("mislukt");
  }
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  return gaTerug(uitkomst?.ok ? "betaallink_toegevoegd" : uitkomst?.fout === "ongeldig" ? "betaallink_ongeldig" : uitkomst?.fout ?? "mislukt");
}

/** Trekt de actieve betaallink van een factuur in. */
export async function trekBetaallinkIn(formData: FormData) {
  const factuurId = String(formData.get("factuur_id") ?? "");
  const linkId = String(formData.get("link_id") ?? "");
  if (!UUID.test(factuurId)) redirect("/facturen");
  const gaTerug = (code: string): never => redirect(`/facturen/${factuurId}?m=${code}`);
  if (!UUID.test(linkId)) return gaTerug("ongeldig");
  const supabase = await maakServerClient();
  const { data } = await supabase.rpc("betaallink_intrekken", { p_link: linkId });
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  return gaTerug(uitkomst?.ok ? "betaallink_ingetrokken" : uitkomst?.fout ?? "mislukt");
}
