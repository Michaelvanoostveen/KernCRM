import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { haalPrijsregels } from "@/lib/prijs";
import { kozijnSvg } from "@/lib/tekening/tekenen";
import { leesConfiguratie, positieOmschrijving } from "@/lib/projecten/positie";
import { dagLabel, leesMonteurDetail } from "@/lib/montage/monteur";
import { vandaagIso } from "@/lib/montage/week";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HULP: Record<string, string> = { geen: "Geen", steiger: "Steiger", hoogwerker: "Hoogwerker", beide: "Steiger en hoogwerker" };
const mm = (b: number | null | undefined, h: number | null | undefined) => (b != null && h != null ? `${b} × ${h} mm` : null);

async function Inhoud({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await maakServerClient();
  const { data } = await supabase.rpc("monteur_detail", { p_montage: id });
  const d = leesMonteurDetail(data);
  if (!d) notFound();

  const regels = haalPrijsregels();
  const vandaag = vandaagIso(new Date());
  const a = d.adres;
  const tel = d.mobiel || d.telefoon;
  const adresTekst = a ? `${a.straat} ${a.huisnummer}${a.toevoeging ? ` ${a.toevoeging}` : ""}, ${a.postcode} ${a.plaats}` : d.project_naam;
  const nummerVan = (pid: string | null) => d.posities.find((p) => p.positie_id === pid)?.nummer;

  return (
    <>
      <Link href="/monteur" className="text-sm text-stone-600 underline">&larr; Mijn montages</Link>
      <h1 className="mt-3 text-2xl font-semibold">{d.klant_naam}</h1>
      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresTekst)}`} target="_blank" rel="noreferrer" className="mt-1 block text-stone-700 underline">{adresTekst}</a>
      <div className="mt-1 text-sm text-stone-600">
        {dagLabel(d.start_datum, vandaag)}{d.eind_datum !== d.start_datum ? ` t/m ${dagLabel(d.eind_datum, vandaag).toLowerCase()}` : ""} · {d.werkdagen} {d.werkdagen === 1 ? "werkdag" : "werkdagen"} · {d.project_nummer}
      </div>

      <div className="mt-4 grid gap-2 rounded-xl border border-stone-200 bg-white p-4 text-sm sm:grid-cols-2">
        {tel && <div><span className="text-stone-500">Telefoon klant</span><br /><a href={`tel:${tel}`} className="text-base font-semibold underline">{tel}</a></div>}
        <div><span className="text-stone-500">Ploeg</span><br /><b>{d.ploeg}</b>{d.collegas.length ? ` (${d.collegas.join(", ")})` : ""}</div>
        <div><span className="text-stone-500">Steiger of hoogwerker</span><br /><b>{HULP[d.hulpmiddel] ?? d.hulpmiddel}</b></div>
        {d.leverdatum && <div><span className="text-stone-500">Kozijnen geleverd</span><br /><b>{dagLabel(d.leverdatum, vandaag)}</b></div>}
        {a?.bereikbaarheid && <div><span className="text-stone-500">Bereikbaarheid</span><br /><b>{a.bereikbaarheid}</b></div>}
        {a?.woningtype && <div><span className="text-stone-500">Woning</span><br /><b>{a.woningtype}{a.bouwjaar ? `, bouwjaar ${a.bouwjaar}` : ""}</b></div>}
        {d.notitie && <div className="sm:col-span-2"><span className="text-stone-500">Notitie van kantoor</span><br /><b>{d.notitie}</b></div>}
      </div>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-stone-500">Kozijnen ({d.posities.length})</h2>
      <ul className="mt-2 grid gap-3">
        {d.posities.map((p) => {
          let cfg;
          try { cfg = leesConfiguratie(p.config); } catch { cfg = null; }
          const svg = cfg ? kozijnSvg(regels, { ...cfg }, `Positie ${p.nummer}`) : null;
          const g = p.gemeten;
          return (
            <li key={p.positie_id} className="flex gap-4 rounded-xl border border-stone-200 bg-white p-4">
              {svg ? <div className="w-28 shrink-0 rounded-lg bg-[#efebe3] p-1.5" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="h-28 w-28 shrink-0 rounded-lg bg-stone-100" />}
              <div className="min-w-0 text-sm">
                <div className="text-lg font-bold">Pos. {p.nummer}{p.ruimte ? ` · ${p.ruimte}` : ""}{p.aantal > 1 ? ` · ${p.aantal}×` : ""}</div>
                {cfg && <div className="text-stone-700">{positieOmschrijving(regels, cfg)}</div>}
                {p.gewijzigd && <div className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Aangepast tijdens de inmeting</div>}
                {g && (
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                    {mm(g.bestel_breedte_mm, g.bestel_hoogte_mm) && (<><dt className="text-stone-500">Kozijnmaat</dt><dd className="font-semibold tabular-nums">{mm(g.bestel_breedte_mm, g.bestel_hoogte_mm)}</dd></>)}
                    {mm(g.binnen_breedte_mm, g.binnen_hoogte_mm) && (<><dt className="text-stone-500">Binnenmaat</dt><dd className="tabular-nums">{mm(g.binnen_breedte_mm, g.binnen_hoogte_mm)}</dd></>)}
                    {mm(g.buiten_breedte_mm, g.buiten_hoogte_mm) && (<><dt className="text-stone-500">Buitenmaat</dt><dd className="tabular-nums">{mm(g.buiten_breedte_mm, g.buiten_hoogte_mm)}</dd></>)}
                  </dl>
                )}
                {g?.opmerking && <div className="mt-1 text-stone-700">Let op: {g.opmerking}</div>}
              </div>
            </li>
          );
        })}
      </ul>

      {d.extras.length > 0 && (
        <>
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-stone-500">Extra&apos;s</h2>
          <ul className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white text-sm">
            {d.extras.map((e, i) => (
              <li key={i} className="px-4 py-2.5">{e.omschrijving}{e.aantal > 1 ? ` (${e.aantal}×)` : ""}{e.positie_id ? ` · pos. ${nummerVan(e.positie_id) ?? ""}` : " · hele project"}</li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-6 text-xs text-stone-500">Werkbon, checklist, foto&apos;s, uren en de handtekening van de klant bij de oplevering volgen in een volgende versie van deze app.</p>
    </>
  );
}

export default function MonteurDetailPagina(props: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Suspense fallback={<p className="text-stone-500">Montage laden…</p>}><Inhoud params={props.params} /></Suspense>
    </main>
  );
}
