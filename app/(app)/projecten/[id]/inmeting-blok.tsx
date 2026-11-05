import Link from "next/link";
import { maakServerClient } from "@/lib/supabase/server";
import { haalPrijsregels } from "@/lib/prijs";
import { afwijkingTekst, bepaalAfwijking, indicatieMeerwerk } from "@/lib/inmeting/afwijking";
import { euroTekst } from "@/lib/offerte/bereken";
import { leesConfiguratie } from "@/lib/projecten/positie";
import { annuleerInmeting, planInmeting } from "../../inmeting/actions";

type Lid = { user_id: string; email: string; rol: string };
type MetenRij = { positie_id: string; bestel_breedte_mm: number | null; bestel_hoogte_mm: number | null; posities: { nummer: number; ruimte: string | null; aantal: number; config: unknown } | null };

const dagTijd = (iso: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));
const veld = "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm";
const MELDINGEN: Record<string, string> = {
  gepland: "De inmeting is gepland. De inmeter ziet hem nu in zijn overzicht.",
  geannuleerd: "De inmeting is geannuleerd.",
  datum: "Kies een geldige datum en tijd.",
  inmeter: "Kies een inmeter.",
  inmeting: "De inmeting kon niet worden gepland. Dat kan alleen bij een getekende offerte zonder andere geplande inmeting.",
};

