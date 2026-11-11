import { maakServerClient } from "@/lib/supabase/server";
import { euroTekst } from "@/lib/offerte/bereken";
import { REGELS_KERNKOZIJNEN } from "@/lib/prijs/regels-kernkozijnen";
import { ISDE_STATUS, isdeIndicatie, isdeStukken, schatGlasM2, type IsdeStatus } from "@/lib/isde";
import { bewaarIsdePositie, zetIsdeStatus } from "../../isde/actions";

type Positie = { id: string; nummer: number; ruimte: string | null; aantal: number; config: { w: number; h: number; glas: string; product: string } };
type Dossier = { status: IsdeStatus; aangevraagd_op: string | null; referentie: string | null; notitie: string | null };
type IsdePositie = { positie_id: string; in_aanmerking: boolean; u_waarde: number | string | null; glas_m2: number | string | null; notitie: string | null };

const MELDINGEN: Record<string, { tekst: string; fout: boolean }> = {
  status_bewaard: { tekst: "De status van het ISDE-dossier is bewaard.", fout: false },
  positie_bewaard: { tekst: "De ISDE-gegevens van de positie zijn bewaard.", fout: false },
  datum: { tekst: "Vul de datum in waarop de klant de subsidie heeft aangevraagd.", fout: true },
  ongeldig: { tekst: "Controleer de ingevulde gegevens (U-waarde tussen 0 en 6, m² tussen 0 en 999).", fout: true },
  geen_toegang: { tekst: "Alleen directie en kantoor beheren het ISDE-dossier.", fout: true },
  mislukt: { tekst: "Het lukte niet. Probeer het opnieuw.", fout: true },
};
const veld = "mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm";
const datum = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(`${iso}T12:00:00Z`));

