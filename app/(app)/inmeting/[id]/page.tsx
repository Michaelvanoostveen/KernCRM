import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { haalPrijsregels } from "@/lib/prijs";
import { kozijnSvg } from "@/lib/tekening/tekenen";
import { leesConfiguratie, positieOmschrijving } from "@/lib/projecten/positie";
import { leesDetail } from "@/lib/inmeting/types";
import { leesWijzigingen } from "@/lib/inmeting/wijzigingen";
import { euro } from "@/lib/projecten/positie";
import { rondInmetingAf, verwijderWijziging } from "../actions";
import InmeetFormulier from "./inmeet-formulier";
import WijzigingFormulier from "./wijziging-formulier";
import ExtraFormulier, { type ExtraArtikel } from "./extra-formulier";
import KlantAkkoord from "./klant-akkoord";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dagTijd = (iso: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));

async function Inhoud({ params, zoek }: { params: Promise<{ id: string }>; zoek: Promise<{ afgerond?: string; fout?: string }> }) {
  const { id } = await params;
  const { afgerond, fout } = await zoek;
  if (!UUID.test(id)) notFound();
  const supabase = await maakServerClient();
  const { data } = await supabase.rpc("inmeting_detail", { p_inmeting: id });
  const d = leesDetail(data);
  if (!d) notFound();

  const regels = haalPrijsregels();
  const [{ data: wData }, { data: aData }, { data: magData }] = await Promise.all([
    supabase.rpc("inmeting_wijzigingen_lijst", { p_inmeting: id }),
    supabase.rpc("inmeting_extra_artikelen", { p_inmeting: id }),
    supabase.rpc("inmeting_mag_prijzen", { p_inmeting: id }),
  ]);
  const magPrijzen = magData === true;
  const wijzigingen = leesWijzigingen(wData);
  const artikelen = (Array.isArray(aData) ? aData : []) as ExtraArtikel[];
  const openstaand = wijzigingen.filter((w) => w.status === "voorgesteld");
  const openTotaal = openstaand.reduce((som, w) => som + w.meerprijs, 0);
  const positieLabel = (pid: string | null) => { const p = d.posities.find((x) => x.positie_id === pid); return p ? `Pos. ${p.nummer}${p.ruimte ? ` · ${p.ruimte}` : ""}` : "Hele project"; };
  const prijsTekst = (n: number) => (n >= 0 ? `+ ${euro(n)}` : `− ${euro(-n)}`);
  const vergrendeld = d.status !== "gepland";
  const alleIngevuld = d.posities.every((p) => p.gemeten?.bestel_breedte_mm != null && p.gemeten?.bestel_hoogte_mm != null);
  const a = d.adres;
  const tel = d.mobiel || d.telefoon;

  return (
    <>
      <Link href="/inmeting" className="text-sm text-stone-600 underline">&larr; Inmetingen</Link>
      <h1 className="mt-3 text-2xl font-semibold">{d.klant_naam}</h1>
      <div className="mt-1 text-stone-700">
        {a ? `${a.straat} ${a.huisnummer}${a.toevoeging ? ` ${a.toevoeging}` : ""}, ${a.postcode} ${a.plaats}` : d.project_naam}
      </div>
      <div className="mt-1 text-sm text-stone-600">{dagTijd(d.gepland_op)} · {d.project_nummer}</div>

      <div className="mt-4 grid gap-2 rounded-xl border border-stone-200 bg-white p-4 text-sm sm:grid-cols-2">
        {tel && <div><span className="text-stone-500">Telefoon</span><br /><a href={`tel:${tel}`} className="text-base font-semibold underline">{tel}</a></div>}
        {a?.bereikbaarheid && <div><span className="text-stone-500">Bereikbaarheid</span><br /><b>{a.bereikbaarheid}</b></div>}
        {a?.woningtype && <div><span className="text-stone-500">Woning</span><br /><b>{a.woningtype}{a.bouwjaar ? `, bouwjaar ${a.bouwjaar}` : ""}</b></div>}
        {d.notitie && <div className="sm:col-span-2"><span className="text-stone-500">Notitie van kantoor</span><br /><b>{d.notitie}</b></div>}
      </div>

      {afgerond === "1" && <p role="status" className="mt-4 rounded-lg bg-green-50 px-4 py-3 font-semibold text-green-800">De inmeting is afgerond. Bedankt!</p>}
      {fout === "akkoord_nodig" && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-red-800">Er staan wijzigingen open zonder akkoord van de klant.</p>}
      {fout === "onvolledig" && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-red-800">Afronden kan pas als bij elke positie een breedte en hoogte is ingevuld en opgeslagen.</p>}
      {vergrendeld && afgerond !== "1" && <p role="status" className="mt-4 rounded-lg bg-stone-100 px-4 py-3 text-stone-700">Deze inmeting is afgerond en kan niet meer worden gewijzigd.</p>}

      <div className="mt-5 grid gap-4">
        {d.posities.map((p) => {
          let cfg;
          try { cfg = leesConfiguratie(p.config); } catch { cfg = null; }
          const svg = cfg ? kozijnSvg(regels, { ...cfg }, `Positie ${p.nummer}`) : null;
          return (
            <div key={p.positie_id}>
            <InmeetFormulier key={`${p.positie_id}-${p.gemeten?.bestel_breedte_mm ?? ""}-${p.gemeten?.bestel_hoogte_mm ?? ""}`}
              inmetingId={d.id} positieId={p.positie_id} nummer={p.nummer} ruimte={p.ruimte} aantal={p.aantal}
              omschrijving={cfg ? positieOmschrijving(regels, cfg) : ""} svg={svg}
              offerteBreedte={cfg?.w ?? 0} offerteHoogte={cfg?.h ?? 0} begin={p.gemeten} vergrendeld={vergrendeld} />
            {cfg && !vergrendeld && (
              <details className="mt-2 rounded-xl border border-stone-200 bg-white px-4 py-3">
                <summary className="cursor-pointer text-sm font-semibold">Indeling, draairichting, kleur of glas aanpassen</summary>
                <WijzigingFormulier inmetingId={d.id} positieId={p.positie_id} regels={regels} begin={cfg} aantal={p.aantal} magPrijzen={magPrijzen} />
              </details>
            )}
            </div>
          );
        })}
      </div>

      {(!vergrendeld || wijzigingen.length > 0) && (
        <section className="mt-6 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="text-lg font-bold">Wijzigingen en extra&apos;s</h2>
          <p className="mt-1 text-sm text-stone-600">Wijzigingen met een meerprijs gelden pas na het akkoord van de klant. Je ziet hier alleen de meerprijs van deze wijzigingen.</p>
          {wijzigingen.length === 0 && <p className="mt-3 text-sm text-stone-500">Nog geen wijzigingen of extra&apos;s.</p>}
          <ul className="mt-3 divide-y divide-stone-100">
            {wijzigingen.map((w) => (
              <li key={w.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold">{w.soort === "extra" ? `Extra: ${w.omschrijving}${w.aantal > 1 ? ` (${w.aantal}×)` : ""}` : `Wijziging: ${w.omschrijving}`}</div>
                  <div className="text-stone-600">{positieLabel(w.positie_id)} · {w.status === "akkoord" ? "akkoord klant" : "wacht op akkoord"}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-bold tabular-nums">{prijsTekst(w.meerprijs)}</div>
                  {w.status === "voorgesteld" && !vergrendeld && (
                    <form action={verwijderWijziging}>
                      <input type="hidden" name="inmeting_id" value={d.id} /><input type="hidden" name="wijziging_id" value={w.id} />
                      <button className="text-xs text-red-700 underline">Verwijderen</button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {openstaand.length > 0 && <p className="mt-2 text-right text-sm font-bold">Totaal te accorderen: {prijsTekst(openTotaal)} incl. btw</p>}
          {!vergrendeld && artikelen.length > 0 && (
            <details className="mt-4 rounded-lg border border-stone-200 px-3 py-2">
              <summary className="cursor-pointer text-sm font-semibold">Extra artikel toevoegen</summary>
              <div className="mt-2">
                <ExtraFormulier inmetingId={d.id} magPrijzen={magPrijzen} artikelen={artikelen} posities={d.posities.map((p) => ({ id: p.positie_id, label: `Pos. ${p.nummer}${p.ruimte ? ` · ${p.ruimte}` : ""}` }))} />
              </div>
            </details>
          )}
          {!vergrendeld && openstaand.length > 0 && <KlantAkkoord inmetingId={d.id} klantNaam={d.klant_naam} bedrag={prijsTekst(openTotaal)} totaal={openTotaal} />}
        </section>
      )}

      {!vergrendeld && (
        <form action={rondInmetingAf} className="mt-6 rounded-xl border border-stone-200 bg-white p-4">
          <input type="hidden" name="inmeting_id" value={d.id} />
          <p className="text-sm text-stone-600">{!alleIngevuld ? "Meet en bewaar eerst alle posities. Daarna kun je de inmeting afronden." : openstaand.length > 0 ? "Er staan wijzigingen open. Laat de klant eerst akkoord geven of verwijder ze." : "Alle posities zijn ingemeten. Rond de inmeting af zodat kantoor verder kan."}</p>
          <button disabled={!alleIngevuld || openstaand.length > 0} className="mt-3 w-full rounded-lg bg-[#24332B] px-6 py-4 text-base font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">Inmeting afronden</button>
        </form>
      )}
    </>
  );
}

export default function InmetingPagina(props: { params: Promise<{ id: string }>; searchParams: Promise<{ afgerond?: string; fout?: string }> }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Suspense fallback={<p className="text-stone-500">Inmeting laden…</p>}><Inhoud params={props.params} zoek={props.searchParams} /></Suspense>
    </main>
  );
}
