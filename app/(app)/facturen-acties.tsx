import Link from "next/link";
import { maakServerClient } from "@/lib/supabase/server";
import { euroTekst } from "@/lib/offerte/bereken";
import { isTeLaat, type FactuurStatus } from "@/lib/facturatie/bereken";
import { dagenTeLaat } from "@/lib/facturatie/mail";
import { factuurActies } from "@/lib/montage/factuurhint";
import { BEZORG_LABEL, besteGebeurtenis, IS_PROBLEEM, type BezorgEvent } from "@/lib/mail/bezorging";

type Rij = { id: string; nummer: string; totaal_incl: number | string; gecrediteerd: number | string; vervaldatum: string; status: FactuurStatus; verzonden_op: string | null; debiteur: { naam?: string } | null; projecten: { id: string; naam: string } | null };

/** Facturen die aandacht vragen: te laat betaald, of nog niet naar de klant gestuurd. Alleen voor directie en kantoor. */
export default async function FacturenActies({ rol }: { rol: string | null }) {
  if (rol !== "directie" && rol !== "kantoor") return null;
  const supabase = await maakServerClient();
  const { data } = await supabase.from("facturen").select("id, nummer, totaal_incl, gecrediteerd, vervaldatum, status, verzonden_op, debiteur, projecten(id, naam)").eq("status", "open").order("vervaldatum").limit(200);
  const rijen = (data ?? []) as unknown as Rij[];
  const vandaag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date());
  // Facturen die op grond van de montage klaar horen te staan (de 65% op de eerste montagedag, de eindfactuur na afronden).
  const [{ data: mData }, { data: fData }] = await Promise.all([
    supabase.from("montages").select("project_id, status, start_datum, eind_datum, projecten(naam, klanten(naam))").in("status", ["definitief", "bezig", "afgerond"]).limit(200),
    supabase.from("facturen").select("project_id, termijn, status").limit(1000),
  ]);
  const montages = (mData ?? []) as unknown as { project_id: string; status: string; start_datum: string; eind_datum: string; projecten: { naam: string; klanten: { naam: string } | null } | null }[];
  const hints = factuurActies(
    montages.map((m) => ({ projectId: m.project_id, status: m.status, startDatum: m.start_datum, eindDatum: m.eind_datum })),
    ((fData ?? []) as { project_id: string; termijn: number; status: string }[]).map((f) => ({ projectId: f.project_id, termijn: f.termijn, status: f.status })),
    vandaag,
  );
  // Meldingen van monteurs: "kantoor moet reageren" en openstaande opleverpunten.
  const [{ data: wData }, { data: pData }] = await Promise.all([
    supabase.from("werkbonnen").select("id, bijzonderheden, montages(project_id, projecten(naam, klanten(naam)))").eq("kantoor_actie", true).is("kantoor_gezien_op", null).limit(20),
    supabase.from("opleverpunten").select("id, omschrijving, werkbonnen(montages(project_id, projecten(naam, klanten(naam))))").eq("status", "open").limit(20),
  ]);
  type Herkomst = { project_id: string; projecten: { naam: string; klanten: { naam: string } | null } | null } | null;
  const meldingen = ((wData ?? []) as unknown as { id: string; bijzonderheden: string | null; montages: Herkomst }[]).map((w) => ({ sleutel: `w-${w.id}`, soort: "Monteur meldt", kleur: "bg-amber-100 text-amber-900", herkomst: w.montages, tekst: w.bijzonderheden ?? "Kantoor moet reageren." }));
  const punten = ((pData ?? []) as unknown as { id: string; omschrijving: string; werkbonnen: { montages: Herkomst } | null }[]).map((p) => ({ sleutel: `p-${p.id}`, soort: "Opleverpunt", kleur: "bg-red-100 text-red-800", herkomst: p.werkbonnen?.montages ?? null, tekst: p.omschrijving }));
  const montageMeldingen = [...meldingen, ...punten].filter((x) => x.herkomst);
  // Mails die de klant niet hebben bereikt (teruggekaatst, als spam gemeld, geblokkeerd) in de afgelopen twee weken.
  const sinds = new Date(new Date().getTime() - 14 * 86_400_000).toISOString();
  const { data: mData2 } = await supabase.from("mail_log").select("id, soort, aan, factuur_id, aangemaakt, mail_events(soort, detail, opgetreden)").eq("status", "verzonden").gte("aangemaakt", sinds).order("aangemaakt", { ascending: false }).limit(100);
  const mailProblemen = ((mData2 ?? []) as unknown as { id: string; soort: string; aan: string; factuur_id: string | null; mail_events: BezorgEvent[] }[])
    .map((m) => ({ ...m, beste: besteGebeurtenis(m.mail_events ?? []) }))
    .filter((m) => IS_PROBLEEM(m.beste?.soort));
  const teLaat = rijen.filter((r) => isTeLaat(r.status, r.vervaldatum, vandaag));
  const onverzonden = rijen.filter((r) => !r.verzonden_op);
  if (teLaat.length === 0 && onverzonden.length === 0 && hints.length === 0 && montageMeldingen.length === 0 && mailProblemen.length === 0) return null;

  const rij = (r: Rij, tekst: string, kleur: string) => (
    <li key={`${tekst}-${r.id}`}>
      <Link href={`/projecten/${r.projecten?.id ?? ""}#facturen`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-stone-200 bg-white px-4 py-2.5 text-sm hover:bg-stone-50">
        <span><span className={`mr-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${kleur}`}>{tekst}</span><b>{r.debiteur?.naam ?? ""}</b> · <span className="font-mono">{r.nummer}</span> · {r.projecten?.naam}</span>
        <span className="tabular-nums">{euroTekst(Number(r.totaal_incl) - Number(r.gecrediteerd))}</span>
      </Link>
    </li>
  );

  return (
    <section aria-label="Facturen en montage die aandacht vragen" className="mx-auto max-w-6xl px-4 pt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Aandacht</h2>
        <Link href="/facturen" className="text-sm underline">Alle facturen</Link>
      </div>
      <ul className="mt-2 grid gap-2">
        {mailProblemen.slice(0, 5).map((m) => (
          <li key={`mail-${m.id}`}>
            <Link href={m.factuur_id ? `/facturen/${m.factuur_id}` : "/instellingen/email"} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm hover:bg-red-100">
              <span><span className="mr-2 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">Mail niet aangekomen</span><b>{m.aan}</b> · {{ factuur: "factuur", herinnering: "herinnering", betaalbevestiging: "betaalbevestiging", creditnota: "creditnota", offerte: "offerte", test: "testmail" }[m.soort] ?? m.soort}</span>
              <span className="text-red-900">{BEZORG_LABEL[m.beste!.soort].label}</span>
            </Link>
          </li>
        ))}
        {montageMeldingen.slice(0, 6).map((x) => (
          <li key={x.sleutel}>
            <Link href={`/projecten/${x.herkomst!.project_id}#montage`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-stone-200 bg-white px-4 py-2.5 text-sm hover:bg-stone-50">
              <span><span className={`mr-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${x.kleur}`}>{x.soort}</span><b>{x.herkomst!.projecten?.klanten?.naam ?? ""}</b> · {x.herkomst!.projecten?.naam}</span>
              <span className="max-w-md truncate text-stone-600">{x.tekst}</span>
            </Link>
          </li>
        ))}
        {hints.slice(0, 5).map((h) => {
          const m = montages.find((x) => x.project_id === h.projectId);
          return (
            <li key={`hint-${h.projectId}-${h.termijn}`}>
              <Link href={`/projecten/${h.projectId}#facturen`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-stone-200 bg-white px-4 py-2.5 text-sm hover:bg-stone-50">
                <span><span className="mr-2 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">Termijn {h.termijn} klaar</span><b>{m?.projecten?.klanten?.naam ?? ""}</b> · {m?.projecten?.naam}</span>
                <span className="text-stone-600">{h.reden}</span>
              </Link>
            </li>
          );
        })}
        {teLaat.slice(0, 5).map((r) => rij(r, `${dagenTeLaat(r.vervaldatum, vandaag)} d te laat`, "bg-red-100 text-red-800"))}
        {onverzonden.filter((r) => !teLaat.some((t) => t.id === r.id)).slice(0, 5).map((r) => rij(r, "Niet verzonden", "bg-amber-100 text-amber-900"))}
      </ul>
    </section>
  );
}
