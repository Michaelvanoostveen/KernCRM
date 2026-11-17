"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { maakServerClient } from "@/lib/supabase/server";
import { isMailAdres } from "@/lib/mail/adres";
import { verstuurMail } from "@/lib/mail/versturen";
import { maakMail } from "@/lib/offerte/mail";
import { laadOffertePdf } from "@/lib/offerte/pdf/laden";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Klant = { naam: string; aanhef: string | null; achternaam: string | null; email: string | null } | null;

/**
 * Mailt de verstuurde offerte naar de klant: de link naar de online offerte in de tekst, de PDF als bijlage. Mag ook door verkoop.
 * De offerte moet al verstuurd (vergrendeld) zijn: dan bestaat de link. Een dubbele klik binnen een minuut geeft geen tweede mail.
 */
export async function verstuurOfferteMail(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  if (!UUID.test(projectId)) redirect("/projecten");
  const terug = (code: string): never => redirect(`/projecten/${projectId}?mail=${code}`);

  const supabase = await maakServerClient();
  const { data: p } = await supabase.from("projecten").select("id, tenant_id, nummer, naam, klanten(naam, aanhef, achternaam, email)").eq("id", projectId).maybeSingle();
  if (!p) redirect("/projecten");
  const klant = p.klanten as unknown as Klant;
  const { data: o } = await supabase.from("offertes").select("id, versie, status, publiek_token, geldig_tot").eq("project_id", projectId).order("versie", { ascending: false }).limit(1).maybeSingle();
  if (!o || o.status !== "verstuurd" || !o.publiek_token) return terug("offerte_niet_verstuurd");
  if (!isMailAdres(klant?.email)) return terug("geen_adres");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const protocol = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const link = `${protocol}://${host}/o/${o.publiek_token}`;
  const pdf = await laadOffertePdf(o.publiek_token);

  const uit = await verstuurMail(supabase, {
    tenantId: p.tenant_id, soort: "offerte", offerteId: o.id, aan: klant!.email!.trim(), sleutel: `offerte-${o.id}-${Math.floor(Date.now() / 60_000)}`,
    bijlagen: pdf ? [{ bestandsnaam: pdf.bestandsnaam, inhoud: new Uint8Array(pdf.pdf) }] : [],
    maakTekst: (bedrijf) => maakMail({ aanhef: klant?.aanhef ?? null, achternaam: klant?.achternaam ?? null, klantNaam: klant?.naam ?? "", nummer: p.nummer, versie: o.versie, geldigTot: o.geldig_tot, adres: p.naam, link, bedrijf }),
  });
  return terug(uit.ok ? "verzonden" : uit.code);
}
