"use server";

import { redirect } from "next/navigation";
import { maakServerClient } from "@/lib/supabase/server";
import { STANDAARD_KOLOMMEN, schoneKolommen } from "@/lib/klanten/kolommen";

const SLEUTEL = "klanten_kolommen";

/** Leest de gekozen kolommen van de ingelogde gebruiker; bij een fout of geen keuze de standaard. */
export async function leesKolommen(): Promise<string[]> {
  const supabase = await maakServerClient();
  const { data, error } = await supabase.from("gebruiker_voorkeuren").select("waarde").eq("sleutel", SLEUTEL).maybeSingle();
  if (error || !data) return STANDAARD_KOLOMMEN;
  return schoneKolommen(data.waarde);
}

export async function bewaarKolommen(formData: FormData) {
  const supabase = await maakServerClient();
  const { data: lid } = await supabase.from("tenant_leden").select("tenant_id").limit(1).maybeSingle();
  if (!lid) redirect("/klanten");

  if (formData.get("actie") === "standaard") {
    await supabase.from("gebruiker_voorkeuren").delete().eq("sleutel", SLEUTEL).eq("tenant_id", lid.tenant_id);
  } else {
    const kolommen = schoneKolommen(formData.getAll("kolom").map(String));
    await supabase
      .from("gebruiker_voorkeuren")
      .upsert({ tenant_id: lid.tenant_id, sleutel: SLEUTEL, waarde: kolommen, bijgewerkt: new Date().toISOString() }, { onConflict: "user_id,tenant_id,sleutel" });
  }
  redirect("/klanten");
}
