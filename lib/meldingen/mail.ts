import { maakBeheerClient } from "@/lib/supabase/beheer";
import { MailFout, maakMailProvider } from "@/lib/mail/provider";
import { isMailAdres } from "@/lib/mail/adres";
import { basisUrl } from "./basis-url";
import { maakMeldingMail, type MeldingSoort } from "./mail-tekst";

type Klaar = {
  tenant_id?: string; offerte_id?: string; project_id?: string | null; tekst?: string | null; ontvangers?: string[];
  afzender?: { provider: string; naam: string; adres: string; antwoord: string | null };
};

/**
 * Mailt de meldingen van een offerte (geopend of getekend) naar de ontvangers die de mail niet hebben uitgezet. Mislukt het, dan blijft de melding in het CRM staan;
 * deze functie gooit nooit een fout, want de klant mag er niets van merken.
 */
export async function mailMeldingen(token: string, soort: MeldingSoort): Promise<void> {
  try {
    const db = maakBeheerClient();
    if (!db) return;
    const { data } = await db.rpc("melding_mail_klaarzetten", { p_token: token, p_soort: soort });
    const k = (data ?? {}) as Klaar;
    if (!k.ontvangers?.length || !k.afzender || !k.tekst || !k.tenant_id || !k.offerte_id) return;
    const provider = maakMailProvider(k.afzender.provider, process.env.RESEND_API_KEY);
    if (!provider) return;
    const basis = basisUrl();
    const link = basis ? `${basis}${k.project_id ? `/projecten/${k.project_id}` : "/meldingen"}` : null;
    const { onderwerp, tekst } = maakMeldingMail(soort, k.tekst, link, k.afzender.naam);
    for (const userId of k.ontvangers) {
      const { data: gebruiker } = await db.auth.admin.getUserById(userId);
      const aan = gebruiker?.user?.email ?? "";
      if (!isMailAdres(aan)) continue;
      const log = (status: "verzonden" | "mislukt", externId: string | null, fout: string | null) =>
        db.rpc("melding_mail_log", { p_tenant: k.tenant_id, p_offerte: k.offerte_id, p_aan: aan, p_onderwerp: onderwerp, p_status: status, p_extern_id: externId, p_fout: fout });
      try {
        const uit = await provider.verstuur({ vanNaam: k.afzender.naam, vanAdres: k.afzender.adres, aan, antwoordAan: k.afzender.antwoord, onderwerp, tekst, sleutel: `melding-${k.offerte_id}-${soort}-${userId}` });
        await log("verzonden", uit.externId, null);
      } catch (e) {
        await log("mislukt", null, e instanceof MailFout ? e.message : "Onbekende fout bij het verzenden.");
      }
    }
  } catch (e) {
    console.error("meldingsmail mislukt:", e instanceof Error ? e.message : "onbekend");
  }
}
