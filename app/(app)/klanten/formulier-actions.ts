"use server";

import { redirect } from "next/navigation";
import { maakServerClient } from "@/lib/supabase/server";
import { leesFormulier, maakAdresRijen } from "@/lib/klanten/formulier";

export type FormStatus = { fout?: string; waarden: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formWaarden(formData: FormData) {
  const waarden: Record<string, string> = {};
  formData.forEach((v, k) => {
    if (typeof v === "string") waarden[k] = v;
  });
  return waarden;
}

export async function bewaarKlant(_vorige: FormStatus, formData: FormData): Promise<FormStatus> {
  const waarden = formWaarden(formData);
  const gelezen = leesFormulier(formData);
  if (!gelezen.ok) return { fout: gelezen.fout, waarden };

  const supabase = await maakServerClient();
  const { data: lid } = await supabase.from("tenant_leden").select("tenant_id").limit(1).maybeSingle();
  if (!lid) return { fout: "Je account hoort nog bij geen bedrijf. Vraag de beheerder om je toe te voegen.", waarden };

  const { data: klant, error } = await supabase
    .from("klanten")
    .insert({ tenant_id: lid.tenant_id, ...gelezen.klant })
    .select("id")
    .single();
  if (error || !klant) return { fout: "Opslaan lukte niet. Controleer de gegevens en probeer het opnieuw.", waarden };

  if (gelezen.project) {
    const rijen = maakAdresRijen({ tenantId: lid.tenant_id, klantId: klant.id, land: gelezen.land, project: gelezen.project, factuur: gelezen.factuur });
    const { error: adresFout } = await supabase.from("adressen").insert(rijen);
    if (adresFout) {
      console.error("adressen insert mislukt:", adresFout.code, adresFout.message);
      await supabase.from("klanten").delete().eq("id", klant.id);
      return { fout: `Het adres kon niet worden opgeslagen (${adresFout.code ?? "onbekend"}). De klant is niet bewaard; probeer het opnieuw.`, waarden };
    }
  }
  redirect(`/klanten/${klant.id}`);
}

export async function wijzigKlant(_vorige: FormStatus, formData: FormData): Promise<FormStatus> {
  const waarden = formWaarden(formData);
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { fout: "Deze klant is niet gevonden.", waarden };

  const gelezen = leesFormulier(formData);
  if (!gelezen.ok) return { fout: gelezen.fout, waarden };

  const supabase = await maakServerClient();
  const { data: bestaand } = await supabase.from("klanten").select("id, tenant_id, adressen(id)").eq("id", id).maybeSingle();
  if (!bestaand) return { fout: "Deze klant is niet gevonden of je mag hem niet wijzigen.", waarden };

  const { error } = await supabase.from("klanten").update({ ...gelezen.klant, gewijzigd: new Date().toISOString() }).eq("id", id);
  if (error) return { fout: "Opslaan lukte niet. Controleer de gegevens en probeer het opnieuw.", waarden };

  // Adressen vervangen: eerst de nieuwe rijen toevoegen, daarna pas de oude weghalen, zodat bij een fout niets verdwijnt.
  const oudeIds = (bestaand.adressen as { id: string }[]).map((a) => a.id);
  if (gelezen.project) {
    const rijen = maakAdresRijen({ tenantId: bestaand.tenant_id, klantId: id, land: gelezen.land, project: gelezen.project, factuur: gelezen.factuur });
    const { error: adresFout } = await supabase.from("adressen").insert(rijen);
    if (adresFout) {
      console.error("adressen insert mislukt:", adresFout.code, adresFout.message);
      return { fout: `De klantgegevens zijn bewaard, maar het adres niet (${adresFout.code ?? "onbekend"}). Probeer het opnieuw.`, waarden };
    }
  }
  if (oudeIds.length) await supabase.from("adressen").delete().in("id", oudeIds);
  redirect(`/klanten/${id}`);
}

export async function verwijderKlant(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) redirect("/klanten");
  const supabase = await maakServerClient();
  await supabase.from("klanten").delete().eq("id", id);
  redirect("/klanten");
}
