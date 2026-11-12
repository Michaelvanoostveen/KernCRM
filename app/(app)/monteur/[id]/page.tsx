import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { haalPrijsregels } from "@/lib/prijs";
import { kozijnSvg } from "@/lib/tekening/tekenen";
import { leesConfiguratie, positieOmschrijving } from "@/lib/projecten/positie";
import { dagLabel, leesMonteurDetail } from "@/lib/montage/monteur";
import { leesWerkbon, onvolledigeKozijnen, openPunten, FOTO_BUCKET_WERKBON } from "@/lib/montage/werkbon";
import { vandaagIso } from "@/lib/montage/week";
import { haalRol } from "../../start-gegevens";
import { startWerkbon } from "../actions";
import WerkbonKozijn from "./werkbon-kozijn";
import WerkbonMeerwerk, { type MeerwerkArtikel } from "./werkbon-meerwerk";
import { WerkbonAlgemeen, WerkbonOpleveren, WerkbonPunten, WerkbonUrenBlok } from "./werkbon-onderdelen";
import type { WerkbonFotoItem } from "./werkbon-foto-blok";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HULP: Record<string, string> = { geen: "Geen", steiger: "Steiger", hoogwerker: "Hoogwerker", beide: "Steiger en hoogwerker" };
const mm = (b: number | null | undefined, h: number | null | undefined) => (b != null && h != null ? `${b} × ${h} mm` : null);

