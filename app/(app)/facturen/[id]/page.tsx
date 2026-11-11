import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { euroTekst } from "@/lib/offerte/bereken";
import { BEDRIJF_FACTUUR } from "@/lib/facturatie/bedrijf";
import { begroeting, isTeLaat, openstaand, type FactuurStatus } from "@/lib/facturatie/bereken";
import { dagenTeLaat, maakBetalingBevestigingMail, maakCreditnotaMail, maakHerinneringMail, mailtoLink } from "@/lib/facturatie/mail";
import { FACTUUR_MELDINGEN } from "@/lib/facturatie/meldingen";
import { haalRol } from "../../start-gegevens";
import { maakCreditnota, markeerBetalingBevestigd, markeerCreditnotaVerzonden, markeerVerzonden, registreerBetaling, registreerHerinnering, trekBetaallinkIn, voegBetaallinkToe } from "../actions";

type Factuur = {
  id: string; project_id: string; nummer: string; termijn: number; omschrijving: string; factuurdatum: string; vervaldatum: string; totaal_incl: number | string;
  bedrag_excl: number | string; status: FactuurStatus; verzonden_op: string | null; gecrediteerd: number | string; annulering_reden: string | null;
  debiteur: { aanhef?: string | null; achternaam?: string | null; naam?: string } | null;
  projecten: { naam: string; klanten: { email: string | null } | null } | null;
};
type Betaling = { id: string; bedrag: number | string; betaald_op: string; notitie: string | null; bevestiging_verstuurd_op: string | null };
type Creditnota = { id: string; nummer: string; datum: string; omschrijving: string; totaal_incl: number | string; verzonden_op: string | null };
type Betaallink = { id: string; url: string; bedrag: number | string; geldig_tot: string | null };
type Herinnering = { niveau: number; verstuurd_op: string };

