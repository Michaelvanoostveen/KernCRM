"use server";

import { redirect } from "next/navigation";
import { maakServerClient } from "@/lib/supabase/server";
import { isMailAdres } from "@/lib/mail/adres";
import { MailFout, maakMailProvider } from "@/lib/mail/provider";

const terug = (code: string): never => redirect(`/instellingen/email?m=${code}`);

async function mijnBedrijf(rollen: string[]) {
  const supabase = await maakServerClient();
  const { data: lid } = await supabase.from("tenant_leden").select("tenant_id").in("rol", rollen).limit(1).maybeSingle();
  return { supabase, tenantId: (lid?.tenant_id as string | undefined) ?? null };
}

/** Bewaart de mailinstellingen: afzender, antwoordadres en of mailen vanuit het CRM aanstaat. Alleen de directie. */
export async function bewaarMailInstellingen(formData: FormData) {
  const { supabase, tenantId } = await mijnBedrijf(["directie"]);
  if (!tenantId) return terug("rechten");
  const { data, error } = await supabase.rpc("mail_instellingen_bewaar", {
    p_tenant: tenantId, p_provider: String(formData.get("provider") ?? "geen"), p_actief: formData.get("actief") === "aan",
    p_naam: String(formData.get("afzender_naam") ?? "").slice(0, 80), p_afzender: String(formData.get("afzender_adres") ?? "").slice(0, 120), p_antwoord: String(formData.get("antwoord_adres") ?? "").slice(0, 120),
  });
  if (error) {
    console.error("mailinstellingen bewaren mislukt:", error.code, error.message);
    return terug("mislukt");
  }
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  return terug(uitkomst?.ok ? "bewaard" : uitkomst?.fout ?? "mislukt");
}

/** Verstuurt een testmail naar het eigen e-mailadres van de ingelogde gebruiker, om te controleren dat verzenden werkt en de mail niet in de spam komt. */
export async function stuurTestmail() {
  const { supabase, tenantId } = await mijnBedrijf(["directie", "kantoor"]);
  if (!tenantId) return terug("rechten");
  const { data: ik } = await supabase.auth.getUser();
  const aan = ik.user?.email ?? null;
  if (!isMailAdres(aan)) return terug("geen_eigen_adres");
  const { data: inst } = await supabase.from("mail_instellingen").select("provider, actief, afzender_naam, afzender_adres, antwoord_adres").eq("tenant_id", tenantId).maybeSingle();
  const i = inst as { provider: string; actief: boolean; afzender_naam: string | null; afzender_adres: string | null; antwoord_adres: string | null } | null;
  if (!i || !i.afzender_adres || !i.afzender_naam || i.provider === "geen") return terug("niet_ingesteld");
  const provider = maakMailProvider(i.provider, process.env.RESEND_API_KEY);
  if (!provider) return terug("geen_sleutel");
  const { data: mag } = await supabase.rpc("mail_mag_versturen", { p_tenant: tenantId });
  if (!(mag as { ok?: boolean } | null)?.ok) return terug("limiet");

  const onderwerp = "Testmail van KernCRM";
  const tekst = [
    "Dit is een testmail van KernCRM.", "",
    `Afzender: ${i.afzender_naam} <${i.afzender_adres}>`,
    `Antwoorden gaan naar: ${i.antwoord_adres ?? i.afzender_adres}`, "",
    "Komt deze mail in je inbox en niet in de spam? Dan werkt het verzenden. Controleer in je mailprogramma ook (via 'Toon origineel' of 'Berichtbron') dat SPF, DKIM en DMARC op 'pass' staan.",
  ].join("\n");
  const log = (status: "verzonden" | "mislukt", externId: string | null, fout: string | null) =>
    supabase.rpc("mail_log_toevoegen", { p_tenant: tenantId, p_soort: "test", p_factuur: null, p_creditnota: null, p_aan: aan, p_onderwerp: onderwerp, p_status: status, p_extern_id: externId, p_fout: fout });
  try {
    const uit = await provider.verstuur({ vanNaam: i.afzender_naam, vanAdres: i.afzender_adres, aan, antwoordAan: i.antwoord_adres, onderwerp, tekst, sleutel: `test-${tenantId}-${Date.now()}` });
    await log("verzonden", uit.externId, null);
    return terug("test_verzonden");
  } catch (e) {
    const fout = e instanceof MailFout ? e.message : "Onbekende fout bij het verzenden.";
    console.error("testmail mislukt:", fout);
    await log("mislukt", null, fout);
    return terug("test_mislukt");
  }
}
