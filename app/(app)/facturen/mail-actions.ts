"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { maakServerClient } from "@/lib/supabase/server";
import { begroeting, openstaand, type FactuurStatus } from "@/lib/facturatie/bereken";
import { beoordeelHerinnering } from "@/lib/facturatie/herinnering";
import { maakBetalingBevestigingMail, maakCreditnotaMail, maakFactuurMail, maakHerinneringMail } from "@/lib/facturatie/mail";
import { laadCreditnotaPdf, laadFactuurPdf } from "@/lib/facturatie/pdf-laden";
import { isMailAdres } from "@/lib/mail/adres";
import { MailFout, maakMailProvider, type MailBijlage } from "@/lib/mail/provider";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const datum = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(`${iso}T12:00:00Z`));
const vandaagIso = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date());

type Soort = "factuur" | "herinnering" | "betaalbevestiging" | "creditnota";
type Debiteur = { naam?: string; aanhef?: string | null; achternaam?: string | null } | null;
type FactuurRij = {
  id: string; tenant_id: string; project_id: string; nummer: string; termijn: number; omschrijving: string; vervaldatum: string; totaal_incl: number | string; gecrediteerd: number | string;
  status: FactuurStatus; verzonden_op: string | null; debiteur: Debiteur; projecten: { naam: string; klanten: { email: string | null } | null } | null;
};

const FACTUUR_SELECT = "id, tenant_id, project_id, nummer, termijn, omschrijving, vervaldatum, totaal_incl, gecrediteerd, status, verzonden_op, debiteur, projecten(naam, klanten(email))";

/** Waar de gebruiker na afloop heen gaat: de factuurpagina (naar=factuur) of het factuurblok op de projectpagina. */
function terug(formData: FormData, f: { id: string; project_id: string }, code: string): never {
  if (formData.get("naar") === "factuur") redirect(`/facturen/${f.id}?m=${code}`);
  redirect(`/projecten/${f.project_id}?factuur=${code}#facturen`);
}

async function laadFactuur(supabase: SupabaseClient, factuurId: string): Promise<FactuurRij | null> {
  const { data } = await supabase.from("facturen").select(FACTUUR_SELECT).eq("id", factuurId).maybeSingle();
  return (data as unknown as FactuurRij | null) ?? null;
}

async function actieveBetaallink(supabase: SupabaseClient, factuurId: string): Promise<string | null> {
  const { data } = await supabase.from("factuur_betaallinks").select("url").eq("factuur_id", factuurId).eq("status", "open").or(`geldig_tot.is.null,geldig_tot.gte.${vandaagIso()}`).maybeSingle();
  return (data as { url?: string } | null)?.url ?? null;
}

async function openBedrag(supabase: SupabaseClient, f: FactuurRij): Promise<number> {
  const { data } = await supabase.from("factuur_betalingen").select("bedrag").eq("factuur_id", f.id);
  return openstaand(Number(f.totaal_incl), ((data ?? []) as { bedrag: number | string }[]).map((b) => Number(b.bedrag)), Number(f.gecrediteerd));
}

type Verzending = { ok: true; afzenderNaam: string } | { ok: false; code: string };

/**
 * Verstuurt één mail namens het bedrag van de factuur: controleert de instellingen en de limiet, verzendt, en legt de uitkomst (ook een mislukking) vast in het logboek.
 * Geeft de afzendernaam terug zodat de mailtekst eronder kan worden gezet; die tekst wordt dus vóór verzenden gemaakt met de naam uit `naamVoorTekst`.
 */
async function verstuur(supabase: SupabaseClient, o: {
  tenantId: string; soort: Soort; factuurId: string | null; creditnotaId: string | null; aan: string; bijlagen: MailBijlage[]; sleutel: string;
  maakTekst: (afzenderNaam: string) => { onderwerp: string; tekst: string };
}): Promise<Verzending> {
  const { data: inst } = await supabase.from("mail_instellingen").select("provider, actief, afzender_naam, afzender_adres, antwoord_adres").eq("tenant_id", o.tenantId).maybeSingle();
  const i = inst as { provider: string; actief: boolean; afzender_naam: string | null; afzender_adres: string | null; antwoord_adres: string | null } | null;
  if (!i || !i.actief || !i.afzender_adres || !i.afzender_naam) return { ok: false, code: "mail_niet_actief" };
  const provider = maakMailProvider(i.provider, process.env.RESEND_API_KEY);
  if (!provider) return { ok: false, code: "mail_geen_sleutel" };
  const { data: mag } = await supabase.rpc("mail_mag_versturen", { p_tenant: o.tenantId });
  const m = mag as { ok?: boolean; fout?: string } | null;
  if (!m?.ok) return { ok: false, code: m?.fout === "limiet" ? "mail_limiet" : "geen_toegang" };

  const { onderwerp, tekst } = o.maakTekst(i.afzender_naam);
  const log = (status: "verzonden" | "mislukt", externId: string | null, fout: string | null) =>
    supabase.rpc("mail_log_toevoegen", { p_tenant: o.tenantId, p_soort: o.soort, p_factuur: o.factuurId, p_creditnota: o.creditnotaId, p_aan: o.aan, p_onderwerp: onderwerp, p_status: status, p_extern_id: externId, p_fout: fout });
  try {
    const uit = await provider.verstuur({ vanNaam: i.afzender_naam, vanAdres: i.afzender_adres, aan: o.aan, antwoordAan: i.antwoord_adres, onderwerp, tekst, bijlagen: o.bijlagen, sleutel: o.sleutel });
    await log("verzonden", uit.externId, null);
    return { ok: true, afzenderNaam: i.afzender_naam };
  } catch (e) {
    const fout = e instanceof MailFout ? e.message : "Onbekende fout bij het verzenden.";
    console.error("mail versturen mislukt:", fout);
    await log("mislukt", null, fout);
    return { ok: false, code: "mail_mislukt" };
  }
}

