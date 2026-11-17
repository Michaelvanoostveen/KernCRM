import type { SupabaseClient } from "@supabase/supabase-js";
import { MailFout, maakMailProvider, type MailBijlage } from "./provider";

export type MailSoort = "factuur" | "herinnering" | "betaalbevestiging" | "creditnota" | "offerte";

export type Verzending = { ok: true; afzenderNaam: string } | { ok: false; code: string };

export interface VerzendOpdracht {
  tenantId: string;
  soort: MailSoort;
  factuurId?: string | null;
  creditnotaId?: string | null;
  offerteId?: string | null;
  aan: string;
  bijlagen: MailBijlage[];
  /** Zelfde sleutel binnen 24 uur geeft nooit een tweede mail. */
  sleutel: string;
  /** Maakt de mailtekst; krijgt de afzendernaam van het bedrijf voor onder de tekst. */
  maakTekst: (afzenderNaam: string) => { onderwerp: string; tekst: string };
}

type Afzender = { provider: string; actief: boolean; naam: string | null; adres: string | null; antwoord: string | null; domein_ok: boolean } | null;

/**
 * Verstuurt één mail namens het bedrijf: controleert de instellingen, het vrijgegeven domein en de limiet, verzendt, en legt de uitkomst (ook een mislukking)
 * vast in het logboek. Een offerte mag ook verkoop mailen; facturen en wat daarbij hoort alleen directie en kantoor (dat bewaakt de database).
 * Dit staat bewust niet in een "use server"-bestand: het is een hulpfunctie van de serveracties, geen actie die een browser kan aanroepen.
 */
export async function verstuurMail(supabase: SupabaseClient, o: VerzendOpdracht): Promise<Verzending> {
  const { data: afz } = await supabase.rpc("mail_afzender", { p_tenant: o.tenantId });
  const i = afz as Afzender;
  if (!i || !i.actief || !i.adres || !i.naam) return { ok: false, code: "mail_niet_actief" };
  if (!i.domein_ok) return { ok: false, code: "mail_niet_actief" };
  const provider = maakMailProvider(i.provider, process.env.RESEND_API_KEY);
  if (!provider) return { ok: false, code: "mail_geen_sleutel" };
  const { data: mag } = await supabase.rpc(o.soort === "offerte" ? "mail_mag_versturen_offerte" : "mail_mag_versturen", { p_tenant: o.tenantId });
  const m = mag as { ok?: boolean; fout?: string } | null;
  if (!m?.ok) return { ok: false, code: m?.fout === "limiet" ? "mail_limiet" : m?.fout === "domein_niet_vrijgegeven" ? "mail_niet_actief" : "geen_toegang" };

  const { onderwerp, tekst } = o.maakTekst(i.naam);
  const log = (status: "verzonden" | "mislukt", externId: string | null, fout: string | null) =>
    o.soort === "offerte"
      ? supabase.rpc("mail_log_offerte_toevoegen", { p_tenant: o.tenantId, p_offerte: o.offerteId ?? null, p_aan: o.aan, p_onderwerp: onderwerp, p_status: status, p_extern_id: externId, p_fout: fout })
      : supabase.rpc("mail_log_toevoegen", { p_tenant: o.tenantId, p_soort: o.soort, p_factuur: o.factuurId ?? null, p_creditnota: o.creditnotaId ?? null, p_aan: o.aan, p_onderwerp: onderwerp, p_status: status, p_extern_id: externId, p_fout: fout });
  try {
    const uit = await provider.verstuur({ vanNaam: i.naam, vanAdres: i.adres, aan: o.aan, antwoordAan: i.antwoord, onderwerp, tekst, bijlagen: o.bijlagen, sleutel: o.sleutel });
    await log("verzonden", uit.externId, null);
    return { ok: true, afzenderNaam: i.naam };
  } catch (e) {
    const fout = e instanceof MailFout ? e.message : "Onbekende fout bij het verzenden.";
    console.error("mail versturen mislukt:", fout);
    await log("mislukt", null, fout);
    return { ok: false, code: "mail_mislukt" };
  }
}
