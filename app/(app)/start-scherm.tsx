import Link from "next/link";
import { euroTekst } from "@/lib/offerte/bereken";
import { faseLabel } from "@/lib/projecten/fase";
import type { Activiteit, Actie, ActieSoort, Kolom, StartItem } from "@/lib/dashboard/start";

const eur0 = (n: number) => euroTekst(n, 0);
const tijd = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));

const LABEL_KLEUR: Record<ActieSoort, string> = {
  getekend: "bg-green-100 text-green-800",
  verlopen: "bg-red-100 text-red-800",
  verloopt: "bg-amber-100 text-amber-900",
  warm: "bg-blue-100 text-blue-800",
  ongeopend: "bg-stone-200 text-stone-700",
  stil: "bg-stone-200 text-stone-700",
  concept: "bg-stone-200 text-stone-700",
};
const STATUS: Record<string, { tekst: string; kleur: string }> = {
  concept: { tekst: "Concept", kleur: "bg-stone-200 text-stone-700" },
  verstuurd: { tekst: "Verstuurd", kleur: "bg-blue-100 text-blue-800" },
  akkoord: { tekst: "Getekend", kleur: "bg-green-100 text-green-800" },
  vervallen: { tekst: "Vervallen", kleur: "bg-stone-200 text-stone-700" },
};

export default function StartScherm({ begroeting, weergave, magAlle, acties, kolommen, activiteit, aantalProjecten }: {
  begroeting: string;
  weergave: "mijn" | "alle";
  magAlle: boolean;
  acties: Actie[];
  kolommen: Kolom[];
  activiteit: Activiteit[];
  aantalProjecten: number;
}) {
  const totaal = kolommen.reduce((s, k) => s + k.totaal, 0);
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{begroeting}</h1>
          <p className="mt-1 text-sm text-stone-600">Dit vraagt vandaag je aandacht.</p>
        </div>
        {magAlle && (
          <div role="group" aria-label="Weergave" className="flex overflow-hidden rounded-md border border-stone-300 text-sm font-semibold">
            <Link href="/?weergave=mijn" aria-current={weergave === "mijn" ? "page" : undefined} className={`px-3 py-1.5 ${weergave === "mijn" ? "bg-[#24332B] text-white" : "bg-white hover:bg-stone-50"}`}>Mijn projecten</Link>
            <Link href="/?weergave=alle" aria-current={weergave === "alle" ? "page" : undefined} className={`border-l border-stone-300 px-3 py-1.5 ${weergave === "alle" ? "bg-[#24332B] text-white" : "bg-white hover:bg-stone-50"}`}>Alle projecten</Link>
          </div>
        )}
      </div>

      <section className="mt-6 rounded-lg border border-stone-200 bg-white">
        <header className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Vraagt aandacht</h2>
          {acties.length > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">{acties.length} {acties.length === 1 ? "project" : "projecten"}</span>}
        </header>
        {acties.length === 0 ? (
          <p className="px-5 py-8 text-center text-stone-600">{aantalProjecten === 0 ? "Nog geen projecten. Maak er een aan bij een klant." : "Niets dat nu aandacht vraagt. Alle offertes lopen goed."}</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {acties.map((a) => (
              <li key={a.projectId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <div className="min-w-0 flex-1 basis-64">
                  <div className="font-semibold">{a.klantNaam || a.naam}</div>
                  <div className="text-sm text-stone-600">{a.reden}</div>
                  <div className="text-xs text-stone-500">{a.nummer} · {a.naam}</div>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${LABEL_KLEUR[a.soort]}`}>{a.label}</span>
                <span className="w-24 text-right font-semibold tabular-nums">{eur0(a.bedrag)}</span>
                <Link href={`/projecten/${a.projectId}`} className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-stone-50">Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-stone-200 bg-white">
        <header className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{weergave === "mijn" ? "Mijn pijplijn" : "Pijplijn"}</h2>
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">Totaal {eur0(totaal)}</span>
        </header>
        <div className="overflow-x-auto p-4">
          <div className="grid min-w-max auto-cols-[minmax(13rem,1fr)] grid-flow-col gap-3">
            {kolommen.map((k) => (
              <div key={k.fase}>
                <div className="mb-2 flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <span>{faseLabel(k.fase)}</span><span className="tabular-nums">{k.items.length}</span>
                </div>
                {k.totaal > 0 && <div className="mb-2 text-xs text-stone-500 tabular-nums">{eur0(k.totaal)}</div>}
                {k.items.length === 0 && <div className="rounded-md border border-dashed border-stone-200 px-3 py-4 text-center text-xs text-stone-400">Leeg</div>}
                {k.items.map((i: StartItem) => (
                  <Link key={i.projectId} href={`/projecten/${i.projectId}`} className="mb-2 block rounded-md border border-stone-200 bg-[#F8F5F0] p-3 text-sm hover:border-stone-400">
                    <div className="font-semibold">{i.klantNaam || i.naam}</div>
                    <div className="truncate text-xs text-stone-600">{i.naam}</div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[i.status]?.kleur}`}>{STATUS[i.status]?.tekst}{i.versie > 1 ? ` v${i.versie}` : ""}</span>
                      <span className="font-mono text-xs tabular-nums">{eur0(i.totaal)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-stone-200 bg-white">
        <header className="border-b border-stone-200 px-5 py-3"><h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Onlangs</h2></header>
        {activiteit.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-stone-600">De afgelopen week is er nog niets gebeurd met je offertes.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {activiteit.map((a) => (
              <li key={`${a.offerteSleutel}-${a.soort}-${a.op}`} className="flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-2.5 text-sm">
                <span>
                  <Link href={`/projecten/${a.projectId}`} className="font-semibold underline-offset-2 hover:underline">{a.klantNaam || a.naam}</Link>{" "}
                  {a.soort === "akkoord" && <span className="text-green-700">heeft de offerte getekend</span>}
                  {a.soort === "geopend" && <span className="text-stone-600">heeft de offerte {a.aantal}× bekeken</span>}
                  {a.soort === "verstuurd" && <span className="text-stone-600">kreeg de offerte toegestuurd</span>}
                </span>
                <time className="text-xs text-stone-500" dateTime={a.op}>{tijd(a.op)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
