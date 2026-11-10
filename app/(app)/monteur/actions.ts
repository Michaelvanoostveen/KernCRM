"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { maakServerClient } from "@/lib/supabase/server";
import { eersteIp, isGeldigeHandtekening } from "@/lib/offerte/handtekening";
import { FOTO_BUCKET_WERKBON } from "@/lib/montage/werkbon";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

export type WerkbonStatus = { fout?: string; opgeslagen?: boolean };
type Uitkomst = { ok?: boolean; fout?: string; aantal?: number } | null;

const FOUTEN: Record<string, string> = {
  geen_toegang: "Je hebt geen toegang tot deze montage.",
  niet_beschikbaar: "De werkbon is niet meer te wijzigen. Is de montage al opgeleverd of nog niet gestart?",
  voorlopig: "Deze montage is nog voorlopig: kantoor moet eerst de leverdatum invullen.",
  niet_te_starten: "Deze montage kan niet meer worden gestart.",
  te_vroeg: "Je kunt pas beginnen op of na de startdatum van de montage.",
  positie: "Dit kozijn hoort niet bij deze montage.",
  monteur: "Je bent niet als monteur aan dit account gekoppeld. Vraag kantoor om dat te doen.",
  ongeldig: "Controleer de ingevulde gegevens: de datum ligt tussen de start van de montage en vandaag, en de uren zijn hele kwartieren.",
  omschrijving: "Beschrijf het opleverpunt.",
  te_veel: "Er zijn al te veel foto's of punten toegevoegd.",
  bestand: "De foto is niet aangekomen. Probeer het opnieuw.",
  niet_bezig: "De montage moet eerst gestart zijn voordat je hem kunt opleveren.",
  naam: "Vul de volledige naam van de klant in.",
  handtekening: "Laat de klant tekenen in het vak.",
  opgeleverd: "Na de oplevering kan alleen kantoor een opleverpunt als opgelost markeren.",
  onbekend: "Dit onderdeel bestaat niet meer.",
};
const foutTekst = (code?: string) => FOUTEN[code ?? ""] ?? "Opslaan lukte niet. Probeer het opnieuw.";
const ververs = (montageId: string) => revalidatePath(`/monteur/${montageId}`);

async function rpc(naam: string, args: Record<string, unknown>): Promise<Uitkomst> {
  const supabase = await maakServerClient();
  const { data, error } = await supabase.rpc(naam, args);
  if (error) {
    console.error(`${naam} mislukt:`, error.code, error.message);
    return { ok: false, fout: "mislukt" };
  }
  return data as Uitkomst;
}

/** De monteur begint aan de montage: de werkbon wordt aangemaakt en de montage staat op bezig. */
export async function startWerkbon(formData: FormData) {
  const montageId = String(formData.get("montage_id") ?? "");
  if (!UUID.test(montageId)) redirect("/monteur");
  const u = await rpc("werkbon_start", { p_montage: montageId });
  redirect(`/monteur/${montageId}${u?.ok ? "" : `?fout=${u?.fout ?? "mislukt"}`}`);
}

const vink = (formData: FormData, naam: string) => formData.get(naam) === "on";

/** De checklist van één kozijn. */
export async function bewaarWerkbonRegel(_vorige: WerkbonStatus, formData: FormData): Promise<WerkbonStatus> {
  const montageId = String(formData.get("montage_id") ?? "");
  const positieId = String(formData.get("positie_id") ?? "");
  if (!UUID.test(montageId) || !UUID.test(positieId)) return { fout: foutTekst("positie") };
  const u = await rpc("werkbon_regel_bewaar", {
    p_montage: montageId, p_positie: positieId, p_geplaatst: vink(formData, "geplaatst"), p_afgesteld: vink(formData, "afgesteld"),
    p_afgekit: vink(formData, "afgekit"), p_afgewerkt: vink(formData, "afgewerkt"), p_opmerking: String(formData.get("opmerking") ?? ""),
  });
  if (!u?.ok) return { fout: foutTekst(u?.fout) };
  ververs(montageId);
  return { opgeslagen: true };
}

/** Bijzonderheden voor kantoor, of kantoor moet reageren, en of er is opgeruimd. */
export async function bewaarWerkbonAlgemeen(_vorige: WerkbonStatus, formData: FormData): Promise<WerkbonStatus> {
  const montageId = String(formData.get("montage_id") ?? "");
  if (!UUID.test(montageId)) return { fout: foutTekst("geen_toegang") };
  const u = await rpc("werkbon_algemeen_bewaar", {
    p_montage: montageId, p_bijzonderheden: String(formData.get("bijzonderheden") ?? ""), p_kantoor_actie: vink(formData, "kantoor_actie"), p_opgeruimd: vink(formData, "opgeruimd"),
  });
  if (!u?.ok) return { fout: foutTekst(u?.fout) };
  ververs(montageId);
  return { opgeslagen: true };
}

/** Uren op een dag (0 haalt de regel weg). */
export async function bewaarWerkbonUren(_vorige: WerkbonStatus, formData: FormData): Promise<WerkbonStatus> {
  const montageId = String(formData.get("montage_id") ?? "");
  const datum = String(formData.get("datum") ?? "");
  const uren = Number(String(formData.get("uren") ?? "").replace(",", "."));
  if (!UUID.test(montageId) || !DATUM.test(datum) || !Number.isFinite(uren)) return { fout: foutTekst("ongeldig") };
  const u = await rpc("werkbon_uren_bewaar", { p_montage: montageId, p_datum: datum, p_uren: uren, p_notitie: String(formData.get("notitie") ?? "") });
  if (!u?.ok) return { fout: foutTekst(u?.fout) };
  ververs(montageId);
  return { opgeslagen: true };
}

