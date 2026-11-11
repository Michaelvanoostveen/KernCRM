import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { euroTekst } from "@/lib/offerte/bereken";
import { BEDRIJF_FACTUUR } from "@/lib/facturatie/bedrijf";
import { begroeting, isTeLaat, openstaand, type FactuurStatus } from "@/lib/facturatie/bereken";
import { dagenTeLaat, maakBetalingBevestigingMail, maakHerinneringMail, mailtoLink } from "@/lib/facturatie/mail";
import { FACTUUR_MELDINGEN } from "@/lib/facturatie/meldingen";
import { haalRol } from "../../start-gegevens";
import { markeerBetalingBevestigd, markeerVerzonden, registreerBetaling, registreerHerinnering } from "../actions";

type Factuur = {
  id: string; project_id: string; nummer: string; termijn: number; omschrijving: string; factuurdatum: string; vervaldatum: string; totaal_incl: number | string;
  bedrag_excl: number | string; status: FactuurStatus; verzonden_op: string | null; annulering_reden: string | null;
  debiteur: { aanhef?: string | null; achternaam?: string | null; naam?: string } | null;
  projecten: { naam: string; klanten: { email: string | null } | null } | null;
};
type Betaling = { id: string; bedrag: number | string; betaald_op: string; notitie: string | null; bevestiging_verstuurd_op: string | null };
type Herinnering = { niveau: number; verstuurd_op: string };

const datum = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(`${iso}T12:00:00Z`));
const STATUS: Record<FactuurStatus, { label: string; kleur: string }> = {
  open: { label: "Open", kleur: "bg-amber-100 text-amber-900" },
  betaald: { label: "Betaald", kleur: "bg-green-100 text-green-800" },
  geannuleerd: { label: "Geannuleerd", kleur: "bg-stone-200 text-stone-700" },
};
const veld = "mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm";
const knopLink = "inline-block rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-stone-50";