/** Het ISDE-subsidiedossier van een project: welke posities meetellen, U-waarden en m² glas, de stukken die de klant nodig heeft en de status. */
export default async function IsdeBlok({ projectId, offerteId, rol, melding }: { projectId: string; offerteId: string; rol: string | null; melding: string | null }) {
  if (rol !== "directie" && rol !== "kantoor" && rol !== "verkoop") return null;
  const mag = rol === "directie" || rol === "kantoor";
  const supabase = await maakServerClient();

  const [{ data: pData }, { data: dData }, { data: fData }] = await Promise.all([
    supabase.from("posities").select("id, nummer, ruimte, aantal, config").eq("offerte_id", offerteId).order("nummer"),
    supabase.from("isde_dossiers").select("status, aangevraagd_op, referentie, notitie").eq("project_id", projectId).maybeSingle(),
    supabase.from("facturen").select("status").eq("project_id", projectId),
  ]);
  const posities = (pData ?? []) as unknown as Positie[];
  if (posities.length === 0) return null;
  const { data: ipData } = await supabase.from("isde_posities").select("positie_id, in_aanmerking, u_waarde, glas_m2, notitie").in("positie_id", posities.map((p) => p.id));
  const dossier = (dData as Dossier | null) ?? { status: "niet_van_toepassing" as IsdeStatus, aangevraagd_op: null, referentie: null, notitie: null };
  const gegevens = new Map(((ipData ?? []) as IsdePositie[]).map((g) => [g.positie_id, g]));

  const { data: mRij } = await supabase.from("montages").select("id").eq("project_id", projectId).neq("status", "geannuleerd").maybeSingle();
  let werkbonOpgeleverd = false;
  let naFotos: number | null = null;
  if (mRij) {
    const { data: wb } = await supabase.from("werkbonnen").select("id, status").eq("montage_id", (mRij as { id: string }).id).maybeSingle();
    werkbonOpgeleverd = (wb as { status?: string } | null)?.status === "opgeleverd";
    if (wb && mag) {
      const { count } = await supabase.from("werkbon_fotos").select("id", { count: "exact", head: true }).eq("werkbon_id", (wb as { id: string }).id).eq("soort", "na");
      naFotos = count ?? 0;
    }
  }
  const stukken = isdeStukken({ facturen: (fData ?? []) as { status: string }[], werkbonOpgeleverd, naFotos: mag ? naFotos ?? 0 : null });

  const regels = posities.map((p) => {
    const g = gegevens.get(p.id);
    const aanmerking = g ? g.in_aanmerking : true;
    const m2 = g?.glas_m2 != null ? Number(g.glas_m2) : schatGlasM2(p.config.w, p.config.h, p.aantal);
    return { p, g, aanmerking, m2, indicatie: aanmerking ? isdeIndicatie(REGELS_KERNKOZIJNEN, p.config.glas, m2) : { laag: 0, hoog: 0 } };
  });
  const totaal = regels.reduce((s, r) => ({ laag: s.laag + r.indicatie.laag, hoog: s.hoog + r.indicatie.hoog }), { laag: 0, hoog: 0 });
  const m = melding ? MELDINGEN[melding] : null;
  const label = ISDE_STATUS.find((s) => s.sleutel === dossier.status)?.label ?? dossier.status;

  return (
    <section id="isde" className="mt-6 rounded-lg border border-stone-200 bg-white p-5" aria-label="ISDE-subsidie">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">ISDE-subsidie</h2>
        <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-700">{label}</span>
      </div>
      {m && <p role={m.fout ? "alert" : "status"} className={`mt-3 rounded-md px-4 py-2.5 text-sm ${m.fout ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>{m.tekst}</p>}
      <p className="mt-3 text-sm text-stone-600">De klant vraagt de subsidie zelf aan. Hier zet je de gegevens en stukken klaar. De bedragen zijn een indicatie op basis van de glassoort; de uiteindelijke subsidie hangt af van de voorwaarden van RVO op het moment van aanvragen.</p>
      {totaal.hoog > 0 && <p className="mt-2 text-sm font-semibold">Indicatie voor dit project: {euroTekst(totaal.laag)} – {euroTekst(totaal.hoog)}</p>}

      <h3 className="mt-4 text-sm font-semibold">Stukken voor de aanvraag</h3>
      <ul className="mt-2 grid gap-1 text-sm">
        {stukken.map((s) => (
          <li key={s.sleutel} className="flex gap-2">
            <span aria-hidden className={s.klaar === true ? "text-green-700" : s.klaar === false ? "text-red-700" : "text-stone-400"}>{s.klaar === true ? "✓" : s.klaar === false ? "✗" : "•"}</span>
            <span><b>{s.label}</b> <span className="text-stone-600">{s.uitleg}</span></span>
          </li>
        ))}
      </ul>

      <h3 className="mt-4 text-sm font-semibold">Posities</h3>
      <ul className="mt-2 grid gap-2">
        {regels.map(({ p, g, aanmerking, m2, indicatie }) => (
          <li key={p.id} className="rounded-md border border-stone-200 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">Positie {p.nummer}{p.ruimte ? ` · ${p.ruimte}` : ""} <span className="font-normal text-stone-600">{p.aantal}× {p.config.w} × {p.config.h} mm · {REGELS_KERNKOZIJNEN.glas[p.config.glas]?.label ?? p.config.glas}</span></span>
              <span className={aanmerking ? "" : "text-stone-500"}>{aanmerking ? (indicatie.hoog > 0 ? `${euroTekst(indicatie.laag)} – ${euroTekst(indicatie.hoog)}` : "geen indicatie") : "telt niet mee"}</span>
            </div>
            {mag ? (
              <form action={bewaarIsdePositie} className="mt-2 grid items-end gap-2 sm:grid-cols-[auto_1fr_1fr_2fr_auto]">
                <input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="positie_id" value={p.id} />
                <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" name="in_aanmerking" value="aan" defaultChecked={aanmerking} /> Telt mee</label>
                <label className="text-xs font-semibold">U-waarde (W/m²K)<input name="u_waarde" inputMode="decimal" defaultValue={g?.u_waarde != null ? String(g.u_waarde).replace(".", ",") : ""} className={veld} /></label>
                <label className="text-xs font-semibold">m² glas<input name="glas_m2" inputMode="decimal" defaultValue={String(m2).replace(".", ",")} className={veld} /></label>
                <label className="text-xs font-semibold">Notitie<input name="notitie" maxLength={500} defaultValue={g?.notitie ?? ""} className={veld} /></label>
                <button className="rounded-md border border-stone-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-stone-50">Opslaan</button>
              </form>
            ) : (
              <p className="mt-1 text-xs text-stone-600">{g?.u_waarde != null ? `U-waarde ${String(g.u_waarde).replace(".", ",")} W/m²K · ` : ""}{m2.toLocaleString("nl-NL")} m² glas</p>
            )}
          </li>
        ))}
      </ul>

      {mag ? (
        <form action={zetIsdeStatus} className="mt-4 grid gap-2 rounded-md border border-stone-200 p-3 sm:grid-cols-2">
          <input type="hidden" name="project_id" value={projectId} />
          <label className="text-xs font-semibold">Status
            <select name="status" defaultValue={dossier.status} className={veld}>{ISDE_STATUS.map((s) => <option key={s.sleutel} value={s.sleutel}>{s.label}</option>)}</select>
          </label>
          <label className="text-xs font-semibold">Aangevraagd op<input type="date" name="datum" defaultValue={dossier.aangevraagd_op ?? ""} className={veld} /></label>
          <label className="text-xs font-semibold">Referentie van RVO (optioneel)<input name="referentie" maxLength={80} defaultValue={dossier.referentie ?? ""} className={veld} /></label>
          <label className="text-xs font-semibold">Notitie<input name="notitie" maxLength={2000} defaultValue={dossier.notitie ?? ""} className={veld} /></label>
          <div className="sm:col-span-2"><button className="rounded-md bg-[#24332B] px-4 py-2 text-sm font-semibold text-white">Status opslaan</button></div>
        </form>
      ) : (
        dossier.aangevraagd_op && <p className="mt-3 text-sm text-stone-600">Aangevraagd op {datum(dossier.aangevraagd_op)}{dossier.referentie ? ` · ${dossier.referentie}` : ""}</p>
      )}
    </section>
  );
}
