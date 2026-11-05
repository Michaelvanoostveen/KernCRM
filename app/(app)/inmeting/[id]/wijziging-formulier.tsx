"use client";

import { useActionState, useMemo, useState } from "react";
import { PrijsFout } from "@/lib/prijs/berekenen";
import type { Configuratie, Prijsregels } from "@/lib/prijs/types";
import { kozijnSvg } from "@/lib/tekening/tekenen";
import { heeftWijziging, meerprijsConfiguratie, pasVoorstelToe } from "@/lib/inmeting/wijzigingen";
import { euro } from "@/lib/projecten/positie";
import { stelWijzigingVoor, type WijzigingStatus } from "../actions";

const prijsTekst = (n: number) => (n >= 0 ? `+ ${euro(n)}` : `− ${euro(-n)}`);
/** Zelfde regels als op de server: met een komma is de punt een duizendtal, zonder komma het decimaalteken. */
function parseBedrag(t: string): number | null {
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}
const veld = "w-full rounded-lg border border-stone-300 bg-white px-3 py-3 text-base";

/** Indeling, draairichting, kleur en glas van één positie aanpassen. De maat blijft de offertemaat. */
export default function WijzigingFormulier({ inmetingId, positieId, regels, begin, aantal, magPrijzen }: {
  inmetingId: string; positieId: string; regels: Prijsregels; begin: Configuratie; aantal: number; magPrijzen: boolean;
}) {
  const [status, actie, bezig] = useActionState<WijzigingStatus, FormData>(stelWijzigingVoor, {});
  const [variant, setVariant] = useState(begin.variant);
  const [cols, setCols] = useState<string[] | null>(begin.cols ?? null);
  const [kleur, setKleur] = useState(begin.kleur);
  const [kleurVleugel, setKleurVleugel] = useState(begin.kleurVleugel ?? "");
  const [glas, setGlas] = useState(begin.glas);
  const [eigen, setEigen] = useState("");

  const product = regels.producten[begin.product];
  const gekozen = product.variants.find((v) => v.key === variant) ?? product.variants[0];
  const standaard = (gekozen.cols ?? []) as string[];
  const vakken = cols && cols.length === standaard.length ? cols : standaard;

  const nieuw = useMemo(() => pasVoorstelToe(begin, { variant, cols, kleur, kleurVleugel: kleurVleugel && kleurVleugel !== kleur ? kleurVleugel : null, glas }), [begin, variant, cols, kleur, kleurVleugel, glas]);
  const gewijzigd = heeftWijziging(begin, nieuw);
  const eigenBedrag = eigen.trim() === "" ? null : parseBedrag(eigen);
  const { meerprijs, fout } = useMemo(() => {
    try { return { meerprijs: meerprijsConfiguratie(regels, begin, nieuw, aantal), fout: null }; }
    catch (e) { if (e instanceof PrijsFout) return { meerprijs: 0, fout: e.message }; throw e; }
  }, [regels, begin, nieuw, aantal]);
  const svg = useMemo(() => { try { return kozijnSvg(regels, nieuw, "Nieuw"); } catch { return null; } }, [regels, nieuw]);

  return (
    <form action={actie} className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
      <input type="hidden" name="inmeting_id" value={inmetingId} />
      <input type="hidden" name="positie_id" value={positieId} />
      <input type="hidden" name="variant" value={variant} />
      {vakken.map((t, i) => <input key={i} type="hidden" name="col" value={t} />)}

      <div className="flex items-start gap-3">
        {svg && <div className="w-28 shrink-0 rounded-lg bg-[#efebe3] p-1.5" dangerouslySetInnerHTML={{ __html: svg }} />}
        <div className="min-w-0 flex-1 text-sm text-stone-600">Zo ziet de positie eruit na de wijziging. De maat blijft de offertemaat.</div>
      </div>

      {product.variants.length > 1 && (
        <label className="mt-3 block text-sm font-semibold">Indeling
          <select value={variant} onChange={(e) => { setVariant(e.target.value); setCols(null); }} className={`${veld} mt-1`}>
            {product.variants.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
          </select>
        </label>
      )}

      {vakken.length > 0 && (
        <fieldset className="mt-3">
          <legend className="text-sm font-semibold">Draairichting per vak</legend>
          <div className="mt-1 grid gap-2">
            {vakken.map((t, i) => (
              <label key={i} className="flex items-center gap-2 text-sm">
                <span className="w-14 shrink-0 text-stone-600">Vak {i + 1}</span>
                <select value={t} onChange={(e) => setCols(vakken.map((x, j) => (j === i ? e.target.value : x)))} className={veld}>
                  {regels.vakVolgorde.map((k) => <option key={k} value={k}>{regels.vak[k]?.label ?? k}</option>)}
                </select>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold">Kleur
          <select name="kleur" value={kleur} onChange={(e) => setKleur(e.target.value)} className={`${veld} mt-1`}>
            {Object.entries(regels.kleuren).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold">Kleur vleugels
          <select name="kleur_vleugel" value={kleurVleugel} onChange={(e) => setKleurVleugel(e.target.value)} className={`${veld} mt-1`}>
            <option value="">Zelfde als kozijn</option>
            {Object.entries(regels.kleuren).filter(([k]) => k !== kleur).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold sm:col-span-2">Glas
          <select name="glas" value={glas} onChange={(e) => setGlas(e.target.value)} className={`${veld} mt-1`}>
            {Object.entries(regels.glas).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
      </div>

      {fout && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{fout}</p>}
      {status.fout && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{status.fout}</p>}
      {gewijzigd && !fout && (
        <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          {eigenBedrag !== null ? `Prijs ${prijsTekst(eigenBedrag)}` : meerprijs === 0 ? "Geen prijsverschil" : meerprijs > 0 ? `Meerprijs ${euro(meerprijs)}` : `Minderprijs ${euro(-meerprijs)}`} incl. btw{aantal > 1 ? ` voor ${aantal} stuks` : ""}
        </p>
      )}
      {magPrijzen && gewijzigd && !fout && (
        <details className="mt-3 rounded-lg border border-stone-200 bg-white px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold">Eigen prijs invoeren</summary>
          <label className="mt-2 block text-sm font-semibold">Eigen meerprijs (incl. btw{aantal > 1 ? `, voor ${aantal} stuks` : ""})
            <input name="eigen_prijs" inputMode="decimal" value={eigen} onChange={(e) => setEigen(e.target.value)} placeholder="Leeg = berekende prijs" className={`${veld} mt-1`} />
          </label>
          {eigen.trim() !== "" && (
            <label className="mt-2 block text-sm font-semibold">Reden
              <input name="reden" required autoComplete="off" placeholder="Bijvoorbeeld: coulance of extra werk" className={`${veld} mt-1`} />
            </label>
          )}
          <p className="mt-2 text-xs text-stone-500">De reden en het oorspronkelijke voorstel zijn alleen zichtbaar voor de directie, niet voor de klant.</p>
        </details>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button disabled={bezig || !gewijzigd || !!fout} className="rounded-lg bg-[#B35B40] px-6 py-3 text-base font-bold text-white hover:brightness-110 disabled:opacity-50">{bezig ? "Opslaan…" : "Wijziging voorstellen"}</button>
        {status.opgeslagen && !gewijzigd && <span role="status" className="text-sm font-semibold text-green-700">✓ Voorgesteld</span>}
      </div>
    </form>
  );
}
