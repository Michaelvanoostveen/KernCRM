"use server";

import { redirect } from "next/navigation";
import { maakServerClient } from "@/lib/supabase/server";
import { schoonNaam, STANDAARD_MONTEURS, STANDAARD_PLOEGEN } from "@/lib/montage/standaard";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const HULPMIDDEL = ["geen", "steiger", "hoogwerker", "beide"];

const terug = (projectId: string, code: string): never => redirect(`/projecten/${projectId}?montage=${code}#montage`);

type Uitkomst = { ok?: boolean; fout?: string } | null;
const code = (u: Uitkomst, goed: string) => (u?.ok ? goed : u?.fout ?? "mislukt");

function lees(formData: FormData) {
  const ploeg = String(formData.get("ploeg_id") ?? "");
  const start = String(formData.get("start_datum") ?? "");
  const dagen = Math.round(Number(formData.get("werkdagen")));
  const lever = String(formData.get("leverdatum") ?? "");
  const hulp = String(formData.get("hulpmiddel") ?? "geen");
  const geldig = UUID.test(ploeg) && DATUM.test(start) && Number.isFinite(dagen) && dagen >= 1 && dagen <= 30 && (lever === "" || DATUM.test(lever)) && HULPMIDDEL.includes(hulp);
  return { geldig, ploeg, start, dagen, lever: lever === "" ? null : lever, hulp, notitie: String(formData.get("notitie") ?? "") };
}

/** Plant de montage van een project: ploeg, startdag, aantal werkdagen en (als bekend) de leverdatum van de kozijnen. */
export async function planMontage(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  if (!UUID.test(projectId)) redirect("/projecten");
  const v = lees(formData);
  if (!v.geldig) return terug(projectId, "ongeldig");
  const supabase = await maakServerClient();
  const { data, error } = await supabase.rpc("plan_montage", { p_project: projectId, p_ploeg: v.ploeg, p_start: v.start, p_werkdagen: v.dagen, p_leverdatum: v.lever, p_hulpmiddel: v.hulp, p_notitie: v.notitie });
  if (error) { console.error("montage plannen mislukt:", error.code, error.message); return terug(projectId, "mislukt"); }
  return terug(projectId, code(data as Uitkomst, "gepland"));
}

export async function wijzigMontage(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const montageId = String(formData.get("montage_id") ?? "");
  if (!UUID.test(projectId)) redirect("/projecten");
  const v = lees(formData);
  if (!UUID.test(montageId) || !v.geldig) return terug(projectId, "ongeldig");
  const supabase = await maakServerClient();
  const { data, error } = await supabase.rpc("wijzig_montage", { p_montage: montageId, p_ploeg: v.ploeg, p_start: v.start, p_werkdagen: v.dagen, p_leverdatum: v.lever, p_hulpmiddel: v.hulp, p_notitie: v.notitie });
  if (error) { console.error("montage wijzigen mislukt:", error.code, error.message); return terug(projectId, "mislukt"); }
  return terug(projectId, code(data as Uitkomst, "gewijzigd"));
}

async function eenvoudig(formData: FormData, rpc: "start_montage", goed: string) {
  const projectId = String(formData.get("project_id") ?? "");
  const montageId = String(formData.get("montage_id") ?? "");
  if (!UUID.test(projectId)) redirect("/projecten");
  if (!UUID.test(montageId)) return terug(projectId, "ongeldig");
  const supabase = await maakServerClient();
  const { data } = await supabase.rpc(rpc, { p_montage: montageId });
  return terug(projectId, code(data as Uitkomst, goed));
}

/** De montage begint (kan pas op of na de startdag en als de leverdatum bekend is). */
export async function startMontage(formData: FormData) { return eenvoudig(formData, "start_montage", "gestart"); }


export async function annuleerMontage(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const montageId = String(formData.get("montage_id") ?? "");
  if (!UUID.test(projectId)) redirect("/projecten");
  if (!UUID.test(montageId)) return terug(projectId, "ongeldig");
  const supabase = await maakServerClient();
  const { data } = await supabase.rpc("annuleer_montage", { p_montage: montageId, p_reden: String(formData.get("reden") ?? "") });
  return terug(projectId, code(data as Uitkomst, "geannuleerd"));
}

