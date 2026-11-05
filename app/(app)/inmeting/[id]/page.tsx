import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { haalPrijsregels } from "@/lib/prijs";
import { kozijnSvg } from "@/lib/tekening/tekenen";
import { leesConfiguratie, positieOmschrijving } from "@/lib/projecten/positie";
import { leesDetail } from "@/lib/inmeting/types";
import { rondInmetingAf } from "../actions";
import InmeetFormulier from "./inmeet-formulier";

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
  const vergrendeld = d.status !== "gepland";
  const alleIngevuld = d.posities.every((p) => p.gemeten?.breedte_mm != null && p.gemeten?.hoogte_mm != null);
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
      {fout === "onvolledig" && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-red-800">Afronden kan pas als bij elke positie een breedte en hoogte is ingevuld en opgeslagen.</p>}
      {vergrendeld && afgerond !== "1" && <p role="status" className="mt-4 rounded-lg bg-stone-100 px-4 py-3 text-stone-700">Deze inmeting is afgerond en kan niet meer worden gewijzigd.</p>}

      <div className="mt-5 grid gap-4">
        {d.posities.map((p) => {
          let cfg;
          try { cfg = leesConfiguratie(p.config); } catch { cfg = null; }
          const svg = cfg ? kozijnSvg(regels, { ...cfg }, `Positie ${p.nummer}`) : null;
          return (
            <InmeetFormulier key={`${p.positie_id}-${p.gemeten?.breedte_mm ?? ""}-${p.gemeten?.hoogte_mm ?? ""}`}
              inmetingId={d.id} positieId={p.positie_id} nummer={p.nummer} ruimte={p.ruimte} aantal={p.aantal}
              omschrijving={cfg ? positieOmschrijving(regels, cfg) : ""} svg={svg}
              offerteBreedte={cfg?.w ?? 0} offerteHoogte={cfg?.h ?? 0} begin={p.gemeten} vergrendeld={vergrendeld} />
          );
        })}
      </div>

      {!vergrendeld && (
        <form action={rondInmetingAf} className="mt-6 rounded-xl border border-stone-200 bg-white p-4">
          <input type="hidden" name="inmeting_id" value={d.id} />
          <p className="text-sm text-stone-600">{alleIngevuld ? "Alle posities zijn ingemeten. Rond de inmeting af zodat kantoor verder kan." : "Meet en bewaar eerst alle posities. Daarna kun je de inmeting afronden."}</p>
          <button disabled={!alleIngevuld} className="mt-3 w-full rounded-lg bg-[#24332B] px-6 py-4 text-base font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">Inmeting afronden</button>
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
