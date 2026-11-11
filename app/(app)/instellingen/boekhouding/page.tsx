import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { INSTELLING_VELDEN, leesInstellingen, ontbrekendeInstellingen } from "@/lib/boekhouding/instellingen";
import { maakProvider } from "@/lib/boekhouding/provider";
import { haalRol } from "../../start-gegevens";
import { bewaarBoekhouding, markeerWachtrij, vulWachtrijAan } from "./actions";

type Wachtrij = { id: string; soort: "factuur" | "creditnota"; status: string; fout: string | null; extern_ref: string | null; aangemaakt: string; facturen: { nummer: string } | null; creditnotas: { nummer: string } | null };

const MELDINGEN: Record<string, { tekst: string; fout: boolean }> = {
  bewaard: { tekst: "De instellingen zijn bewaard.", fout: false },
  aangevuld: { tekst: "De wachtrij is aangevuld met de verzonden facturen en creditnota's.", fout: false },
  verwerkt: { tekst: "Gemarkeerd als verwerkt.", fout: false },
  overgeslagen: { tekst: "Gemarkeerd als overgeslagen.", fout: false },
  niet_actief: { tekst: "Activeer eerst de aansluiting.", fout: true },
  geen_provider: { tekst: "Kies eerst een boekhoudpakket voordat je de aansluiting activeert.", fout: true },
  al_verwerkt: { tekst: "Dit onderdeel is al verwerkt en staat vast.", fout: true },
  rechten: { tekst: "Alleen de directie wijzigt de instellingen; kantoor beheert de wachtrij.", fout: true },
  geen_toegang: { tekst: "Daar heb je geen toestemming voor.", fout: true },
  ongeldig: { tekst: "Controleer de ingevulde gegevens (hooguit 40 tekens per veld).", fout: true },
  mislukt: { tekst: "Het lukte niet. Probeer het opnieuw.", fout: true },
};
const STATUS: Record<string, { label: string; kleur: string }> = {
  wachtend: { label: "Wacht", kleur: "bg-amber-100 text-amber-900" },
  verwerkt: { label: "Verwerkt", kleur: "bg-green-100 text-green-800" },
  mislukt: { label: "Mislukt", kleur: "bg-red-100 text-red-800" },
  overgeslagen: { label: "Overgeslagen", kleur: "bg-stone-200 text-stone-700" },
};
const veld = "mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm";
const datum = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(iso));

