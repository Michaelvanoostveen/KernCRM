import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { filterWerkbonnen, isWerkbonFilter, WERKBON_FILTERS, type WerkbonRij } from "@/lib/montage/werkbonnen";
import { haalRol } from "../start-gegevens";

type Rij = {
  id: string; status: "open" | "opgeleverd"; kantoor_actie: boolean; kantoor_gezien_op: string | null; opgeleverd_op: string | null; aangemaakt: string;
  montages: { id: string; start_datum: string; eind_datum: string; project_id: string; projecten: { nummer: string; naam: string; klanten: { naam: string } | null } | null; montageploegen: { naam: string } | null } | null;
};

const datum = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(iso.length > 10 ? iso : `${iso}T12:00:00Z`));

async function Inhoud({ zoek }: { zoek: Promise<{ filter?: string }> }) {
  const { filter: gekozen } = await zoek;
  const rol = await haalRol();
  if (rol !== "directie" && rol !== "kantoor" && rol !== "verkoop") redirect("/");
  const mag = rol === "directie" || rol === "kantoor";
  const filter = isWerkbonFilter(gekozen) ? gekozen : "lopend";

  const supabase = await maakServerClient();
  const { data } = await supabase.from("werkbonnen")
    .select("id, status, kantoor_actie, kantoor_gezien_op, opgeleverd_op, aangemaakt, montages(id, start_datum, eind_datum, project_id, projecten(nummer, naam, klanten(naam)), montageploegen(naam))")
    .order("aangemaakt", { ascending: false }).limit(500);
  const rijen = (data ?? []) as unknown as Rij[];
  const ids = rijen.map((r) => r.id);
  const [{ data: pData }, { data: uData }] = ids.length
    ? await Promise.all([
        supabase.from("opleverpunten").select("werkbon_id").eq("status", "open").in("werkbon_id", ids),
        supabase.from("werkbon_uren").select("werkbon_id, uren").in("werkbon_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const punten = new Map<string, number>();
  for (const p of (pData ?? []) as { werkbon_id: string }[]) punten.set(p.werkbon_id, (punten.get(p.werkbon_id) ?? 0) + 1);
  const uren = new Map<string, number>();
  for (const u of (uData ?? []) as { werkbon_id: string; uren: number | string }[]) uren.set(u.werkbon_id, (uren.get(u.werkbon_id) ?? 0) + Number(u.uren));

  const alle: (WerkbonRij & { montageId: string; projectId: string; nummer: string; project: string; klant: string; ploeg: string; start: string; eind: string; opgeleverdOp: string | null })[] = rijen.filter((r) => r.montages).map((r) => ({
    id: r.id, status: r.status, aandacht: r.kantoor_actie && !r.kantoor_gezien_op, openPunten: punten.get(r.id) ?? 0, uren: Math.round((uren.get(r.id) ?? 0) * 100) / 100,
    montageId: r.montages!.id, projectId: r.montages!.project_id, nummer: r.montages!.projecten?.nummer ?? "", project: r.montages!.projecten?.naam ?? "", klant: r.montages!.projecten?.klanten?.naam ?? "",
    ploeg: r.montages!.montageploegen?.naam ?? "", start: r.montages!.start_datum, eind: r.montages!.eind_datum, opgeleverdOp: r.opgeleverd_op,
  }));
  const zichtbaar = filterWerkbonnen(alle, filter);

  return (
    <>
      <h1 className="text-2xl font-semibold">Werkbonnen</h1>
      <p className="mt-1 text-sm text-stone-600">De werkbonnen van de montages: wat de monteurs hebben ingevuld, opleverpunten en uren. Een werkbon ontstaat zodra de monteur de montage start.</p>
      <nav aria-label="Filter" className="mt-4 flex flex-wrap gap-2">
        {WERKBON_FILTERS.map((f) => {
          const n = filterWerkbonnen(alle, f.sleutel).length;
          return (
            <Link key={f.sleutel} href={`/werkbonnen?filter=${f.sleutel}`} aria-current={f.sleutel === filter ? "page" : undefined}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${f.sleutel === filter ? "border-[#24332B] bg-[#24332B] text-white" : "border-stone-300 bg-white hover:bg-stone-50"}`}>{f.label} ({n})</Link>
          );
        })}
      </nav>
      {zichtbaar.length === 0 ? (
        <p className="mt-6 text-sm text-stone-500">Geen werkbonnen in deze weergave.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr><th className="px-3 py-2">Project</th><th className="px-3 py-2">Ploeg</th><th className="px-3 py-2">Montage</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Opleverpunten</th><th className="px-3 py-2">Uren</th>{mag && <th className="px-3 py-2">PDF</th>}</tr>
            </thead>
            <tbody>
              {zichtbaar.map((w) => (
                <tr key={w.id} className="border-t border-stone-100 align-top">
                  <td className="px-3 py-2"><Link href={`/projecten/${w.projectId}`} className="font-semibold underline">{w.nummer} {w.project}</Link><div className="text-stone-600">{w.klant}</div></td>
                  <td className="px-3 py-2">{w.ploeg}</td>
                  <td className="px-3 py-2">{datum(w.start)} t/m {datum(w.eind)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${w.status === "opgeleverd" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-900"}`}>{w.status === "opgeleverd" ? "Opgeleverd" : "Wordt ingevuld"}</span>
                    {w.aandacht && <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">Kantoor: reageren</span>}
                    {w.opgeleverdOp && <div className="mt-1 text-xs text-stone-500">op {datum(w.opgeleverdOp)}</div>}
                  </td>
                  <td className="px-3 py-2">{w.openPunten > 0 ? <b className="text-red-700">{w.openPunten} open</b> : <span className="text-stone-500">geen</span>}</td>
                  <td className="px-3 py-2">{w.uren > 0 ? `${w.uren.toLocaleString("nl-NL")} u` : "–"}</td>
                  {mag && <td className="px-3 py-2"><a href={`/montage/${w.montageId}/pdf`} target="_blank" rel="noreferrer" className="underline">Werkbon</a></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function WerkbonnenPagina(props: { searchParams: Promise<{ filter?: string }> }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Suspense fallback={<p className="text-stone-500">Werkbonnen laden…</p>}><Inhoud zoek={props.searchParams} /></Suspense>
    </main>
  );
}