/** Haalt de uren van één regel weg. */
export async function verwijderWerkbonUren(formData: FormData) {
  const montageId = String(formData.get("montage_id") ?? "");
  const datum = String(formData.get("datum") ?? "");
  if (!UUID.test(montageId) || !DATUM.test(datum)) redirect("/monteur");
  await rpc("werkbon_uren_bewaar", { p_montage: montageId, p_datum: datum, p_uren: 0, p_notitie: null });
  ververs(montageId);
  redirect(`/monteur/${montageId}`);
}

/** Legt een foto vast die de browser al naar de opslag heeft gestuurd. */
export async function registreerWerkbonFoto(montageId: string, positieId: string | null, soort: string, fotoId: string): Promise<{ fout?: string }> {
  if (!UUID.test(montageId) || !UUID.test(fotoId) || (positieId !== null && !UUID.test(positieId)) || !["voor", "na", "punt", "overig"].includes(soort)) return { fout: foutTekst("ongeldig") };
  const u = await rpc("werkbon_foto_toevoegen", { p_montage: montageId, p_positie: positieId, p_soort: soort, p_id: fotoId });
  if (!u?.ok) return { fout: foutTekst(u?.fout) };
  ververs(montageId);
  return {};
}

/** Verwijdert een foto: eerst uit de lijst, daarna het bestand uit de opslag. */
export async function verwijderWerkbonFoto(montageId: string, fotoId: string): Promise<{ fout?: string }> {
  if (!UUID.test(montageId) || !UUID.test(fotoId)) return { fout: foutTekst("ongeldig") };
  const supabase = await maakServerClient();
  const { data, error } = await supabase.rpc("werkbon_foto_verwijderen", { p_montage: montageId, p_foto: fotoId });
  const u = data as { ok?: boolean; fout?: string; pad?: string } | null;
  if (error || !u?.ok) return { fout: foutTekst(u?.fout) };
  if (u.pad) await supabase.storage.from(FOTO_BUCKET_WERKBON).remove([u.pad]);
  ververs(montageId);
  return {};
}

/** Meldt een opleverpunt. */
export async function voegPuntToe(_vorige: WerkbonStatus, formData: FormData): Promise<WerkbonStatus> {
  const montageId = String(formData.get("montage_id") ?? "");
  const positieId = String(formData.get("positie_id") ?? "");
  if (!UUID.test(montageId) || (positieId !== "" && !UUID.test(positieId))) return { fout: foutTekst("positie") };
  const u = await rpc("werkbon_punt_toevoegen", { p_montage: montageId, p_positie: positieId || null, p_omschrijving: String(formData.get("omschrijving") ?? "") });
  if (!u?.ok) return { fout: foutTekst(u?.fout) };
  ververs(montageId);
  return { opgeslagen: true };
}

/** Markeert een opleverpunt als opgelost of zet hem weer open. */
export async function zetPuntOpgelost(formData: FormData) {
  const montageId = String(formData.get("montage_id") ?? "");
  const puntId = String(formData.get("punt_id") ?? "");
  if (!UUID.test(montageId)) redirect("/monteur");
  if (UUID.test(puntId)) await rpc("werkbon_punt_oplossen", { p_montage: montageId, p_punt: puntId, p_opgelost: formData.get("opgelost") === "ja" });
  const terugNaar = String(formData.get("terug") ?? "");
  const projectId = String(formData.get("project_id") ?? "");
  if (terugNaar === "project" && UUID.test(projectId)) {
    revalidatePath(`/projecten/${projectId}`);
    redirect(`/projecten/${projectId}?montage=punt_bijgewerkt#montage`);
  }
  ververs(montageId);
  redirect(`/monteur/${montageId}`);
}

/** Kantoor markeert een melding van de monteur als gezien. */
export async function werkbonGezien(formData: FormData) {
  const montageId = String(formData.get("montage_id") ?? "");
  const projectId = String(formData.get("project_id") ?? "");
  if (UUID.test(montageId)) await rpc("werkbon_gezien", { p_montage: montageId });
  if (UUID.test(projectId)) {
    revalidatePath(`/projecten/${projectId}`);
    redirect(`/projecten/${projectId}?montage=gezien#montage`);
  }
  redirect("/montage");
}

/** Levert de montage op: de klant tekent. Daarna is de montage afgerond. */
export async function leverOp(_vorige: WerkbonStatus, formData: FormData): Promise<WerkbonStatus> {
  const montageId = String(formData.get("montage_id") ?? "");
  if (!UUID.test(montageId)) return { fout: foutTekst("geen_toegang") };
  const naam = String(formData.get("naam") ?? "").trim();
  if (naam.length < 3 || naam.length > 120) return { fout: foutTekst("naam") };
  const handtekening = formData.get("handtekening");
  if (!isGeldigeHandtekening(handtekening)) return { fout: foutTekst("handtekening") };
  if (formData.get("akkoord") !== "on") return { fout: "Vink aan dat de klant akkoord gaat met de oplevering." };

  const h = await headers();
  const u = await rpc("werkbon_opleveren", {
    p_montage: montageId, p_naam: naam, p_handtekening: handtekening,
    p_ip: eersteIp(h.get("x-forwarded-for")) ?? eersteIp(h.get("x-real-ip")), p_user_agent: h.get("user-agent"),
  });
  if (u?.fout === "checklist_onvolledig") return { fout: `Bij ${u.aantal ?? "enkele"} kozijn(en) is de checklist nog niet af. Elk kozijn moet geplaatst zijn; wat nog niet is afgewerkt, meld je als opleverpunt.` };
  if (!u?.ok) return { fout: foutTekst(u?.fout) };
  ververs(montageId);
  return { opgeslagen: true };
}