async function Inhoud({ params, zoek }: { params: Promise<{ id: string }>; zoek: Promise<{ m?: string }> }) {
  const [{ id }, { m: code }] = await Promise.all([params, zoek]);
  const rol = await haalRol();
  if (rol !== "directie" && rol !== "kantoor" && rol !== "verkoop") redirect("/");
  const mag = rol === "directie" || rol === "kantoor";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();

  const supabase = await maakServerClient();
  const { data } = await supabase.from("facturen")
    .select("id, project_id, nummer, termijn, omschrijving, factuurdatum, vervaldatum, totaal_incl, bedrag_excl, status, verzonden_op, annulering_reden, debiteur, projecten(naam, klanten(email))")
    .eq("id", id).maybeSingle();
  const f = data as unknown as Factuur | null;
  if (!f) notFound();

  const [{ data: bData }, { data: hData }] = await Promise.all([
    supabase.from("factuur_betalingen").select("id, bedrag, betaald_op, notitie, bevestiging_verstuurd_op").eq("factuur_id", id).order("betaald_op").order("aangemaakt"),
    supabase.from("factuur_herinneringen").select("niveau, verstuurd_op").eq("factuur_id", id).order("niveau"),
  ]);
  const betalingen = (bData ?? []) as Betaling[];
  const herinneringen = (hData ?? []) as Herinnering[];

  const vandaag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date());
  const totaal = Number(f.totaal_incl);
  const open = openstaand(totaal, betalingen.map((b) => Number(b.bedrag)));
  const teLaat = isTeLaat(f.status, f.vervaldatum, vandaag);
  const groet = begroeting(f.debiteur?.aanhef, f.debiteur?.achternaam, f.debiteur?.naam ?? "");
  const klantMail = f.projecten?.klanten?.email ?? null;
  const melding = code ? FACTUUR_MELDINGEN[code] : null;

  // Na elke betaling is het saldo anders: bereken per betaling wat er daarna nog openstond.
  const metSaldo = betalingen.map((b, i) => ({ ...b, resterend: openstaand(totaal, betalingen.slice(0, i + 1).map((x) => Number(x.bedrag))) }));

  const volgende = Math.min(3, herinneringen.length + 1);
  const herMail = f.status === "open" && teLaat && f.verzonden_op && herinneringen.length < 3
    ? maakHerinneringMail({ begroeting: groet, nummer: f.nummer, bedrag: open, vervaldatum: datum(f.vervaldatum), bedrijf: BEDRIJF_FACTUUR.naam, niveau: volgende })
    : null;
  const verborgen = <>
    <input type="hidden" name="naar" value="factuur" /><input type="hidden" name="project_id" value={f.project_id} /><input type="hidden" name="factuur_id" value={f.id} />
  </>;

  return (
    <>
      <Link href="/facturen" className="text-sm text-stone-600 underline">← Alle facturen</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Factuur <span className="font-mono">{f.nummer}</span></h1>
          <p className="mt-1 text-sm text-stone-600">{f.debiteur?.naam} · <Link href={`/projecten/${f.project_id}#facturen`} className="underline">{f.projecten?.naam}</Link></p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS[f.status].kleur}`}>{STATUS[f.status].label}</span>
      </div>
      {melding && <p role={melding.fout ? "alert" : "status"} className={`mt-4 rounded-md px-4 py-2.5 text-sm ${melding.fout ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>{melding.tekst}</p>}

      <section className="mt-4 rounded-lg border border-stone-200 bg-white p-5" aria-label="Gegevens">
        <p className="font-semibold">Termijn {f.termijn}: {f.omschrijving}</p>
        <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between"><dt className="text-stone-600">Bedrag excl. btw</dt><dd>{euroTekst(Number(f.bedrag_excl), 2)}</dd></div>
          <div className="flex justify-between"><dt className="text-stone-600">Bedrag incl. btw</dt><dd className="font-semibold">{euroTekst(totaal, 2)}</dd></div>
          <div className="flex justify-between"><dt className="text-stone-600">Factuurdatum</dt><dd>{datum(f.factuurdatum)}</dd></div>
          <div className="flex justify-between"><dt className="text-stone-600">Vervaldatum</dt><dd className={teLaat ? "font-semibold text-red-700" : ""}>{datum(f.vervaldatum)}{teLaat ? ` (${dagenTeLaat(f.vervaldatum, vandaag)} dagen te laat)` : ""}</dd></div>
          <div className="flex justify-between"><dt className="text-stone-600">Verzonden</dt><dd>{f.verzonden_op ? datum(f.verzonden_op.slice(0, 10)) : "nog niet"}</dd></div>
          {f.status === "open" && <div className="flex justify-between"><dt className="text-stone-600">Openstaand</dt><dd className="font-semibold">{euroTekst(open, 2)}</dd></div>}
        </dl>
        {f.status === "geannuleerd" && f.annulering_reden && <p className="mt-3 text-sm text-stone-600">Geannuleerd: {f.annulering_reden}</p>}
        <p className="mt-3"><a href={`/facturen/${f.id}/pdf`} target="_blank" rel="noreferrer" className={knopLink}>Open de PDF</a></p>
      </section>

      <section className="mt-4 rounded-lg border border-stone-200 bg-white p-5" aria-label="Betalingen">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Betalingen</h2>
        {metSaldo.length === 0 && <p className="mt-2 text-sm text-stone-600">Er is nog niets betaald.</p>}
        <ul className="mt-2 grid gap-3">
          {metSaldo.map((b) => {
            const mail = maakBetalingBevestigingMail({ begroeting: groet, nummer: f.nummer, bedrag: Number(b.bedrag), betaaldOp: datum(b.betaald_op), resterend: b.resterend, vervaldatum: datum(f.vervaldatum), bedrijf: BEDRIJF_FACTUUR.naam });
            return (
              <li key={b.id} className="rounded-md border border-stone-200 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b>{euroTekst(Number(b.bedrag), 2)}</b> op {datum(b.betaald_op)}{b.notitie ? ` · ${b.notitie}` : ""} <span className="text-stone-500">({b.resterend <= 0 ? "factuur voldaan" : `daarna nog ${euroTekst(b.resterend, 2)} open`})</span></span>
                  {b.bevestiging_verstuurd_op
                    ? <span className="text-green-700">Bevestiging verstuurd op {datum(b.bevestiging_verstuurd_op.slice(0, 10))}</span>
                    : <span className="text-amber-800">Bevestiging nog niet verstuurd</span>}
                </div>
                {mag && !b.bevestiging_verstuurd_op && (
                  <details className="mt-2 rounded-md bg-stone-50 px-3 py-2">
                    <summary className="cursor-pointer font-semibold">Betaalbevestiging naar de klant</summary>
                    <label className="mt-2 block text-xs font-semibold">Onderwerp<input readOnly value={mail.onderwerp} className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" /></label>
                    <label className="mt-2 block text-xs font-semibold">Tekst<textarea readOnly rows={7} value={mail.tekst} className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" /></label>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <a href={mailtoLink(klantMail, mail.onderwerp, mail.tekst)} className={knopLink}>Open in mailprogramma</a>
                      <form action={markeerBetalingBevestigd}>
                        <input type="hidden" name="factuur_id" value={f.id} /><input type="hidden" name="betaling_id" value={b.id} />
                        <button className="rounded-md bg-[#24332B] px-4 py-2 text-sm font-semibold text-white">Bevestiging is verstuurd</button>
                      </form>
                    </div>
                    {!klantMail && <p className="mt-2 text-xs text-amber-800">Bij deze klant staat geen e-mailadres. Vul het in bij de klantgegevens, of typ het zelf in je mailprogramma.</p>}
                  </details>
                )}
              </li>
            );
          })}
        </ul>

        {mag && f.status === "open" && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <form action={registreerBetaling} className="rounded-md border border-stone-200 p-3">
              {verborgen}
              <input type="hidden" name="bedrag" value={String(open).replace(".", ",")} />
              <p className="text-sm font-semibold">Volledig betaald</p>
              <p className="mt-1 text-xs text-stone-600">Registreert het openstaande bedrag van {euroTekst(open, 2)}.</p>
              <label className="mt-2 block text-xs font-semibold">Ontvangen op<input type="date" name="datum" defaultValue={vandaag} max={vandaag} className={veld} /></label>
              <label className="mt-2 block text-xs font-semibold">Notitie (optioneel)<input name="notitie" className={veld} /></label>
              <button className="mt-3 rounded-md bg-[#24332B] px-4 py-2 text-sm font-semibold text-white">Markeer als volledig betaald</button>
            </form>
            <form action={registreerBetaling} className="rounded-md border border-stone-200 p-3">
              {verborgen}
              <p className="text-sm font-semibold">Gedeeltelijke betaling</p>
              <label className="mt-2 block text-xs font-semibold">Bedrag (incl. btw)<input name="bedrag" required inputMode="decimal" placeholder="Bijvoorbeeld 1.000,00" className={veld} /></label>
              <label className="mt-2 block text-xs font-semibold">Ontvangen op<input type="date" name="datum" defaultValue={vandaag} max={vandaag} className={veld} /></label>
              <label className="mt-2 block text-xs font-semibold">Notitie (optioneel)<input name="notitie" className={veld} /></label>
              <button className="mt-3 rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-stone-50">Deelbetaling registreren</button>
            </form>
          </div>
        )}
        {!mag && f.status === "open" && <p className="mt-3 text-sm text-stone-500">Betalingen registreren is voorbehouden aan directie en kantoor.</p>}
      </section>

      {f.status === "open" && (
        <section className="mt-4 rounded-lg border border-stone-200 bg-white p-5" aria-label="Herinneringen">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Herinneringen</h2>
          {herinneringen.length === 0 && <p className="mt-2 text-sm text-stone-600">Er is nog geen herinnering gestuurd.</p>}
          <ul className="mt-2 text-sm text-stone-700">
            {herinneringen.map((h) => <li key={h.niveau}>Herinnering {h.niveau}: verstuurd op {datum(h.verstuurd_op.slice(0, 10))}</li>)}
          </ul>
          {!f.verzonden_op && mag && (
            <form action={markeerVerzonden} className="mt-3">
              {verborgen}
              <p className="mb-2 text-sm text-amber-800">De factuur is nog niet als verzonden gemarkeerd; herinneringen kunnen pas daarna.</p>
              <button className="rounded-md bg-[#24332B] px-4 py-2 text-sm font-semibold text-white">Markeer als verzonden</button>
            </form>
          )}
          {f.verzonden_op && !teLaat && <p className="mt-2 text-sm text-stone-500">Een herinnering is pas mogelijk als de vervaldatum ({datum(f.vervaldatum)}) is verstreken.</p>}
          {herinneringen.length >= 3 && <p className="mt-2 text-sm text-stone-500">Er zijn al drie herinneringen verstuurd.</p>}
          {herMail && mag && (
            <details className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2" open>
              <summary className="cursor-pointer font-semibold text-red-800">Herinnering {volgende} klaarzetten</summary>
              <label className="mt-2 block text-xs font-semibold">Onderwerp<input readOnly value={herMail.onderwerp} className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" /></label>
              <label className="mt-2 block text-xs font-semibold">Tekst<textarea readOnly rows={8} value={herMail.tekst} className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" /></label>
              <p className="mt-2 text-xs text-stone-600">Voeg de PDF van de factuur als bijlage toe. Leg daarna vast dat de herinnering is verstuurd.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a href={mailtoLink(klantMail, herMail.onderwerp, herMail.tekst)} className={knopLink}>Open in mailprogramma</a>
                <form action={registreerHerinnering}>
                  {verborgen}
                  <button className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white">Herinnering is verstuurd</button>
                </form>
              </div>
              {!klantMail && <p className="mt-2 text-xs text-amber-800">Bij deze klant staat geen e-mailadres.</p>}
            </details>
          )}
        </section>
      )}
    </>
  );
}

export default function Pagina({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <Suspense fallback={<p className="text-sm text-stone-500">Laden…</p>}>
        <Inhoud params={params} zoek={searchParams} />
      </Suspense>
    </main>
  );
}