const stringId = (formData: FormData, naam: string) => {
  const w = String(formData.get(naam) ?? "");
  return UUID.test(w) ? w : null;
};

/** Verstuurt de factuur met de PDF naar de klant en legt vast dat hij is verzonden. */
export async function verstuurFactuurMail(formData: FormData) {
  const factuurId = stringId(formData, "factuur_id");
  if (!factuurId) redirect("/facturen");
  const supabase = await maakServerClient();
  const f = await laadFactuur(supabase, factuurId);
  if (!f) redirect("/facturen");
  if (f.status !== "open") return terug(formData, f, "niet_open");
  if (f.verzonden_op) return terug(formData, f, "al_verzonden");
  const aan = f.projecten?.klanten?.email ?? null;
  if (!isMailAdres(aan)) return terug(formData, f, "mail_geen_adres");

  const betaalLink = await actieveBetaallink(supabase, f.id);
  const pdf = await laadFactuurPdf(supabase, f.id);
  if (!pdf) return terug(formData, f, "mislukt");
  const uit = await verstuur(supabase, {
    tenantId: f.tenant_id, soort: "factuur", factuurId: f.id, creditnotaId: null, aan: aan.trim(), sleutel: `factuur-${f.id}`,
    bijlagen: [{ bestandsnaam: pdf.bestandsnaam, inhoud: new Uint8Array(pdf.pdf) }],
    maakTekst: (bedrijf) => maakFactuurMail({
      begroeting: begroeting(f.debiteur?.aanhef, f.debiteur?.achternaam, f.debiteur?.naam ?? ""), nummer: f.nummer, termijn: f.termijn, omschrijving: f.omschrijving,
      bedrag: Number(f.totaal_incl), vervaldatum: datum(f.vervaldatum), adres: f.projecten?.naam ?? "", bedrijf, betaalLink,
    }),
  });
  if (!uit.ok) return terug(formData, f, uit.code);
  const { data } = await supabase.rpc("markeer_factuur_verzonden", { p_factuur: f.id });
  return terug(formData, f, (data as { ok?: boolean } | null)?.ok ? "mail_verzonden" : "mail_niet_vastgelegd");
}

/** Verstuurt de eerstvolgende betalingsherinnering met de factuur als bijlage en legt hem vast. De regels (wachttijd, maximaal drie) worden vooraf gecontroleerd. */
export async function verstuurHerinneringMail(formData: FormData) {
  const factuurId = stringId(formData, "factuur_id");
  if (!factuurId) redirect("/facturen");
  const supabase = await maakServerClient();
  const f = await laadFactuur(supabase, factuurId);
  if (!f) redirect("/facturen");
  const { data: hData } = await supabase.from("factuur_herinneringen").select("niveau, verstuurd_op").eq("factuur_id", f.id);
  const besluit = beoordeelHerinnering({ status: f.status, verzondenOp: f.verzonden_op, vervaldatum: f.vervaldatum, vandaag: vandaagIso(), nu: new Date(), herinneringen: (hData ?? []) as { niveau: number; verstuurd_op: string }[] });
  if (!besluit.ok) return terug(formData, f, besluit.fout);
  const aan = f.projecten?.klanten?.email ?? null;
  if (!isMailAdres(aan)) return terug(formData, f, "mail_geen_adres");

  const betaalLink = await actieveBetaallink(supabase, f.id);
  const open = await openBedrag(supabase, f);
  const pdf = await laadFactuurPdf(supabase, f.id);
  if (!pdf) return terug(formData, f, "mislukt");
  const uit = await verstuur(supabase, {
    tenantId: f.tenant_id, soort: "herinnering", factuurId: f.id, creditnotaId: null, aan: aan.trim(), sleutel: `herinnering-${f.id}-${besluit.niveau}`,
    bijlagen: [{ bestandsnaam: pdf.bestandsnaam, inhoud: new Uint8Array(pdf.pdf) }],
    maakTekst: (bedrijf) => maakHerinneringMail({
      begroeting: begroeting(f.debiteur?.aanhef, f.debiteur?.achternaam, f.debiteur?.naam ?? ""), nummer: f.nummer, bedrag: open, vervaldatum: datum(f.vervaldatum), bedrijf, niveau: besluit.niveau, betaalLink,
    }),
  });
  if (!uit.ok) return terug(formData, f, uit.code);
  const { data } = await supabase.rpc("registreer_herinnering", { p_factuur: f.id });
  return terug(formData, f, (data as { ok?: boolean } | null)?.ok ? "mail_verzonden" : "mail_niet_vastgelegd");
}

