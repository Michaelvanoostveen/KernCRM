import Link from "next/link";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { faseLabel } from "@/lib/projecten/fase";
import { euro, regelTotaal } from "@/lib/projecten/positie";

type Rij = { id: string; nummer: string; naam: string; fase: string; aangemaakt: string; klanten: { id: string; naam: string } | null; posities: { prijs: number; aantal: number }[] };

async function Lijst() {
  const supabase = await maakServerClient();
  const { data, error } = await supabase
    .from("projecten")
    .select("id, nummer, naam, fase, aangemaakt, klanten(id, naam), posities(prijs, aantal)")
    .order("aangemaakt", { ascending: false })
    .limit(200);
  const projecten = (data ?? []) as unknown as Rij[];

  if (error) return <p role="alert" className="mt-6 text-red-700">De projecten konden niet worden geladen.</p>;
  if (projecten.length === 0) {
    return (
      <p className="mt-6 rounded-lg border border-dashed border-stone-300 p-8 text-center text-stone-600">
        Nog geen projecten. Open een klant en kies &ldquo;Nieuw project&rdquo;.
      </p>
    );
  }
  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <table className="w-full min-w-max text-left text-sm">
        <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
          <tr>
            <th className="px-4 py-3 font-semibold">Nummer</th>
            <th className="px-4 py-3 font-semibold">Project</th>
            <th className="px-4 py-3 font-semibold">Klant</th>
            <th className="px-4 py-3 font-semibold">Fase</th>
            <th className="px-4 py-3 text-right font-semibold">Posities</th>
            <th className="px-4 py-3 text-right font-semibold">Totaal incl. btw</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {projecten.map((p) => (
            <tr key={p.id} className="hover:bg-stone-50">
              <td className="px-4 py-3 font-mono text-xs text-stone-600">{p.nummer}</td>
              <td className="px-4 py-3 font-semibold"><Link href={`/projecten/${p.id}`} className="underline-offset-2 hover:underline">{p.naam}</Link></td>
              <td className="px-4 py-3 text-stone-700">{p.klanten ? <Link href={`/klanten/${p.klanten.id}`} className="hover:underline">{p.klanten.naam}</Link> : "—"}</td>
              <td className="px-4 py-3"><span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-700">{faseLabel(p.fase)}</span></td>
              <td className="px-4 py-3 text-right tabular-nums">{p.posities.reduce((n, x) => n + x.aantal, 0)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{euro(p.posities.reduce((som, x) => som + regelTotaal(Number(x.prijs), x.aantal), 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Projecten() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Projecten</h1>
      <Suspense fallback={<p className="mt-8 text-stone-500">Projecten laden…</p>}>
        <Lijst />
      </Suspense>
    </main>
  );
}
