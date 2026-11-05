"use server";

import { redirect } from "next/navigation";
import { maakServerClient } from "@/lib/supabase/server";
import { parseBedrag } from "@/lib/bedrag";
import { INSTELLINGEN_KERNKOZIJNEN } from "@/lib/offerte/instellingen";
import { betaaldagen, factuurTeksten, splitsBtw } from "@/lib/facturatie/bereken";
import { laadFactuurplan } from "./plan";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Meldingscodes die de projectpagina laat zien (?factuur=...). */
const terug = (projectId: string, code: string): never => redirect(`/projecten/${projectId}?factuur=${code}#facturen`);

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
  if (!UUID.test(factuurId)) return terug(projectId, "ongeldig");
  const bedrag = parseBedrag(String(formData.get("bedrag") ?? ""));
  const datum = String(formData.get("datum") ?? "");
  if (bedrag === null || Number.isNaN(bedrag) || bedrag <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return terug(projectId, "ongeldig");

  const supabase = await maakServerClient();
  const { data, error } = await supabase.rpc("registreer_betaling", { p_factuur: factuurId, p_bedrag: bedrag, p_datum: datum, p_notitie: String(formData.get("notitie") ?? "") });
  if (error) {
    console.error("betaling registreren mislukt:", error.code, error.message);
    return terug(projectId, "mislukt");
  }
  const uitkomst = data as { ok?: boolean; fout?: string; betaald?: boolean } | null;
  return terug(projectId, uitkomst?.ok ? (uitkomst.betaald ? "betaald" : "deelbetaling") : uitkomst?.fout ?? "mislukt");
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
