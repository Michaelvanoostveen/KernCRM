import Link from "next/link";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { importeerCatalogus } from "../actions";

async function Inhoud({ zoek }: { zoek: Promise<{ fout?: string; geimporteerd?: string }> }) {
  const { fout, geimporteerd } = await zoek;
  const supabase = await maakServerClient();
  const { data, error } = await supabase.from("artikelen").select("groep, actief").order("groep").limit(1000);
  if (error) return <p role="alert" className="mt-6 text-red-700">De catalogus kon niet worden geladen.</p>;

  const groepen = new Map<string, { totaal: number; actief: number }>();
  for (const a of data ?? []) {
    const g = groepen.get(a.groep as string) ?? { totaal: 0, actief: 0 };
    g.totaal += 1;
    if (a.actief) g.actief += 1;
    groepen.set(a.groep as string, g);
  }
  const totaal = data?.length ?? 0;
  const actief = (data ?? []).filter((a) => a.actief).length;

  return (
    <>
      {geimporteerd && <p role="status" className="mt-4 rounded-md bg-green-50 px-4 py-2.5 text-sm text-green-800">De catalogus is geladen.</p>}
      {fout === "rechten" && <p role="alert" className="mt-4 rounded-md bg-red-50 px-4 py-2.5 text-sm text-red-800">Alleen de directie kan de catalogus laden.</p>}
      {fout === "import" && <p role="alert" className="mt-4 rounded-md bg-red-50 px-4 py-2.5 text-sm text-red-800">Het laden is niet gelukt. Probeer het opnieuw of meld het aan de beheerder.</p>}

      {totaal === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-stone-300 bg-white p-8">
          <p className="font-semibold">De catalogus is nog leeg.</p>
          <p className="mt-1 max-w-xl text-sm text-stone-600">Laad de standaardcatalogus van KernKozijnen: 97 artikelen uit Teamleader met vaste verkoopprijzen. Artikelen die de configurator al dekt (kozijnen, glas, kleur, beslag) en rolluiken en horren staan uit. Alleen de directie kan dit.</p>
          <form action={importeerCatalogus}><button className="mt-4 rounded-md bg-[#B35B40] px-4 py-2 font-semibold text-white hover:brightness-110">Standaardcatalogus laden</button></form>
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-stone-600">{totaal} artikelen, waarvan {actief} actief. Actieve artikelen kun je op een offerte zetten.</p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                <tr><th className="px-4 py-3 font-semibold">Groep</th><th className="px-4 py-3 text-right font-semibold">Artikelen</th><th className="px-4 py-3 text-right font-semibold">Actief</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {[...groepen.entries()].map(([naam, g]) => (
                  <tr key={naam}><td className="px-4 py-2.5">{naam}</td><td className="px-4 py-2.5 text-right tabular-nums">{g.totaal}</td><td className={`px-4 py-2.5 text-right tabular-nums ${g.actief === 0 ? "text-stone-400" : ""}`}>{g.actief}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

export default function Catalogus(props: { searchParams: Promise<{ fout?: string; geimporteerd?: string }> }) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/klanten" className="text-sm text-stone-600 underline">&larr; Terug</Link>
      <h1 className="mt-3 text-2xl font-semibold">Catalogus</h1>
      <p className="mt-1 text-sm text-stone-600">Artikelen met vaste prijzen voor op de offerte.</p>
      <Suspense fallback={<p className="mt-6 text-stone-500">Catalogus laden…</p>}>
        <Inhoud zoek={props.searchParams} />
      </Suspense>
    </main>
  );
}