const datum = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(`${iso}T12:00:00Z`));
const STATUS: Record<FactuurStatus, { label: string; kleur: string }> = {
  open: { label: "Open", kleur: "bg-amber-100 text-amber-900" },
  betaald: { label: "Betaald", kleur: "bg-green-100 text-green-800" },
  geannuleerd: { label: "Geannuleerd", kleur: "bg-stone-200 text-stone-700" },
  gecrediteerd: { label: "Gecrediteerd", kleur: "bg-stone-200 text-stone-700" },
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
    .select("id, tenant_id, project_id, nummer, termijn, omschrijving, factuurdatum, vervaldatum, totaal_incl, bedrag_excl, status, verzonden_op, gecrediteerd, annulering_reden, debiteur, projecten(naam, klanten(email))")
    .eq("id", id).maybeSingle();
  const f = data as unknown as Factuur | null;
  if (!f) notFound();

  const [{ data: bData }, { data: hData }, { data: cData }, magPrijzenData, { data: lData }] = await Promise.all([
    supabase.from("factuur_betalingen").select("id, bedrag, betaald_op, notitie, bevestiging_verstuurd_op").eq("factuur_id", id).order("betaald_op").order("aangemaakt"),
    supabase.from("factuur_herinneringen").select("niveau, verstuurd_op").eq("factuur_id", id).order("niveau"),
    supabase.from("creditnotas").select("id, nummer, datum, omschrijving, totaal_incl, verzonden_op").eq("factuur_id", id).order("aangemaakt"),
    supabase.rpc("mag_prijzen_aanpassen", { p_tenant: (data as { tenant_id?: string } | null)?.tenant_id ?? "" }),
    supabase.from("factuur_betaallinks").select("id, url, bedrag, geldig_tot").eq("factuur_id", id).eq("status", "open").maybeSingle(),
  ]);
  const betaallink = (lData as Betaallink | null) ?? null;
  const creditnotas = (cData ?? []) as Creditnota[];
  const magPrijzen = magPrijzenData.data === true;
  const betalingen = (bData ?? []) as Betaling[];
  const herinneringen = (hData ?? []) as Herinnering[];

  const vandaag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date());
  const totaal = Number(f.totaal_incl);
  const gecrediteerd = Number(f.gecrediteerd);
  const open = openstaand(totaal, betalingen.map((b) => Number(b.bedrag)), gecrediteerd);
  const teLaat = isTeLaat(f.status, f.vervaldatum, vandaag);
  const groet = begroeting(f.debiteur?.aanhef, f.debiteur?.achternaam, f.debiteur?.naam ?? "");
  const klantMail = f.projecten?.klanten?.email ?? null;
  const melding = code ? FACTUUR_MELDINGEN[code] : null;

  // Na elke betaling is het saldo anders: bereken per betaling wat er daarna nog openstond.
  const metSaldo = betalingen.map((b, i) => ({ ...b, resterend: openstaand(totaal, betalingen.slice(0, i + 1).map((x) => Number(x.bedrag)), gecrediteerd) }));

  const volgende = Math.min(3, herinneringen.length + 1);
  const herMail = f.status === "open" && teLaat && f.verzonden_op && herinneringen.length < 3
    ? maakHerinneringMail({ begroeting: groet, nummer: f.nummer, bedrag: open, vervaldatum: datum(f.vervaldatum), bedrijf: BEDRIJF_FACTUUR.naam, niveau: volgende, betaalLink: betaallink?.url ?? null })
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
          {gecrediteerd > 0 && <div className="flex justify-between"><dt className="text-stone-600">Gecrediteerd</dt><dd>{euroTekst(gecrediteerd, 2)}</dd></div>}
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
        <section className="mt-4 rounded-lg border border-stone-200 bg-white p-5" aria-label="Betaallink">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Betaallink</h2>
          {betaallink ? (
            <div className="mt-2 text-sm">
              <p>Actieve link voor {euroTekst(Number(betaallink.bedrag), 2)}{betaallink.geldig_tot ? `, geldig tot ${datum(betaallink.geldig_tot)}` : ""}:</p>
              <p className="mt-1 break-all"><a href={betaallink.url} target="_blank" rel="noreferrer" className="underline">{betaallink.url}</a></p>
              <p className="mt-1 text-xs text-stone-500">De link staat in de mailtekst van herinneringen en op de PDF van de factuur. Na een deelbetaling of creditnota klopt het bedrag niet meer en wordt de link ingetrokken.</p>
              {mag && (
                <form action={trekBetaallinkIn} className="mt-2">
                  <input type="hidden" name="factuur_id" value={f.id} /><input type="hidden" name="link_id" value={betaallink.id} />
                  <button className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-stone-50">Link intrekken</button>
                </form>
              )}
            </div>
          ) : <p className="mt-2 text-sm text-stone-600">Er is geen betaallink. Met een link kan de klant direct online betalen.</p>}
          {mag && (
            <details className="mt-3 rounded-md border border-stone-200 px-3 py-2">
              <summary className="cursor-pointer font-semibold">{betaallink ? "Andere link vastleggen" : "Betaallink vastleggen"}</summary>
              <form action={voegBetaallinkToe} className="mt-2 grid gap-2">
                <input type="hidden" name="factuur_id" value={f.id} />
                <label className="text-xs font-semibold">Link (begint met https://)<input name="url" required maxLength={500} inputMode="url" placeholder="https://" className={veld} /></label>
                <label className="text-xs font-semibold">Geldig tot (optioneel)<input type="date" name="geldig_tot" min={vandaag} className={veld} /></label>
                <p className="text-xs text-stone-500">Maak de link voor {euroTekst(open, 2)} in het dashboard van je betaaldienst en plak hem hier. Dat de klant heeft betaald, registreer je hierboven als betaling.</p>
                <button className="rounded-md bg-[#24332B] px-4 py-2 text-sm font-semibold text-white">Link vastleggen</button>
              </form>
            </details>
          )}
        </section>
      )}

      {(creditnotas.length > 0 || (mag && f.status === "open")) && (
        <section className="mt-4 rounded-lg border border-stone-200 bg-white p-5" aria-label="Creditnota's">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Creditnota&apos;s</h2>
          {creditnotas.length === 0 && <p className="mt-2 text-sm text-stone-600">Er is geen creditnota gemaakt. Heeft de klant de factuur al ontvangen en klopt het bedrag niet, maak dan een creditnota in plaats van de factuur aan te passen.</p>}
          <ul className="mt-2 grid gap-3">
            {creditnotas.map((c) => {
              const mail = maakCreditnotaMail({ begroeting: groet, nummer: c.nummer, factuurNummer: f.nummer, bedrag: Number(c.totaal_incl), nogTeBetalen: open, vervaldatum: datum(f.vervaldatum), bedrijf: BEDRIJF_FACTUUR.naam });
              return (
                <li key={c.id} className="rounded-md border border-stone-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><b className="font-mono">{c.nummer}</b> · {euroTekst(Number(c.totaal_incl), 2)} · {datum(c.datum)} · {c.omschrijving}</span>
                    <span className="flex items-center gap-3">
                      <a href={`/creditnotas/${c.id}/pdf`} target="_blank" rel="noreferrer" className="underline">PDF</a>
                      {c.verzonden_op ? <span className="text-green-700">Verstuurd op {datum(c.verzonden_op.slice(0, 10))}</span> : <span className="text-amber-800">Nog niet verstuurd</span>}
                    </span>
                  </div>
                  {mag && !c.verzonden_op && (
                    <details className="mt-2 rounded-md bg-stone-50 px-3 py-2">
                      <summary className="cursor-pointer font-semibold">Mailtekst met de creditnota</summary>
                      <label className="mt-2 block text-xs font-semibold">Onderwerp<input readOnly value={mail.onderwerp} className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" /></label>
                      <label className="mt-2 block text-xs font-semibold">Tekst<textarea readOnly rows={7} value={mail.tekst} className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" /></label>
                      <p className="mt-2 text-xs text-stone-600">Voeg de PDF van de creditnota als bijlage toe. Leg daarna vast dat hij is verstuurd.</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <a href={mailtoLink(klantMail, mail.onderwerp, mail.tekst)} className={knopLink}>Open in mailprogramma</a>
                        <form action={markeerCreditnotaVerzonden}>
                          <input type="hidden" name="factuur_id" value={f.id} /><input type="hidden" name="creditnota_id" value={c.id} />
                          <button className="rounded-md bg-[#24332B] px-4 py-2 text-sm font-semibold text-white">Creditnota is verstuurd</button>
                        </form>
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
          {mag && f.status === "open" && f.verzonden_op && open > 0 && magPrijzen && (
            <details className="mt-3 rounded-md border border-stone-200 px-3 py-2">
              <summary className="cursor-pointer font-semibold">Creditnota maken</summary>
              <form action={maakCreditnota} className="mt-2 grid gap-2">
                <input type="hidden" name="factuur_id" value={f.id} />
                <label className="text-xs font-semibold">Bedrag dat van de factuur af gaat (incl. btw, hooguit {euroTekst(open, 2)})<input name="bedrag" required inputMode="decimal" defaultValue={String(open).replace(".", ",")} className={veld} /></label>
                <label className="text-xs font-semibold">Omschrijving op de creditnota<input name="omschrijving" required maxLength={300} defaultValue={`Correctie op factuur ${f.nummer}`} className={veld} /></label>
                <label className="text-xs font-semibold">Reden (alleen zichtbaar voor de directie)<input name="reden" required maxLength={1000} className={veld} /></label>
                <p className="text-xs text-stone-500">De creditnota staat daarna vast en krijgt een eigen nummer. Het btw-bedrag wordt berekend volgens dezelfde verdeling als de factuur. Wil je het volledige bedrag crediteren, dan kan de termijn daarna opnieuw worden gefactureerd.</p>
                <button className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white">Creditnota maken</button>
              </form>
            </details>
          )}
          {mag && f.status === "open" && f.verzonden_op && !magPrijzen && <p className="mt-3 text-sm text-stone-500">Een creditnota maken kan met de toestemming &quot;prijzen aanpassen&quot;. Vraag de directie.</p>}
          {mag && f.status === "open" && !f.verzonden_op && <p className="mt-3 text-sm text-stone-500">Een creditnota kan pas nadat de factuur is verstuurd. Vóór het versturen pas je de factuur aan of annuleer je hem.</p>}
        </section>
      )}

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
