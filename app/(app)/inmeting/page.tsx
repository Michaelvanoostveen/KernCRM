import Link from "next/link";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { leesOverzicht } from "@/lib/inmeting/types";

const dagTijd = (iso: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));

async function Lijst() {
  const supabase = await maakServerClient();
  const { data, error } = await supabase.rpc("inmeting_overzicht");
  const rijen = leesOverzicht(data);
  if (error) return <p role="alert" className="mt-6 text-red-700">De inmetingen konden niet worden geladen.</p>;
  const gepland = rijen.filter((r) => r.status === "gepland");
  const klaar = rijen.filter((r) => r.status === "uitgevoerd").sort((a, b) => b.gepland_op.localeCompare(a.gepland_op)).slice(0, 10);

  const kaart = (r: (typeof rijen)[number]) => (
    <li key={r.id}>
      <Link href={`/inmeting/${r.id}`} className="block rounded-lg border border-stone-200 bg-white p-4 hover:border-stone-400">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <b className="text-base">{dagTijd(r.gepland_op)}</b>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.status === "uitgevoerd" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>{r.status === "uitgevoerd" ? "Afgerond" : "Gepland"}</span>
        </div>
        <div className="mt-1 font-semibold">{r.klant_naam}</div>
        <div className="text-sm text-stone-600">{r.adres ?? r.project_naam}{r.plaats ? `, ${r.plaats}` : ""}</div>
        <div className="mt-2 text-xs text-stone-500">{r.ingevuld} van {r.aantal_posities} posities ingemeten · {r.project_nummer}</div>
      </Link>
    </li>
  );

  return (
    <>
      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-stone-500">Gepland</h2>
      {gepland.length === 0 ? <p className="rounded-lg border border-dashed border-stone-300 bg-white p-6 text-center text-stone-600">Er staan geen inmetingen gepland.</p> : <ul className="grid gap-3 sm:grid-cols-2">{gepland.map(kaart)}</ul>}
      {klaar.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-stone-500">Recent afgerond</h2>
          <ul className="grid gap-3 sm:grid-cols-2">{klaar.map(kaart)}</ul>
        </>
      )}
    </>
  );
}

export default function Inmetingen() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Inmetingen</h1>
      <p className="mt-1 text-sm text-stone-600">Je ziet hier alleen de inmetingen waar jij voor staat ingepland. Medewerkers die plannen zien ze allemaal.</p>
      <Suspense fallback={<p className="mt-6 text-stone-500">Inmetingen laden…</p>}><Lijst /></Suspense>
    </main>
  );
}
