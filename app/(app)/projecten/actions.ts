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
    const { data: nieuw, error } = await supabase
      .from("posities")
      .insert({ ...rij, tenant_id: project.tenant_id, project_id: projectId, offerte_id: offerte.id, nummer: (laatste?.nummer ?? 0) + 1 })
      .select("id")
      .single();
    if (error || !nieuw) {
      console.error("positie insert mislukt:", error?.code, error?.message);
      return { fout: `Opslaan lukte niet (${error?.code ?? "onbekend"}). Probeer het opnieuw.` };
    }
    // De positie komt onderaan in de offerte.
    const { data: lastRegel } = await supabase.from("offerte_regels").select("volgorde").eq("offerte_id", offerte.id).order("volgorde", { ascending: false }).limit(1).maybeSingle();
    const { error: regelFout } = await supabase.from("offerte_regels").insert({ tenant_id: project.tenant_id, offerte_id: offerte.id, soort: "positie", positie_id: nieuw.id, volgorde: (lastRegel?.volgorde ?? 0) + 1 });
    if (regelFout) {
      console.error("offerteregel insert mislukt:", regelFout.code, regelFout.message);
      await supabase.from("posities").delete().eq("id", nieuw.id);
      return { fout: `De positie kon niet aan de offerte worden toegevoegd (${regelFout.code ?? "onbekend"}). Probeer het opnieuw.` };
    }
  } else {
    const { data: oud } = await supabase.from("posities").select("prijs").eq("id", positieId).eq("project_id", projectId).maybeSingle();
    const { error } = await supabase.from("posities").update(rij).eq("id", positieId).eq("project_id", projectId);
    if (error) return { fout: `Opslaan lukte niet (${error.code ?? "onbekend"}). Probeer het opnieuw.` };
    // Verandert de berekende prijs, dan vervalt een handmatige aanpassing: die hoorde bij de oude prijs.
    if (oud && Number(oud.prijs) !== prijs) await supabase.from("offerte_regels").update({ prijs_override: null }).eq("positie_id", positieId);
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

// ── Offerte opslaan ──

export type OfferteStatus = { fout?: string };

const SOORTEN = ["positie", "artikel", "kop", "tekst", "korting"] as const;
type Soort = (typeof SOORTEN)[number];
type Invoer = { id?: unknown; soort?: unknown; titel?: unknown; tekst?: unknown; aantal?: unknown; prijs?: unknown; modus?: unknown; waarde?: unknown; artikelId?: unknown; prijsOverride?: unknown; overrideReden?: unknown };

const GEEN_TOESTEMMING = "Je hebt geen toestemming om prijzen handmatig aan te passen of eigen artikelprijzen te gebruiken. Vraag de directie om deze toestemming.";
const dbFout = (e: { code?: string | null }) => (e.code === "42501" ? GEEN_TOESTEMMING : `Opslaan lukte niet (${e.code ?? "onbekend"}). Probeer het opnieuw.`);

/** Leest een handmatige prijs met reden uit de invoer. `leeg` betekent: geen aanpassing. */
function leesOverride(prijs: unknown, reden: unknown): { prijs_override: number | null; override_reden: string | null } | { fout: string } {
  if (prijs === null || prijs === undefined || prijs === "") return { prijs_override: null, override_reden: null };
  const n = Number(prijs);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return { fout: "Een handmatige prijs moet tussen 0 en 1.000.000 euro liggen." };
  const r = tekstveld(reden, 300);
  if (!r || r.length < 3) return { fout: "Vul bij een handmatige prijs een reden in." };
  return { prijs_override: Math.round(n * 100) / 100, override_reden: r };
}

function tekstveld(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t === "" ? null : t;
}
function getal(v: unknown, min: number, max: number, standaard: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : standaard;
}

/** Bewaart de volgorde en inhoud van de regels van de offerte. Posities zelf worden in de configurator beheerd. */
export async function bewaarOfferte(_vorige: OfferteStatus, formData: FormData): Promise<OfferteStatus> {
  const projectId = String(formData.get("project_id") ?? "");
  if (!UUID.test(projectId)) return { fout: "Dit project is niet gevonden." };

  let invoer: Invoer[];
  try {
    const gelezen = JSON.parse(String(formData.get("regels") ?? "[]"));
    if (!Array.isArray(gelezen) || gelezen.length > 300) throw new Error();
    invoer = gelezen;
  } catch {
    return { fout: "De regels zijn onleesbaar. Ververs de pagina en probeer het opnieuw." };
  }

  const supabase = await maakServerClient();
  const { data: project } = await supabase.from("projecten").select("id, tenant_id").eq("id", projectId).maybeSingle();
  if (!project) return { fout: "Dit project is niet gevonden." };
  const { data: offerte } = await supabase.from("offertes").select("id, status, totaal_override").eq("project_id", projectId).order("versie", { ascending: false }).limit(1).maybeSingle();
  if (!offerte) return { fout: "Dit project heeft nog geen offerte." };
  if (offerte.status !== "concept") return { fout: "Deze offerte is verstuurd en kan niet meer gewijzigd worden. Maak een nieuwe versie." };

  const { data: magData } = await supabase.rpc("mag_prijzen_aanpassen", { p_tenant: project.tenant_id });
  const mag = magData === true;

  // Eigen totaalprijs (optioneel, alleen met toestemming).
  const totaalRuw = String(formData.get("totaal_override") ?? "").trim();
  const totaalOv = leesOverride(totaalRuw === "" ? null : totaalRuw.replace(",", "."), formData.get("totaal_override_reden"));
  if ("fout" in totaalOv) return { fout: totaalOv.fout };
  const huidigTotaal = offerte.totaal_override === null ? null : Number(offerte.totaal_override);
  if (totaalOv.prijs_override !== huidigTotaal && totaalOv.prijs_override !== null && !mag) return { fout: GEEN_TOESTEMMING };

  const { data: bestaand } = await supabase.from("offerte_regels").select("id, soort, positie_id, prijs_override").eq("offerte_id", offerte.id);
  const bestaandeIds = new Set((bestaand ?? []).map((r) => r.id as string));
  const positieRegels = new Map((bestaand ?? []).filter((r) => r.soort === "positie").map((r) => [r.id as string, r]));

  const nieuweRijen: Record<string, unknown>[] = [];
  const bijwerken: Record<string, unknown>[] = [];
  const bewaardePositieIds = new Set<string>();
  let volgorde = 0;

  for (const r of invoer) {
    const soort = r.soort as Soort;
    if (!SOORTEN.includes(soort)) return { fout: "Een regel heeft een onbekend soort." };
    volgorde += 1;
    const id = typeof r.id === "string" && UUID.test(r.id) ? r.id : null;

    if (soort === "positie") {
      // Een positie kan hier alleen van plaats veranderen; ontbrekende of onbekende posities negeren we.
      if (!id || !positieRegels.has(id)) continue;
      bewaardePositieIds.add(id);
      const ov = leesOverride(r.prijsOverride, r.overrideReden);
      if ("fout" in ov) return { fout: ov.fout };
      bijwerken.push({ id, volgorde, ...ov, gewijzigd: new Date().toISOString() });
      continue;
    }

    const ov = soort === "artikel" ? leesOverride(r.prijsOverride, r.overrideReden) : { prijs_override: null, override_reden: null };
    if ("fout" in ov) return { fout: ov.fout };
    const artikelId = soort === "artikel" && typeof r.artikelId === "string" && UUID.test(r.artikelId) ? r.artikelId : null;
    if (soort === "artikel" && !artikelId && !mag && !(id && bestaandeIds.has(id))) return { fout: GEEN_TOESTEMMING };

    const rij: Record<string, unknown> = {
      tenant_id: project.tenant_id,
      offerte_id: offerte.id,
      volgorde,
      soort,
      titel: tekstveld(r.titel, 160),
      tekst: tekstveld(r.tekst, 5000),
      aantal: soort === "artikel" ? getal(r.aantal, 0.01, 9999, 1) : 1,
      prijs: soort === "artikel" ? getal(r.prijs, 0, 1_000_000, 0) : 0,
      korting_modus: null,
      korting_waarde: null,
      artikel_id: artikelId,
      ...ov,
      gewijzigd: new Date().toISOString(),
    };
    if (soort === "korting") {
      const modus = r.modus === "bedrag" ? "bedrag" : "percentage";
      rij.korting_modus = modus;
      rij.korting_waarde = getal(r.waarde, 0, modus === "percentage" ? 100 : 1_000_000, 0);
    }
    if (id && bestaandeIds.has(id) && !positieRegels.has(id)) bijwerken.push({ id, ...rij });
    else nieuweRijen.push(rij);
    if (id && bestaandeIds.has(id)) bewaardePositieIds.add(id);
  }

  // Posities die in de invoer ontbreken (bijvoorbeeld net in een ander tabblad toegevoegd) blijven staan, onderaan.
  for (const [id] of positieRegels) {
    if (!bewaardePositieIds.has(id)) bijwerken.push({ id, volgorde: ++volgorde, gewijzigd: new Date().toISOString() });
  }

  // Regels (geen posities) die niet meer in de invoer staan, verwijderen we.
  const behouden = new Set(bijwerken.map((r) => r.id as string));
  const weg = (bestaand ?? []).filter((r) => r.soort !== "positie" && !behouden.has(r.id as string)).map((r) => r.id as string);
  if (weg.length) {
    const { error } = await supabase.from("offerte_regels").delete().in("id", weg);
    if (error) return { fout: dbFout(error) };
  }
  for (const rij of bijwerken) {
    const { id, ...velden } = rij;
    const { error } = await supabase.from("offerte_regels").update(velden).eq("id", id as string);
    if (error) return { fout: dbFout(error) };
  }
  if (nieuweRijen.length) {
    const { error } = await supabase.from("offerte_regels").insert(nieuweRijen);
    if (error) {
      console.error("offerteregels insert mislukt:", error.code, error.message);
      return { fout: dbFout(error) };
    }
  }
  const { error: offerteFout } = await supabase.from("offertes").update({ gewijzigd: new Date().toISOString(), totaal_override: totaalOv.prijs_override, totaal_override_reden: totaalOv.override_reden }).eq("id", offerte.id);
  if (offerteFout) return { fout: dbFout(offerteFout) };
  await supabase.from("projecten").update({ gewijzigd: new Date().toISOString() }).eq("id", projectId);
  redirect(`/projecten/${projectId}?opgeslagen=1`);
}

/** Verwijdert een project met alle offertes, posities en regels. Een verstuurde of getekende offerte alleen door de directie. */
export async function verwijderProject(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  if (!UUID.test(projectId)) redirect("/projecten");
  const supabase = await maakServerClient();
  const { data: project } = await supabase.from("projecten").select("id, tenant_id, klant_id, offertes(status)").eq("id", projectId).maybeSingle();
  if (!project) redirect("/projecten");

  const vastgelegd = (project.offertes as { status: string }[]).some((o) => o.status !== "concept");
  if (vastgelegd) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: lid } = user ? await supabase.from("tenant_leden").select("rol").eq("tenant_id", project.tenant_id).eq("user_id", user.id).maybeSingle() : { data: null };
    if (lid?.rol !== "directie") redirect(`/projecten/${projectId}?fout=verwijderen`);
  }
  const { error } = await supabase.from("projecten").delete().eq("id", projectId);
  if (error) redirect(`/projecten/${projectId}?fout=verwijderen`);
  redirect(`/klanten/${project.klant_id}`);
}
