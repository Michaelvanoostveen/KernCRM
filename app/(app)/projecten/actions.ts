"use server";

import { redirect } from "next/navigation";
import { maakServerClient } from "@/lib/supabase/server";
import { haalPrijsregels, PRIJSREGELS_VERSIE, PrijsFout, berekenPrijs } from "@/lib/prijs";
import { leesConfiguratie } from "@/lib/projecten/positie";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PositieStatus = { fout?: string };

export async function maakProject(formData: FormData) {
  const klantId = String(formData.get("klant_id") ?? "");
  if (!UUID.test(klantId)) redirect("/klanten");
  const supabase = await maakServerClient();

  const { data: klant } = await supabase.from("klanten").select("id, tenant_id, naam, adressen(soort, straat, huisnummer, plaats)").eq("id", klantId).maybeSingle();
  if (!klant) redirect("/klanten");

  const adres = (klant.adressen as { soort: string; straat: string; huisnummer: string; plaats: string }[]).find((a) => a.soort === "project");
  const opgegeven = String(formData.get("naam") ?? "").trim();
  const naam = opgegeven || (adres ? `${adres.straat} ${adres.huisnummer}, ${adres.plaats}` : klant.naam);

  const { data: nummer, error: nummerFout } = await supabase.rpc("volgend_nummer", { p_tenant: klant.tenant_id, p_soort: "project" });
  if (nummerFout || !nummer) redirect(`/klanten/${klantId}?fout=project`);

  const { data: project, error } = await supabase
    .from("projecten")
    .insert({ tenant_id: klant.tenant_id, klant_id: klantId, nummer, naam })
    .select("id")
    .single();
  if (error || !project) redirect(`/klanten/${klantId}?fout=project`);

  const { error: offerteFout } = await supabase.from("offertes").insert({ tenant_id: klant.tenant_id, project_id: project.id, versie: 1 });
  if (offerteFout) {
    await supabase.from("projecten").delete().eq("id", project.id);
    redirect(`/klanten/${klantId}?fout=project`);
  }
  redirect(`/projecten/${project.id}`);
}

export async function bewaarPositie(_vorige: PositieStatus, formData: FormData): Promise<PositieStatus> {
  const projectId = String(formData.get("project_id") ?? "");
  const positieId = String(formData.get("positie_id") ?? "nieuw");
  if (!UUID.test(projectId) || (positieId !== "nieuw" && !UUID.test(positieId))) return { fout: "Deze positie is niet gevonden." };

  // De prijs komt altijd uit onze eigen berekening, nooit uit wat de browser meestuurt.
  let config, prijs: number;
  try {
    config = leesConfiguratie(JSON.parse(String(formData.get("config") ?? "null")));
    prijs = berekenPrijs(haalPrijsregels(), config).prijs;
  } catch (e) {
    return { fout: e instanceof PrijsFout ? e.message : "De configuratie is onleesbaar." };
  }
  const aantal = Math.round(Number(formData.get("aantal")));
  if (!(aantal >= 1 && aantal <= 999)) return { fout: "Het aantal moet tussen 1 en 999 liggen." };
  const ruimte = String(formData.get("ruimte") ?? "").trim().slice(0, 120) || null;

  const supabase = await maakServerClient();
  const { data: project } = await supabase.from("projecten").select("id, tenant_id, fase").eq("id", projectId).maybeSingle();
  if (!project) return { fout: "Dit project is niet gevonden." };
  const { data: offerte } = await supabase.from("offertes").select("id").eq("project_id", projectId).order("versie", { ascending: false }).limit(1).maybeSingle();
  if (!offerte) return { fout: "Dit project heeft nog geen offerte." };

  const rij = { config, prijs, aantal, ruimte, prijsregels_versie: PRIJSREGELS_VERSIE, gewijzigd: new Date().toISOString() };
  if (positieId === "nieuw") {
    const { data: laatste } = await supabase.from("posities").select("nummer").eq("offerte_id", offerte.id).order("nummer", { ascending: false }).limit(1).maybeSingle();
    const { error } = await supabase.from("posities").insert({ ...rij, tenant_id: project.tenant_id, project_id: projectId, offerte_id: offerte.id, nummer: (laatste?.nummer ?? 0) + 1 });
    if (error) {
      console.error("positie insert mislukt:", error.code, error.message);
      return { fout: `Opslaan lukte niet (${error.code ?? "onbekend"}). Probeer het opnieuw.` };
    }
  } else {
    const { error } = await supabase.from("posities").update(rij).eq("id", positieId).eq("project_id", projectId);
    if (error) return { fout: `Opslaan lukte niet (${error.code ?? "onbekend"}). Probeer het opnieuw.` };
  }
  await supabase.from("projecten").update({ gewijzigd: new Date().toISOString(), ...(project.fase === "lead" ? { fase: "offerte" } : {}) }).eq("id", projectId);
  redirect(`/projecten/${projectId}`);
}

export async function verwijderPositie(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const positieId = String(formData.get("positie_id") ?? "");
  if (UUID.test(projectId) && UUID.test(positieId)) {
    const supabase = await maakServerClient();
    await supabase.from("posities").delete().eq("id", positieId).eq("project_id", projectId);
  }
  redirect(UUID.test(projectId) ? `/projecten/${projectId}` : "/projecten");
}
