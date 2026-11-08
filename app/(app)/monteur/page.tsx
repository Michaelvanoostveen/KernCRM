import Link from "next/link";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { dagLabel, leesMonteurOverzicht } from "@/lib/montage/monteur";
import { vandaagIso } from "@/lib/montage/week";

const STATUS: Record<string, { label: string; kleur: string }> = {
  definitief: { label: "Gepland", kleur: "bg-blue-100 text-blue-800" },
  bezig: { label: "Bezig", kleur: "bg-green-100 text-green-800" },
  afgerond: { label: "Afgerond", kleur: "bg-stone-200 text-stone-700" },
};
const HULP: Record<string, string> = { steiger: "Steiger", hoogwerker: "Hoogwerker", beide: "Steiger en hoogwerker" };

async function Inhoud() {
  const supabase = await maakServerClient();
  const { data } = await supabase.rpc("monteur_overzicht");
  const rijen = leesMonteurOverzicht(data);
  const vandaag = vandaagIso(new Date());
  const komend = rijen.filter((r) => r.status !== "afgerond");
  const klaar = rijen.filter((r) => r.status === "afgerond");

  return (
    <>
      <h1 className="text-2xl font-semibold">Mijn montages</h1>
      <p className="mt-1 text-sm text-stone-600">De montages van jouw ploeg.</p>

      {rijen.length === 0 && (
        <p className="mt-6 rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">
          Er staan geen montages voor je klaar. Kantoor plant ze in; zodra de leverdatum bekend is, zie je ze hier. Zie je ook nu niets terwijl je een montage verwacht? Vraag kantoor of je account aan jouw naam en ploeg is gekoppeld.
        </p>
      )}

      <ul className="mt-5 grid gap-3">
        {komend.map((r) => (
          <li key={r.id}>
            <Link href={`/monteur/${r.id}`} className="block rounded-xl border border-stone-200 bg-white p-4 hover:bg-stone-50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-lg font-bold">{dagLabel(r.start_datum, vandaag)}{r.eind_datum !== r.start_datum ? ` t/m ${dagLabel(r.eind_datum, vandaag).toLowerCase()}` : ""}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[r.status]?.kleur ?? ""}`}>{STATUS[r.status]?.label ?? r.status}</span>
              </div>
              <div className="mt-1 font-semibold">{r.klant_naam}</div>
              <div className="text-sm text-stone-700">{[r.adres, r.plaats].filter(Boolean).join(", ")}</div>
              <div className="mt-1 text-xs text-stone-500">{r.project_nummer} · {r.ploeg}{HULP[r.hulpmiddel] ? ` · ${HULP[r.hulpmiddel]}` : ""}</div>
            </Link>
          </li>
        ))}
      </ul>

      {klaar.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-stone-500">Recent afgerond</h2>
          <ul className="mt-2 grid gap-2">
            {klaar.map((r) => (
              <li key={r.id}><Link href={`/monteur/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm hover:bg-stone-50"><span><b>{r.klant_naam}</b> · {r.plaats}</span><span className="text-stone-500">{r.project_nummer}</span></Link></li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export default function MonteurPagina() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Suspense fallback={<p className="text-stone-500">Montages laden…</p>}><Inhoud /></Suspense>
    </main>
  );
}