/** Een nieuwe montageploeg toevoegen (directie en kantoor). */
export async function maakPloeg(formData: FormData) {
  const naam = String(formData.get("naam") ?? "").trim().slice(0, 60);
  if (naam.length === 0) redirect("/montage?ploeg=naam");
  const supabase = await maakServerClient();
  const { data: lid } = await supabase.from("tenant_leden").select("tenant_id, rol").in("rol", ["directie", "kantoor"]).limit(1).maybeSingle();
  if (!lid) redirect("/montage?ploeg=rechten");
  const { error } = await supabase.from("montageploegen").insert({ tenant_id: lid.tenant_id, naam });
  redirect(`/montage?ploeg=${error ? (error.code === "23505" ? "bestaat" : "mislukt") : "toegevoegd"}`);
}

/** Een ploeg uit of weer in dienst zetten. Bestaande montages blijven staan. */
export async function zetPloegActief(formData: FormData) {
  const id = String(formData.get("ploeg_id") ?? "");
  if (!UUID.test(id)) redirect("/montage");
  const supabase = await maakServerClient();
  const { error } = await supabase.from("montageploegen").update({ actief: formData.get("actief") === "aan" }).eq("id", id);
  redirect(`/montage?ploeg=${error ? "mislukt" : "bijgewerkt"}`);
}

// ---- Monteurs en de samenstelling van de ploegen (directie en kantoor) ----

const naarBeheer = (code: string): never => redirect(`/montage?ploeg=${code}#ploegen`);

async function beheerder() {
  const supabase = await maakServerClient();
  const { data: lid } = await supabase.from("tenant_leden").select("tenant_id, rol").in("rol", ["directie", "kantoor"]).limit(1).maybeSingle();
  return { supabase, tenantId: (lid?.tenant_id as string | undefined) ?? null };
}
const foutcode = (code?: string) => (code === "23505" ? "bestaat" : code === "55000" || code === "23514" ? "niet_toegestaan" : "mislukt");

/** Geeft een ploeg een andere naam. */
export async function hernoemPloeg(formData: FormData) {
  const id = String(formData.get("ploeg_id") ?? "");
  const naam = schoonNaam(formData.get("naam"));
  if (!UUID.test(id)) return naarBeheer("mislukt");
  if (!naam) return naarBeheer("naam");
  const { supabase } = await beheerder();
  const { error } = await supabase.from("montageploegen").update({ naam }).eq("id", id);
  return naarBeheer(error ? foutcode(error.code) : "bijgewerkt");
}

/** Voegt een monteur toe (alleen de naam; een inlogaccount koppel je daarna). */
export async function maakMonteur(formData: FormData) {
  const naam = schoonNaam(formData.get("naam"));
  if (!naam) return naarBeheer("naam");
  const { supabase, tenantId } = await beheerder();
  if (!tenantId) return naarBeheer("rechten");
  const { error } = await supabase.from("monteurs").insert({ tenant_id: tenantId, naam });
  return naarBeheer(error ? foutcode(error.code) : "monteur_toegevoegd");
}

/** Geeft een monteur een andere naam. */
export async function hernoemMonteur(formData: FormData) {
  const id = String(formData.get("monteur_id") ?? "");
  const naam = schoonNaam(formData.get("naam"));
  if (!UUID.test(id)) return naarBeheer("mislukt");
  if (!naam) return naarBeheer("naam");
  const { supabase } = await beheerder();
  const { error } = await supabase.from("monteurs").update({ naam }).eq("id", id);
  return naarBeheer(error ? foutcode(error.code) : "bijgewerkt");
}

/** Zet een monteur uit of weer in dienst. Uit dienst betekent ook: uit de ploeg. */
export async function zetMonteurActief(formData: FormData) {
  const id = String(formData.get("monteur_id") ?? "");
  if (!UUID.test(id)) return naarBeheer("mislukt");
  const { supabase } = await beheerder();
  const { error } = await supabase.from("monteurs").update({ actief: formData.get("actief") === "aan" }).eq("id", id);
  return naarBeheer(error ? foutcode(error.code) : "bijgewerkt");
}

