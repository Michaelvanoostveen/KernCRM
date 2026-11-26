import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { haalRol } from "../start-gegevens";
import { allesGelezen } from "./actions";

type Melding = { id: string; soort: string; tekst: string; project_id: string | null; aangemaakt: string; gelezen_op: string | null };

const tijd = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));
const KLEUR: Record<string, { label: string; kleur: string }> = {
  offerte_geopend: { label: "Offerte geopend", kleur: "bg-blue-100 text-blue-800" },
  offerte_akkoord: { label: "Offerte getekend", kleur: "bg-green-100 text-green-800" },
};

async function Inhoud() {
  const rol = await haalRol();
  if (rol !== "directie" && rol !== "kantoor" && rol !== "verkoop") redirect("/");
  const supabase = await maakServerClient();
  const { data } = await supabase.from("meldingen").select("id, soort, tekst, project_id, aangemaakt, gelezen_op").order("aangemaakt", { ascending: false }).limit(100);
  const meldingen = (data ?? []) as Melding[];
  const ongelezen = meldingen.filter((m) => !m.gelezen_op).length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Meldingen</h1>
          <p className="mt-1 text-sm text-stone-600">Je krijgt een melding als een klant een offerte van jou voor het eerst opent, en als hij hem ondertekent (dan ook directie en kantoor). Let op: sommige mailprogramma&apos;s openen de link zelf kort na het versturen om hem te controleren; zo&apos;n melding komt dan niet van de klant.</p>
        </div>
        {ongelezen > 0 && (
          <form action={allesGelezen}><button className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-stone-50">Alles als gelezen markeren</button></form>
        )}
      </div>
      {meldingen.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">Er zijn nog geen meldingen.</p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {meldingen.map((m) => (
            <li key={m.id}>
              <Link href={m.project_id ? `/projecten/${m.project_id}` : "/"} className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-4 py-3 text-sm hover:bg-stone-50 ${m.gelezen_op ? "border-stone-200 bg-white text-stone-600" : "border-blue-200 bg-blue-50 font-semibold text-stone-900"}`}>
                <span><span className={`mr-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${KLEUR[m.soort]?.kleur ?? "bg-stone-100 text-stone-700"}`}>{KLEUR[m.soort]?.label ?? m.soort}</span>{m.tekst}</span>
                <span className="text-xs font-normal text-stone-500">{tijd(m.aangemaakt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function MeldingenPagina() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Suspense fallback={<p className="text-stone-500">Laden…</p>}><Inhoud /></Suspense>
    </main>
  );
}
