import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { haalPrijsregels } from "@/lib/prijs";
import { kozijnSvg } from "@/lib/tekening/tekenen";
import { FASEN, faseIndex, faseLabel } from "@/lib/projecten/fase";
import { euro, leesConfiguratie, positieOmschrijving, regelTotaal } from "@/lib/projecten/positie";
import { verwijderPositie } from "../actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Positie = { id: string; nummer: number; ruimte: string | null; aantal: number; prijs: number; config: unknown };
type Project = {
  id: string; nummer: string; naam: string; fase: string; aangemaakt: string;
  klanten: { id: string; naam: string } | null;
  offertes: { id: string; versie: number; status: string }[];
  posities: Positie[];
};

const STATUS: Record<string, string> = { concept: "Concept", verstuurd: "Verstuurd", akkoord: "Akkoord", afgewezen: "Afgewezen", vervallen: "Vervallen" };

function tekeningVan(p: Positie): string | null {
  try {
    return kozijnSvg(haalPrijsregels(), { ...leesConfiguratie(p.config) }, `Positie ${p.nummer}`);
  } catch {
    return null;
  }
}

function Tekening({ p }: { p: Positie }) {
  const svg = tekeningVan(p);
  return svg ? (
    <div className="w-28 shrink-0 rounded-md bg-[#efebe3] sm:w-36" dangerouslySetInnerHTML={{ __html: svg }} />
  ) : (
    <div className="grid h-28 w-28 shrink-0 place-items-center rounded-md bg-stone-100 text-xs text-stone-500 sm:w-36">Geen tekening</div>
  );
}

async function Inhoud({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await maakServerClient();
  const { data } = await supabase
    .from("projecten")
    .select("id, nummer, naam, fase, aangemaakt, klanten(id, naam), offertes(id, versie, status), posities(id, nummer, ruimte, aantal, prijs, config)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  const p = data as unknown as Project;
  const regels = haalPrijsregels();
  const posities = [...p.posities].sort((a, b) => a.nummer - b.nummer);
  const totaal = posities.reduce((som, x) => som + regelTotaal(Number(x.prijs), x.aantal), 0);
  const offerte = [...p.offertes].sort((a, b) => b.versie - a.versie)[0];
  const nu = faseIndex(p.fase);

  return (
    <>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-xs text-stone-500">{p.nummer}</div>
          <h1 className="text-2xl font-semibold">{p.naam}</h1>
          <p className="mt-1 text-sm text-stone-600">
            {p.klanten ? <>Klant: <Link href={`/klanten/${p.klanten.id}`} className="underline underline-offset-2">{p.klanten.naam}</Link></> : null}
            {offerte ? <> · Offerte v{offerte.versie} ({STATUS[offerte.status] ?? offerte.status})</> : null}
          </p>
        </div>
        <Link href={`/projecten/${p.id}/positie/nieuw`} className="rounded-md bg-[#B35B40] px-4 py-2 font-semibold text-white hover:brightness-110">+ Positie</Link>
      </div>

      <ol className="mt-6 flex overflow-x-auto rounded-lg border border-stone-200 bg-white p-3 text-xs" aria-label={`Fase van het project: ${faseLabel(p.fase)}`}>
        {FASEN.map((f, i) => (
          <li key={f.waarde} className={`flex-1 whitespace-nowrap px-2 text-center ${i < nu ? "text-green-700" : i === nu ? "font-bold text-[#9C4B32]" : "text-stone-400"}`}>
            <span className={`mx-auto mb-1 block h-2.5 w-2.5 rounded-full ${i < nu ? "bg-green-600" : i === nu ? "bg-[#B35B40] ring-4 ring-[#F4E3DC]" : "bg-stone-200"}`} />
            {f.label}
          </li>
        ))}
      </ol>

      <section className="mt-6 rounded-lg border border-stone-200 bg-white">
        <header className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Posities</h2>
          <span className="text-sm text-stone-600">{posities.length} {posities.length === 1 ? "positie" : "posities"}</span>
        </header>
        {posities.length === 0 ? (
          <p className="p-8 text-center text-stone-600">Nog geen posities. Voeg het eerste kozijn toe met &ldquo;+ Positie&rdquo;.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {posities.map((x) => {
              let omschrijving = "Onleesbare configuratie";
              try { omschrijving = positieOmschrijving(regels, leesConfiguratie(x.config)); } catch {}
              return (
                <li key={x.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <Tekening p={x} />
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="font-semibold">Pos. {x.nummer}{x.ruimte ? ` · ${x.ruimte}` : ""}</div>
                    <div className="text-sm text-stone-600">{omschrijving}</div>
                    <div className="mt-2 flex gap-3 text-sm">
                      <Link href={`/projecten/${p.id}/positie/${x.id}`} className="underline underline-offset-2">Bewerken</Link>
                      <details className="relative">
                        <summary className="cursor-pointer list-none text-stone-600 underline underline-offset-2">Verwijderen</summary>
                        <form action={verwijderPositie} className="absolute left-0 z-10 mt-2 w-56 rounded-lg border border-stone-200 bg-white p-3 shadow-lg">
                          <input type="hidden" name="project_id" value={p.id} />
                          <input type="hidden" name="positie_id" value={x.id} />
                          <p className="text-sm">Positie {x.nummer} verwijderen?</p>
                          <button className="mt-2 rounded-md bg-red-700 px-3 py-1 text-sm font-semibold text-white">Ja, verwijderen</button>
                        </form>
                      </details>
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="font-semibold">{euro(regelTotaal(Number(x.prijs), x.aantal))}</div>
                    {x.aantal > 1 && <div className="text-xs text-stone-500">{x.aantal} × {euro(Number(x.prijs))}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {posities.length > 0 && (
          <footer className="flex items-center justify-between border-t border-stone-200 bg-stone-50 px-5 py-3">
            <span className="text-sm text-stone-600">Totaal incl. btw</span>
            <span className="text-lg font-semibold tabular-nums">{euro(totaal)}</span>
          </footer>
        )}
      </section>
    </>
  );
}

export default function ProjectPagina(props: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/projecten" className="text-sm text-stone-600 underline">&larr; Alle projecten</Link>
      <Suspense fallback={<p className="mt-6 text-stone-500">Project laden…</p>}>
        <Inhoud {...props} />
      </Suspense>
    </main>
  );
}