export default async function InmetingBlok({ projectId, melding }: { projectId: string; melding: string | null }) {
  const supabase = await maakServerClient();
  const { data: inmetingen } = await supabase.from("inmetingen").select("id, offerte_id, status, gepland_op, inmeter_id, notitie, uitgevoerd_op").eq("project_id", projectId).neq("status", "geannuleerd").order("gepland_op", { ascending: false });
  const { data: ledenData } = await supabase.rpc("leden_voor_planning");
  const leden = (ledenData ?? []) as Lid[];
  const naam = (id: string | null) => leden.find((l) => l.user_id === id)?.email ?? "onbekend";
  const huidige = (inmetingen ?? [])[0] as { id: string; offerte_id: string; status: string; gepland_op: string; inmeter_id: string | null; notitie: string | null; uitgevoerd_op: string | null } | undefined;
  const boodschap = melding ? MELDINGEN[melding] : null;
  const fout = melding !== null && ["datum", "inmeter", "inmeting"].includes(melding);

  let ingevuld = 0;
  let totaal = 0;
  let meten: MetenRij[] = [];
  if (huidige) {
    const { data } = await supabase.from("inmeting_regels").select("positie_id, bestel_breedte_mm, bestel_hoogte_mm, posities(nummer, ruimte, aantal, config)").eq("inmeting_id", huidige.id);
    meten = ((data ?? []) as unknown as MetenRij[]).sort((a, b) => (a.posities?.nummer ?? 0) - (b.posities?.nummer ?? 0));
    ingevuld = meten.filter((m) => m.bestel_breedte_mm !== null && m.bestel_hoogte_mm !== null).length;
    const { count } = await supabase.from("posities").select("id", { count: "exact", head: true }).eq("offerte_id", huidige.offerte_id);
    totaal = count ?? 0;
  }

  const regels = haalPrijsregels();
  const rijen = meten.flatMap((m) => {
    if (!m.posities || m.bestel_breedte_mm === null || m.bestel_hoogte_mm === null) return [];
    try {
      const cfg = leesConfiguratie(m.posities.config);
      const afw = bepaalAfwijking({ w: cfg.w, h: cfg.h }, { breedte: m.bestel_breedte_mm, hoogte: m.bestel_hoogte_mm });
      const indicatie = afw?.afwijkend ? indicatieMeerwerk(regels, cfg, { breedte: m.bestel_breedte_mm, hoogte: m.bestel_hoogte_mm }, m.posities.aantal) : 0;
      return [{ nummer: m.posities.nummer, ruimte: m.posities.ruimte, offerte: `${cfg.w} × ${cfg.h}`, gemeten: `${m.bestel_breedte_mm} × ${m.bestel_hoogte_mm}`, afw, indicatie }];
    } catch {
      return [];
    }
  });
  const afwijkend = rijen.filter((r) => r.afw?.afwijkend);
  const totaalIndicatie = afwijkend.reduce((s, r) => s + r.indicatie, 0);

  return (
    <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5" aria-label="Inmeting">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Inmeting</h2>
      {boodschap && <p role={fout ? "alert" : "status"} className={`mt-3 rounded-md px-4 py-2.5 text-sm ${fout ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>{boodschap}</p>}

      {!huidige && (
        <form action={planInmeting} className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:items-end">
          <input type="hidden" name="project_id" value={projectId} />
          <p className="text-sm text-stone-600 sm:col-span-2">De offerte is getekend. Plan de inmeting; het project gaat dan naar de fase Inmeting en de inmeter ziet hem in zijn overzicht.</p>
          <label className="text-sm font-medium">Datum en tijd<input type="datetime-local" name="moment" required className={`${veld} mt-1`} /></label>
          <label className="text-sm font-medium">Inmeter
            <select name="inmeter_id" required defaultValue={leden.find((l) => l.rol === "inmeter")?.user_id ?? ""} className={`${veld} mt-1`}>
              <option value="" disabled>Kies een inmeter</option>
              {leden.map((l) => <option key={l.user_id} value={l.user_id}>{l.email} ({l.rol})</option>)}
            </select>
          </label>
          <label className="text-sm font-medium sm:col-span-2">Notitie voor de inmeter (optioneel)<input name="notitie" maxLength={1000} placeholder="Bijvoorbeeld: bel een kwartier van tevoren" className={`${veld} mt-1`} /></label>
          <div className="sm:col-span-2"><button className="rounded-md bg-[#B35B40] px-4 py-2 font-semibold text-white hover:brightness-110">Inmeting plannen</button></div>
        </form>
      )}

      {huidige?.status === "gepland" && (
        <div className="mt-3">
          <div className="font-semibold">{dagTijd(huidige.gepland_op)}</div>
          <div className="text-sm text-stone-600">Inmeter: {naam(huidige.inmeter_id)} · {ingevuld} van {totaal} posities ingemeten</div>
          {huidige.notitie && <div className="mt-1 text-sm text-stone-600">Notitie: {huidige.notitie}</div>}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link href={`/inmeting/${huidige.id}`} className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-stone-50">Open inmeetstaat</Link>
            <details className="relative">
              <summary className="cursor-pointer list-none text-sm text-stone-600 underline">Annuleren</summary>
              <form action={annuleerInmeting} className="absolute left-0 z-10 mt-2 w-64 rounded-lg border border-stone-200 bg-white p-3 shadow-lg">
                <input type="hidden" name="project_id" value={projectId} />
                <input type="hidden" name="inmeting_id" value={huidige.id} />
                <p className="text-sm">De inmeting annuleren? De gemeten maten blijven bewaard.</p>
                <button className="mt-2 rounded-md bg-red-700 px-3 py-1 text-sm font-semibold text-white">Ja, annuleren</button>
              </form>
            </details>
          </div>
        </div>
      )}

      {huidige?.status === "uitgevoerd" && (
        <div className="mt-3">
          <div className="text-sm text-stone-600">Ingemeten door {naam(huidige.inmeter_id)} op {huidige.uitgevoerd_op ? dagTijd(huidige.uitgevoerd_op) : dagTijd(huidige.gepland_op)}.</div>
          <div className="mt-3 overflow-x-auto rounded-md border border-stone-200">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr><th className="px-3 py-2 font-semibold">Positie</th><th className="px-3 py-2 font-semibold">Offerte (mm)</th><th className="px-3 py-2 font-semibold">Bestelmaat (mm)</th><th className="px-3 py-2 font-semibold">Afwijking</th><th className="px-3 py-2 text-right font-semibold">Indicatie meer-/minderwerk</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rijen.map((r) => (
                  <tr key={r.nummer}>
                    <td className="px-3 py-2 font-semibold">Pos. {r.nummer}{r.ruimte ? ` · ${r.ruimte}` : ""}</td>
                    <td className="px-3 py-2 tabular-nums">{r.offerte}</td>
                    <td className="px-3 py-2 tabular-nums">{r.gemeten}</td>
                    <td className="px-3 py-2">{r.afw?.afwijkend ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{afwijkingTekst(r.afw)}</span> : <span className="text-green-700">Binnen de marge</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.afw?.afwijkend ? `${r.indicatie > 0 ? "+" : ""}${euroTekst(r.indicatie)}` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {afwijkend.length > 0 ? (
            <p role="status" className="mt-3 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900"><b>{afwijkend.length} {afwijkend.length === 1 ? "positie wijkt" : "posities wijken"} af van de offerte.</b> Indicatie van het totale meer-/minderwerk: {totaalIndicatie > 0 ? "+" : ""}{euroTekst(totaalIndicatie)} incl. btw (zonder handmatige aanpassingen). Bespreek dit met de klant; het vastleggen als meer- of minderwerk volgt in een volgende stap.</p>
          ) : (
            <p role="status" className="mt-3 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">Alle posities liggen binnen de marge van de offerte. Er is geen meer- of minderwerk.</p>
          )}
          <p className="mt-3"><Link href={`/inmeting/${huidige.id}`} className="text-sm underline">Open de inmeetstaat</Link></p>
        </div>
      )}
    </section>
  );
}