async function Inhoud({ zoek }: { zoek: Promise<{ m?: string }> }) {
  const { m } = await zoek;
  const rol = await haalRol();
  if (rol !== "directie" && rol !== "kantoor") redirect("/");
  const magInstellen = rol === "directie";
  const supabase = await maakServerClient();
  const [{ data: kRij }, { data: wData }] = await Promise.all([
    supabase.from("boekhoud_koppelingen").select("provider, actief, instellingen").maybeSingle(),
    supabase.from("boekhoud_wachtrij").select("id, soort, status, fout, extern_ref, aangemaakt, facturen(nummer), creditnotas(nummer)").order("aangemaakt", { ascending: false }).limit(100),
  ]);
  const koppeling = (kRij as { provider: string; actief: boolean; instellingen: unknown } | null) ?? { provider: "geen", actief: false, instellingen: {} };
  const instellingen = leesInstellingen(koppeling.instellingen);
  const wachtrij = (wData ?? []) as unknown as Wachtrij[];
  const ontbreekt = ontbrekendeInstellingen(instellingen);
  const provider = maakProvider(koppeling.provider);
  const status = await provider.controleer();
  const melding = m ? MELDINGEN[m] : null;
  const telling = (s: string) => wachtrij.filter((w) => w.status === s).length;
  const vandaag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date());
  const jaarBegin = `${vandaag.slice(0, 4)}-01-01`;

  return (
    <>
      <h1 className="text-2xl font-semibold">Boekhouding</h1>
      <p className="mt-1 text-sm text-stone-600">Verkoopfacturen en creditnota&apos;s gaan straks automatisch naar de boekhouding (Twinfield), de betaalstatus komt terug. Tot die verbinding er is, boek je met de export hieronder en markeer je de facturen als verwerkt.</p>
      {melding && <p role={melding.fout ? "alert" : "status"} className={`mt-4 rounded-md px-4 py-2.5 text-sm ${melding.fout ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>{melding.tekst}</p>}

      <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5" aria-label="Aansluiting">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Aansluiting</h2>
        <p className={`mt-2 text-sm ${status.ok ? "text-green-700" : "text-stone-600"}`}>{koppeling.provider === "geen" ? "Er is nog geen boekhoudpakket gekozen." : status.melding}</p>
        {koppeling.actief && ontbreekt.length > 0 && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Nog in te vullen voor het boeken: {ontbreekt.join(", ")}.</p>}
        <form action={bewaarBoekhouding} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">Boekhoudpakket
            <select name="provider" defaultValue={koppeling.provider} disabled={!magInstellen} className={veld}>
              <option value="geen">Geen</option>
              <option value="twinfield">Twinfield</option>
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold"><input type="checkbox" name="actief" value="aan" defaultChecked={koppeling.actief} disabled={!magInstellen} /> Aansluiting actief (nieuwe facturen komen in de wachtrij)</label>
          {INSTELLING_VELDEN.map((v) => (
            <label key={v.sleutel} className="text-xs font-semibold">{v.label}
              <input name={v.sleutel} maxLength={40} defaultValue={instellingen[v.sleutel]} readOnly={!magInstellen} className={veld} />
              <span className="mt-1 block font-normal text-stone-500">{v.hulp}</span>
            </label>
          ))}
          {magInstellen
            ? <div className="sm:col-span-2"><button className="rounded-md bg-[#24332B] px-4 py-2 text-sm font-semibold text-white">Opslaan</button></div>
            : <p className="text-sm text-stone-500 sm:col-span-2">Alleen de directie wijzigt deze instellingen.</p>}
        </form>
        <p className="mt-3 text-xs text-stone-500">Inloggegevens van Twinfield staan hier niet: die komen versleuteld per bedrijf zodra we de verbinding maken.</p>
      </section>

      <section className="mt-4 rounded-lg border border-stone-200 bg-white p-5" aria-label="Export">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Export voor de boekhouding</h2>
        <p className="mt-2 text-sm text-stone-600">Een CSV-bestand (puntkomma-gescheiden, opent in Excel) met de verzonden verkoopfacturen en creditnota&apos;s, of met de ontvangen betalingen, over een periode.</p>
        <form action="/instellingen/boekhouding/export" method="get" className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold">Van<input type="date" name="van" defaultValue={jaarBegin} className={veld} /></label>
          <label className="text-xs font-semibold">Tot en met<input type="date" name="tot" defaultValue={vandaag} className={veld} /></label>
          <label className="text-xs font-semibold">Wat
            <select name="soort" className={veld}><option value="boekingen">Verkoopboekingen (facturen en creditnota&apos;s)</option><option value="betalingen">Ontvangen betalingen</option></select>
          </label>
          <button className="rounded-md bg-[#24332B] px-4 py-2 text-sm font-semibold text-white">Download CSV</button>
        </form>
      </section>

      <section className="mt-4 rounded-lg border border-stone-200 bg-white p-5" aria-label="Wachtrij">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Wachtrij</h2>
          <span className="text-xs text-stone-600">{telling("wachtend")} wachten · {telling("verwerkt")} verwerkt · {telling("mislukt")} mislukt · {telling("overgeslagen")} overgeslagen</span>
        </div>
        {koppeling.actief && (
          <form action={vulWachtrijAan} className="mt-2"><button className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-stone-50">Bestaande verzonden facturen toevoegen</button></form>
        )}
        {wachtrij.length === 0 ? (
          <p className="mt-3 text-sm text-stone-600">De wachtrij is leeg. Zodra de aansluiting actief is, komen verzonden facturen en nieuwe creditnota&apos;s hier automatisch in.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {wachtrij.map((w) => (
              <li key={w.id} className="rounded-md border border-stone-200 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b className="font-mono">{w.soort === "factuur" ? w.facturen?.nummer : w.creditnotas?.nummer}</b> <span className="text-stone-600">{w.soort === "factuur" ? "factuur" : "creditnota"} · {datum(w.aangemaakt)}</span></span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[w.status]?.kleur ?? ""}`}>{STATUS[w.status]?.label ?? w.status}</span>
                </div>
                {w.fout && <p className="mt-1 text-xs text-red-800">{w.fout}</p>}
                {w.extern_ref && <p className="mt-1 text-xs text-stone-600">Verwijzing in de boekhouding: {w.extern_ref}</p>}
                {(w.status === "wachtend" || w.status === "mislukt") && (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <form action={markeerWachtrij} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={w.id} /><input type="hidden" name="status" value="verwerkt" />
                      <label className="text-xs font-semibold">Boekingsnummer (optioneel)<input name="extern_ref" maxLength={100} className={veld} /></label>
                      <button className="rounded-md bg-[#24332B] px-3 py-2 text-xs font-semibold text-white">Markeer als verwerkt</button>
                    </form>
                    <form action={markeerWachtrij}><input type="hidden" name="id" value={w.id} /><input type="hidden" name="status" value="overgeslagen" /><button className="rounded-md border border-stone-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-stone-50">Overslaan</button></form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="mt-4 text-sm"><Link href="/facturen" className="underline">← Naar de facturen</Link></p>
    </>
  );
}

export default function BoekhoudingPagina(props: { searchParams: Promise<{ m?: string }> }) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Suspense fallback={<p className="text-stone-500">Laden…</p>}><Inhoud zoek={props.searchParams} /></Suspense>
    </main>
  );
}