/** Verstuurt de bevestiging van een ontvangen betaling en legt vast dat hij is verstuurd. */
export async function verstuurBetaalbevestigingMail(formData: FormData) {
  const factuurId = stringId(formData, "factuur_id");
  const betalingId = stringId(formData, "betaling_id");
  if (!factuurId) redirect("/facturen");
  const supabase = await maakServerClient();
  const f = await laadFactuur(supabase, factuurId);
  if (!f) redirect("/facturen");
  if (!betalingId) return terug(formData, f, "ongeldig");
  const { data: bData } = await supabase.from("factuur_betalingen").select("id, bedrag, betaald_op, bevestiging_verstuurd_op").eq("factuur_id", f.id).order("betaald_op").order("aangemaakt");
  const betalingen = (bData ?? []) as { id: string; bedrag: number | string; betaald_op: string; bevestiging_verstuurd_op: string | null }[];
  const idx = betalingen.findIndex((b) => b.id === betalingId);
  if (idx < 0) return terug(formData, f, "ongeldig");
  const b = betalingen[idx];
  if (b.bevestiging_verstuurd_op) return terug(formData, f, "al_bevestigd");
  const aan = f.projecten?.klanten?.email ?? null;
  if (!isMailAdres(aan)) return terug(formData, f, "mail_geen_adres");

  const resterend = openstaand(Number(f.totaal_incl), betalingen.slice(0, idx + 1).map((x) => Number(x.bedrag)), Number(f.gecrediteerd));
  const uit = await verstuur(supabase, {
    tenantId: f.tenant_id, soort: "betaalbevestiging", factuurId: f.id, creditnotaId: null, aan: aan.trim(), sleutel: `bevestiging-${b.id}`, bijlagen: [],
    maakTekst: (bedrijf) => maakBetalingBevestigingMail({
      begroeting: begroeting(f.debiteur?.aanhef, f.debiteur?.achternaam, f.debiteur?.naam ?? ""), nummer: f.nummer, bedrag: Number(b.bedrag), betaaldOp: datum(b.betaald_op), resterend, vervaldatum: datum(f.vervaldatum), bedrijf,
    }),
  });
  if (!uit.ok) return terug(formData, f, uit.code);
  const { data } = await supabase.rpc("markeer_betaling_bevestigd", { p_betaling: b.id });
  return terug(formData, f, (data as { ok?: boolean } | null)?.ok ? "mail_verzonden" : "mail_niet_vastgelegd");
}

/** Verstuurt een creditnota met de PDF naar de klant en legt vast dat hij is verstuurd. */
export async function verstuurCreditnotaMail(formData: FormData) {
  const factuurId = stringId(formData, "factuur_id");
  const creditnotaId = stringId(formData, "creditnota_id");
  if (!factuurId) redirect("/facturen");
  const supabase = await maakServerClient();
  const f = await laadFactuur(supabase, factuurId);
  if (!f) redirect("/facturen");
  if (!creditnotaId) return terug(formData, f, "ongeldig");
  const { data: cData } = await supabase.from("creditnotas").select("id, nummer, totaal_incl, verzonden_op").eq("id", creditnotaId).eq("factuur_id", f.id).maybeSingle();
  const c = cData as { id: string; nummer: string; totaal_incl: number | string; verzonden_op: string | null } | null;
  if (!c) return terug(formData, f, "ongeldig");
  if (c.verzonden_op) return terug(formData, f, "al_verzonden");
  const aan = f.projecten?.klanten?.email ?? null;
  if (!isMailAdres(aan)) return terug(formData, f, "mail_geen_adres");

  const open = await openBedrag(supabase, f);
  const pdf = await laadCreditnotaPdf(supabase, c.id);
  if (!pdf) return terug(formData, f, "mislukt");
  const uit = await verstuur(supabase, {
    tenantId: f.tenant_id, soort: "creditnota", factuurId: f.id, creditnotaId: c.id, aan: aan.trim(), sleutel: `creditnota-${c.id}`,
    bijlagen: [{ bestandsnaam: pdf.bestandsnaam, inhoud: new Uint8Array(pdf.pdf) }],
    maakTekst: (bedrijf) => maakCreditnotaMail({
      begroeting: begroeting(f.debiteur?.aanhef, f.debiteur?.achternaam, f.debiteur?.naam ?? ""), nummer: c.nummer, factuurNummer: f.nummer, bedrag: Number(c.totaal_incl), nogTeBetalen: open, vervaldatum: datum(f.vervaldatum), bedrijf,
    }),
  });
  if (!uit.ok) return terug(formData, f, uit.code);
  const { data } = await supabase.rpc("markeer_creditnota_verzonden", { p_creditnota: c.id });
  return terug(formData, f, (data as { ok?: boolean } | null)?.ok ? "mail_verzonden" : "mail_niet_vastgelegd");
}