/** Zet een monteur in een ploeg (en haalt hem uit zijn vorige ploeg), of haalt hem uit zijn ploeg als er geen ploeg is gekozen. */
export async function wijsMonteurToe(formData: FormData) {
  const monteurId = String(formData.get("monteur_id") ?? "");
  const ploegId = String(formData.get("ploeg_id") ?? "");
  if (!UUID.test(monteurId) || (ploegId !== "" && !UUID.test(ploegId))) return naarBeheer("mislukt");
  const { supabase, tenantId } = await beheerder();
  if (!tenantId) return naarBeheer("rechten");
  if (ploegId === "") {
    const { error } = await supabase.from("ploeg_leden").delete().eq("monteur_id", monteurId);
    return naarBeheer(error ? "mislukt" : "bijgewerkt");
  }
  const { error } = await supabase.from("ploeg_leden").upsert({ monteur_id: monteurId, ploeg_id: ploegId, tenant_id: tenantId }, { onConflict: "monteur_id" });
  return naarBeheer(error ? foutcode(error.code) : "bijgewerkt");
}

/** Koppelt een inlogaccount (een gebruiker met de rol monteur) aan een monteur, of haalt de koppeling weg. */
export async function koppelAccount(formData: FormData) {
  const monteurId = String(formData.get("monteur_id") ?? "");
  const gebruiker = String(formData.get("user_id") ?? "");
  if (!UUID.test(monteurId) || (gebruiker !== "" && !UUID.test(gebruiker))) return naarBeheer("mislukt");
  const { supabase } = await beheerder();
  const { error } = await supabase.from("monteurs").update({ user_id: gebruiker === "" ? null : gebruiker }).eq("id", monteurId);
  return naarBeheer(error ? foutcode(error.code) : "gekoppeld");
}

/** Laadt de startopstelling van KernKozijnen: zeven monteurs en drie ploegen van twee. Bestaande namen blijven ongemoeid. */
export async function laadStandaardOpstelling() {
  const { supabase, tenantId } = await beheerder();
  if (!tenantId) return naarBeheer("rechten");
  const { error: e1 } = await supabase.from("monteurs").upsert(STANDAARD_MONTEURS.map((naam) => ({ tenant_id: tenantId, naam })), { onConflict: "tenant_id,naam", ignoreDuplicates: true });
  const { error: e2 } = await supabase.from("montageploegen").upsert(STANDAARD_PLOEGEN.map((p) => ({ tenant_id: tenantId, naam: p.naam })), { onConflict: "tenant_id,naam", ignoreDuplicates: true });
  if (e1 || e2) return naarBeheer("mislukt");

  const [{ data: monteurs }, { data: ploegen }, { data: bezet }] = await Promise.all([
    supabase.from("monteurs").select("id, naam").eq("actief", true),
    supabase.from("montageploegen").select("id, naam").eq("actief", true),
    supabase.from("ploeg_leden").select("monteur_id"),
  ]);
  const alIngedeeld = new Set((bezet ?? []).map((b) => b.monteur_id as string));
  const rijen: { monteur_id: string; ploeg_id: string; tenant_id: string }[] = [];
  for (const p of STANDAARD_PLOEGEN) {
    const ploeg = (ploegen ?? []).find((x) => x.naam === p.naam);
    if (!ploeg) continue;
    for (const naam of p.leden) {
      const m = (monteurs ?? []).find((x) => x.naam === naam);
      if (m && !alIngedeeld.has(m.id as string)) rijen.push({ monteur_id: m.id as string, ploeg_id: ploeg.id as string, tenant_id: tenantId });
    }
  }
  if (rijen.length) {
    const { error } = await supabase.from("ploeg_leden").upsert(rijen, { onConflict: "monteur_id", ignoreDuplicates: true });
    if (error) return naarBeheer("mislukt");
  }
  return naarBeheer("opstelling_geladen");
}
