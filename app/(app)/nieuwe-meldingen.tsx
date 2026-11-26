import Link from "next/link";
import { maakServerClient } from "@/lib/supabase/server";

type Melding = { id: string; soort: string; tekst: string; project_id: string | null; aangemaakt: string };
const tijd = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));

/** De ongelezen meldingen bovenaan het startscherm (de klant heeft een offerte geopend of getekend). */
export default async function NieuweMeldingen({ rol }: { rol: string | null }) {
  if (rol !== "directie" && rol !== "kantoor" && rol !== "verkoop") return null;
  const supabase = await maakServerClient();
  const { data } = await supabase.from("meldingen").select("id, soort, tekst, project_id, aangemaakt").is("gelezen_op", null).order("aangemaakt", { ascending: false }).limit(5);
  const lijst = (data ?? []) as Melding[];
  if (lijst.length === 0) return null;
  return (
    <section aria-label="Nieuwe meldingen" className="mx-auto max-w-6xl px-4 pt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Nieuw</h2>
        <Link href="/meldingen" className="text-sm underline">Alle meldingen</Link>
      </div>
      <ul className="mt-2 grid gap-2">
        {lijst.map((m) => (
          <li key={m.id}>
            <Link href={m.project_id ? `/projecten/${m.project_id}` : "/meldingen"} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm hover:bg-blue-100">
              <span><span className={`mr-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${m.soort === "offerte_akkoord" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>{m.soort === "offerte_akkoord" ? "Getekend" : "Geopend"}</span>{m.tekst}</span>
              <span className="text-xs text-stone-500">{tijd(m.aangemaakt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
