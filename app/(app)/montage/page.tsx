import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { montageOpDag, plusDagen, vandaagIso, weekNummer, weekStart, werkweek, type PlanbordMontage } from "@/lib/montage/week";
import { haalRol } from "../start-gegevens";
import PloegenBeheer from "./ploegen-beheer";

type Ploeg = { id: string; naam: string; actief: boolean };
type Rij = PlanbordMontage & { projectId: string; projectNaam: string; klantNaam: string; leverdatum: string | null; hulpmiddel: string };
type MontageRij = { id: string; ploeg_id: string; start_datum: string; eind_datum: string; status: string; leverdatum: string | null; hulpmiddel: string; project_id: string; projecten: { naam: string; klanten: { naam: string } | null } | null };
type TePlannen = { id: string; nummer: string; naam: string; klanten: { naam: string } | null };

const MELDINGEN: Record<string, { tekst: string; fout: boolean }> = {
  toegevoegd: { tekst: "De ploeg is toegevoegd.", fout: false },
  bijgewerkt: { tekst: "De ploeg is bijgewerkt.", fout: false },
  naam: { tekst: "Vul een naam in voor de ploeg.", fout: true },
  bestaat: { tekst: "Er bestaat al een ploeg met die naam.", fout: true },
  rechten: { tekst: "Alleen directie en kantoor beheren de ploegen.", fout: true },
  monteur_toegevoegd: { tekst: "De monteur is toegevoegd.", fout: false },
  gekoppeld: { tekst: "Het inlogaccount is bijgewerkt.", fout: false },
  opstelling_geladen: { tekst: "De startopstelling is geladen. Pas namen en samenstelling aan waar nodig.", fout: false },
  niet_toegestaan: { tekst: "Dat kan niet: een ploeg met lopende montages gaat niet uit dienst en een account moet de rol monteur hebben.", fout: true },
  monteur_verwijderd: { tekst: "De monteur is verwijderd.", fout: false },
  ploeg_verwijderd: { tekst: "De ploeg is verwijderd. De monteurs uit die ploeg staan nu zonder ploeg.", fout: false },
  monteur_in_gebruik: { tekst: "Deze monteur staat op een werkbon en kan niet worden verwijderd. Zet hem uit dienst.", fout: true },
  ploeg_in_gebruik: { tekst: "Deze ploeg heeft montages in de planning of de historie en kan niet worden verwijderd. Zet haar uit dienst.", fout: true },
  mislukt: { tekst: "Het lukte niet. Probeer het opnieuw.", fout: true },
};
const KLEUR: Record<string, string> = {
  voorlopig: "border-amber-300 bg-amber-50 text-amber-900",
  definitief: "border-blue-300 bg-blue-50 text-blue-900",
  bezig: "border-green-300 bg-green-50 text-green-900",
  afgerond: "border-stone-300 bg-stone-100 text-stone-600",
};
const korteDatum = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" }).format(new Date(`${iso}T12:00:00Z`));
const DAGNAAM = ["ma", "di", "wo", "do", "vr"];