async function Inhoud({ params, zoek }: { params: Promise<{ id: string }>; zoek: Promise<{ fout?: string }> }) {
  const { id } = await params;
  const { fout } = await zoek;
  if (!UUID.test(id)) notFound();
  const supabase = await maakServerClient();
  const { data } = await supabase.rpc("monteur_detail", { p_montage: id });
  const d = leesMonteurDetail(data);
  if (!d) notFound();

  const regels = haalPrijsregels();
  const vandaag = vandaagIso(new Date());
  const rol = await haalRol();
  const kantoor = rol === "directie" || rol === "kantoor";

  // De werkbon van deze montage, met tijdelijke links naar de foto's.
  const { data: wData } = await supabase.rpc("werkbon_laad", { p_montage: id });
  const werkbon = leesWerkbon(wData);
  const { data: urlData } = werkbon && werkbon.fotos.length ? await supabase.storage.from(FOTO_BUCKET_WERKBON).createSignedUrls(werkbon.fotos.map((f) => f.pad), 3600) : { data: [] };
  const fotoUrl = new Map((urlData ?? []).flatMap((u) => (u.path && u.signedUrl ? [[u.path, u.signedUrl] as const] : [])));
  const fotosVan = (pid: string | null, soort: string): WerkbonFotoItem[] => (werkbon?.fotos ?? []).filter((f) => f.positie_id === pid && f.soort === soort && fotoUrl.get(f.pad)).map((f) => ({ id: f.id, url: fotoUrl.get(f.pad)! }));
  const schrijfbaar = !!werkbon && werkbon.status === "open" && d.status === "bezig";
  const { data: artData } = schrijfbaar ? await supabase.rpc("werkbon_meerwerk_artikelen", { p_montage: id }) : { data: [] };
  const artikelen = ((artData ?? []) as MeerwerkArtikel[]).map((a) => ({ ...a, prijs: Number(a.prijs) }));
  const meerwerkOpen = werkbon ? werkbon.meerwerk.filter((x) => x.status === "voorgesteld").length : 0;
  // Ook een montage die kantoor al op "bezig" heeft gezet, maar waarvoor nog geen werkbon is aangemaakt, kan hier nog worden gestart.
  const kanStarten = !werkbon && (d.status === "definitief" || d.status === "bezig");
  const startToegestaan = d.start_datum <= vandaag;
  const onvolledig = werkbon ? onvolledigeKozijnen(werkbon.regels, werkbon.punten) : 0;
  const posLijst = d.posities.map((p) => ({ id: p.positie_id, label: `Pos. ${p.nummer}${p.ruimte ? ` · ${p.ruimte}` : ""}` }));
  const FOUTEN: Record<string, string> = { niet_te_verwijderen: "Dit meerwerk is al goedgekeurd of bestaat niet meer.", te_vroeg: "Je kunt pas beginnen op of na de startdatum van de montage.", voorlopig: "Deze montage is nog voorlopig: kantoor moet eerst de leverdatum invullen.", geen_toegang: "Je hebt geen toegang tot deze montage.", niet_te_starten: "Deze montage kan niet meer worden gestart.", mislukt: "Het lukte niet. Probeer het opnieuw." };
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

      {fout && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{FOUTEN[fout] ?? FOUTEN.mislukt}</p>}
      {kanStarten && (
        <form action={startWerkbon} className="mt-4 rounded-xl border-2 border-[#B35B40] bg-white p-4">
          <input type="hidden" name="montage_id" value={d.id} />
          <p className="text-sm text-stone-700">{startToegestaan ? (d.status === "bezig" ? "Deze montage staat al op bezig, maar er is nog geen werkbon. Maak hem nu aan: de checklist per kozijn, foto's, uren en de oplevering." : "Aan de slag? Met starten maak je de werkbon aan: de checklist per kozijn, foto's, uren en de oplevering.") : `Je kunt starten op ${dagLabel(d.start_datum, vandaag).toLowerCase()}.`}</p>
          <button disabled={!startToegestaan} className="mt-3 w-full rounded-lg bg-[#B35B40] px-6 py-4 text-base font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{d.status === "bezig" ? "Werkbon aanmaken" : "Montage starten"}</button>
        </form>
      )}
      {werkbon?.status === "opgeleverd" && werkbon.akkoord && (
        <p role="status" className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
          Opgeleverd{werkbon.opgeleverd_op ? ` op ${new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(werkbon.opgeleverd_op))}` : ""}, getekend door {werkbon.akkoord.naam}{werkbon.akkoord.met_voorbehoud ? ` (met voorbehoud: ${werkbon.akkoord.aantal_open_punten} ${werkbon.akkoord.aantal_open_punten === 1 ? "opleverpunt" : "opleverpunten"})` : ""}.
        </p>
      )}

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-stone-500">Kozijnen ({d.posities.length})</h2>
      <ul className="mt-2 grid gap-3">
        {d.posities.map((p) => {
          let cfg;
          try { cfg = leesConfiguratie(p.config); } catch { cfg = null; }
          const svg = cfg ? kozijnSvg(regels, { ...cfg }, `Positie ${p.nummer}`) : null;
          const g = p.gemeten;
          return (
            <li key={p.positie_id} className="flex flex-wrap gap-4 rounded-xl border border-stone-200 bg-white p-4">
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
              {werkbon && (
                <div className="basis-full">
                  <WerkbonKozijn montageId={d.id} positieId={p.positie_id} regel={werkbon.regels.find((x) => x.positie_id === p.positie_id) ?? null}
                    voor={fotosVan(p.positie_id, "voor")} na={fotosVan(p.positie_id, "na")} vergrendeld={!schrijfbaar} />
                </div>
              )}
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
      {werkbon && (
        <>
          <WerkbonUrenBlok montageId={d.id} uren={werkbon.uren} startDatum={d.start_datum} vandaag={vandaag} vergrendeld={!schrijfbaar} />
          <WerkbonAlgemeen montageId={d.id} bijzonderheden={werkbon.bijzonderheden} kantoorActie={werkbon.kantoor_actie} opgeruimd={werkbon.opgeruimd} vergrendeld={!schrijfbaar} />
          <WerkbonPunten montageId={d.id} punten={werkbon.punten} posities={posLijst} fotos={fotosVan(null, "punt")} vergrendeld={!schrijfbaar} kantoor={kantoor} />
          <WerkbonMeerwerk montageId={d.id} meerwerk={werkbon.meerwerk} artikelen={artikelen} posities={posLijst} vergrendeld={!schrijfbaar} />
          {schrijfbaar && <WerkbonOpleveren montageId={d.id} klantNaam={d.klant_naam} onvolledig={onvolledig} openPunten={openPunten(werkbon.punten)} meerwerkOpen={meerwerkOpen} />}
        </>
      )}
    </>
  );
}

export default function MonteurDetailPagina(props: { params: Promise<{ id: string }>; searchParams: Promise<{ fout?: string }> }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Suspense fallback={<p className="text-stone-500">Montage laden…</p>}><Inhoud params={props.params} zoek={props.searchParams} /></Suspense>
    </main>
  );
}
