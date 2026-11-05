import Link from "next/link";
import { maakServerClient } from "@/lib/supabase/server";
import { euroTekst } from "@/lib/offerte/bereken";
import { isTeLaat, type FactuurStatus } from "@/lib/facturatie/bereken";
import { dagenTeLaat } from "@/lib/facturatie/mail";

type Rij = { id: string; nummer: string; totaal_incl: number | string; vervaldatum: string; status: FactuurStatus; verzonden_op: string | null; debiteur: { naam?: string } | null; projecten: { id: string; naam: string } | null };

/** Facturen die aandacht vragen: te laat betaald, of nog niet naar de klant gestuurd. Alleen voor directie en kantoor. */
export default async function FacturenActies({ rol }: { rol: string | null }) {
  if (rol !== "directie" && rol !== "kantoor") return null;
  const supabase = await maakServerClient();
  const { data } = await supabase.from("facturen").select("id, nummer, totaal_incl, vervaldatum, status, verzonden_op, debiteur, projecten(id, naam)").eq("status", "open").order("vervaldatum").limit(200);
  const rijen = (data ?? []) as unknown as Rij[];
  const vandaag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date());
  const teLaat = rijen.filter((r) => isTeLaat(r.status, r.vervaldatum, vandaag));
  const onverzonden = rijen.filter((r) => !r.verzonden_op);
  if (teLaat.length === 0 && onverzonden.length === 0) return null;

  const rij = (r: Rij, tekst: string, kleur: string) => (
    <li key={`${tekst}-${r.id}`}>
      <Link href={`/projecten/${r.projecten?.id ?? ""}#facturen`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-stone-200 bg-white px-4 py-2.5 text-sm hover:bg-stone-50">
        <span><span className={`mr-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${kleur}`}>{tekst}</span><b>{r.debiteur?.naam ?? ""}</b> · <span className="font-mono">{r.nummer}</span> · {r.projecten?.naam}</span>
        <span className="tabular-nums">{euroTekst(Number(r.totaal_incl))}</span>
      </Link>
    </li>
  );

  return (
    <section aria-label="Facturen die aandacht vragen" className="mx-auto max-w-6xl px-4 pt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Facturen</h2>
        <Link href="/facturen" className="text-sm underline">Alle facturen</Link>
      </div>
      <ul className="mt-2 grid gap-2">
        {teLaat.slice(0, 5).map((r) => rij(r, `${dagenTeLaat(r.vervaldatum, vandaag)} d te laat`, "bg-red-100 text-red-800"))}
        {onverzonden.filter((r) => !teLaat.some((t) => t.id === r.id)).slice(0, 5).map((r) => rij(r, "Niet verzonden", "bg-amber-100 text-amber-900"))}
      </ul>
    </section>
  );
}