async function Inhoud({ zoek }: { zoek: Promise<{ week?: string; ploeg?: string }> }) {
  const { week, ploeg: meldingCode } = await zoek;
  const rol = await haalRol();
  if (rol !== "directie" && rol !== "kantoor" && rol !== "verkoop") redirect("/");
  const mag = rol === "directie" || rol === "kantoor";
  const vandaag = vandaagIso(new Date());
  const maandag = weekStart(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : vandaag);
  const dagen = werkweek(maandag);

  const supabase = await maakServerClient();
  const [{ data: pData }, { data: mData }, { data: tData }] = await Promise.all([
    supabase.from("montageploegen").select("id, naam, actief").order("naam"),
    supabase.from("montages").select("id, ploeg_id, start_datum, eind_datum, status, leverdatum, hulpmiddel, project_id, projecten(naam, klanten(naam))").neq("status", "geannuleerd").lte("start_datum", dagen[4]).gte("eind_datum", dagen[0]),
    // Projecten waarvan de inmeting klaar is en die nog geen lopende of afgeronde montage hebben.
    supabase.from("projecten").select("id, nummer, naam, klanten(naam), offertes(id, status), montages(status)").eq("fase", "inmeting").limit(100),
  ]);
  const ploegen = (pData ?? []) as Ploeg[];
  const rijen: Rij[] = ((mData ?? []) as unknown as MontageRij[]).map((m) => ({
    id: m.id, ploegId: m.ploeg_id, startDatum: m.start_datum, eindDatum: m.eind_datum, status: m.status, projectId: m.project_id,
    projectNaam: m.projecten?.naam ?? "", klantNaam: m.projecten?.klanten?.naam ?? "", leverdatum: m.leverdatum, hulpmiddel: m.hulpmiddel,
  }));
  const tePlannen = ((tData ?? []) as unknown as (TePlannen & { montages: { status: string }[]; offertes: { status: string }[] })[])
    .filter((p) => p.offertes.some((o) => o.status === "akkoord") && !p.montages.some((m) => ["voorlopig", "definitief", "bezig"].includes(m.status)));
  const melding = meldingCode ? MELDINGEN[meldingCode] : null;
  const zichtbarePloegen = ploegen.filter((p) => p.actief || rijen.some((r) => r.ploegId === p.id));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Montage</h1>
          <p className="mt-1 text-sm text-stone-600">Planbord per week. Een montage plan je op de projectpagina, nadat de inmeting is afgerond.</p>
        </div>
        <nav aria-label="Week" className="flex items-center gap-2">
          <Link href={`/montage?week=${plusDagen(maandag, -7)}`} className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-stone-50">← Vorige</Link>
          <Link href="/montage" className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-stone-50">Deze week</Link>
          <Link href={`/montage?week=${plusDagen(maandag, 7)}`} className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-stone-50">Volgende →</Link>
        </nav>
      </div>
      {melding && <p role={melding.fout ? "alert" : "status"} className={`mt-4 rounded-md px-4 py-2.5 text-sm ${melding.fout ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>{melding.tekst}</p>}

      <h2 className="mt-6 text-lg font-semibold">Week {weekNummer(maandag)} <span className="text-sm font-normal text-stone-500">· {korteDatum(dagen[0])} t/m {korteDatum(dagen[4])}</span></h2>
      <div className="mt-2 overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full min-w-[44rem] table-fixed border-collapse text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="w-32 border-b border-stone-200 px-3 py-2 text-left font-semibold">Ploeg</th>
              {dagen.map((d, i) => <th key={d} className={`border-b border-l border-stone-200 px-2 py-2 text-left font-semibold ${d === vandaag ? "bg-[#F4E3DC] text-[#9C4B32]" : ""}`}>{DAGNAAM[i]} {korteDatum(d)}</th>)}
            </tr>
          </thead>
          <tbody>
            {zichtbarePloegen.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-stone-500">Er zijn nog geen montageploegen. {mag ? "Voeg hieronder een ploeg toe." : ""}</td></tr>}
            {zichtbarePloegen.map((p) => (
              <tr key={p.id} className="align-top">
                <th className="border-b border-stone-200 px-3 py-2 text-left font-semibold">{p.naam}{!p.actief && <div className="text-xs font-normal text-stone-500">niet meer in dienst</div>}</th>
                {dagen.map((d) => {
                  const hier = rijen.filter((r) => r.ploegId === p.id && montageOpDag(r, d));
                  return (
                    <td key={d} className={`h-16 border-b border-l border-stone-200 p-1 ${d === vandaag ? "bg-[#fbf3ef]" : ""}`}>
                      {hier.map((r) => (
                        <Link key={r.id} href={`/projecten/${r.projectId}#montage`} className={`block rounded border px-1.5 py-1 text-xs leading-tight hover:brightness-95 ${KLEUR[r.status] ?? ""}`}>
                          <b className="block truncate">{r.klantNaam}</b>
                          <span className="block truncate">{r.projectNaam}</span>
                          {r.status === "voorlopig" ? <span className="block">voorlopig</span> : r.startDatum === d && r.leverdatum ? <span className="block">levering {korteDatum(r.leverdatum)}</span> : null}
                          {r.hulpmiddel !== "geen" && r.startDatum === d ? <span className="block">{r.hulpmiddel}</span> : null}
                        </Link>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-stone-500">
        <span className="mr-3 rounded border border-amber-300 bg-amber-50 px-1.5">voorlopig</span><span className="mr-3 rounded border border-blue-300 bg-blue-50 px-1.5">definitief</span><span className="mr-3 rounded border border-green-300 bg-green-50 px-1.5">bezig</span><span className="rounded border border-stone-300 bg-stone-100 px-1.5">afgerond</span>
        {" "}Werkdagen zijn maandag tot en met vrijdag.
      </p>

      <section className="mt-8" aria-label="Te plannen">
        <h2 className="text-lg font-semibold">Nog te plannen</h2>
        {tePlannen.length === 0 ? <p className="mt-2 text-sm text-stone-500">Alle ingemeten projecten zijn ingepland.</p> : (
          <ul className="mt-2 grid gap-2">
            {tePlannen.map((p) => (
              <li key={p.id}><Link href={`/projecten/${p.id}#montage`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-stone-200 bg-white px-4 py-2.5 text-sm hover:bg-stone-50"><span><b>{p.klanten?.naam}</b> · {p.naam}</span><span className="text-stone-500">{p.nummer}</span></Link></li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-stone-500">Alleen projecten waarvan de inmeting is afgerond kunnen worden ingepland; de projectpagina laat dat zien.</p>
      </section>

      {mag && <PloegenBeheer />}
    </>
  );
}

export default function MontagePagina(props: { searchParams: Promise<{ week?: string; ploeg?: string }> }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Suspense fallback={<p className="text-stone-500">Planbord laden…</p>}><Inhoud zoek={props.searchParams} /></Suspense>
    </main>
  );
}
