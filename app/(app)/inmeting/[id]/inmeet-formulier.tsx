"use client";

import { startTransition, useActionState, useState } from "react";
import { AFWIJKING_DREMPEL_MM, afwijkingTekst, bepaalAfwijking } from "@/lib/inmeting/afwijking";
import { bewaarInmetingPositie, type PositieStatus } from "../actions";

const veld = "w-full rounded-lg border border-stone-300 bg-white px-3 py-3 text-lg tabular-nums disabled:bg-stone-100";
const getal = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const naarGetal = (t: string) => { const n = Number(t.replace(",", ".")); return t.trim() === "" || !Number.isFinite(n) ? null : Math.round(n); };

export default function InmeetFormulier({ inmetingId, positieId, nummer, ruimte, omschrijving, aantal, svg, offerteBreedte, offerteHoogte, begin, vergrendeld }: {
  inmetingId: string; positieId: string; nummer: number; ruimte: string | null; omschrijving: string; aantal: number; svg: string | null;
  offerteBreedte: number; offerteHoogte: number; vergrendeld: boolean;
  begin: { bestel_breedte_mm: number | null; bestel_hoogte_mm: number | null; binnen_breedte_mm: number | null; binnen_hoogte_mm: number | null; buiten_breedte_mm: number | null; buiten_hoogte_mm: number | null; opmerking: string | null } | null;
}) {
  const [wijzig, setWijzig] = useState(false);
  const [status, actie, bezig] = useActionState<PositieStatus, FormData>(async (vorige, formData) => {
    const uitkomst = await bewaarInmetingPositie(vorige, formData);
    // Gelukt: er is niets meer dat nog niet is opgeslagen. Mislukt: de wijziging blijft als "nog niet opgeslagen" staan.
    if (uitkomst.opgeslagen) startTransition(() => setWijzig(false));
    return uitkomst;
  }, {});
  const [breedte, setBreedte] = useState(getal(begin?.bestel_breedte_mm));
  const [hoogte, setHoogte] = useState(getal(begin?.bestel_hoogte_mm));
  const afw = bepaalAfwijking({ w: offerteBreedte, h: offerteHoogte }, { breedte: naarGetal(breedte), hoogte: naarGetal(hoogte) });
  const bewaard = !wijzig && (status.opgeslagen || (begin?.bestel_breedte_mm != null && begin?.bestel_hoogte_mm != null));

  return (
    <form action={actie} onChange={() => setWijzig(true)} className="rounded-xl border border-stone-200 bg-white p-4">
      <input type="hidden" name="inmeting_id" value={inmetingId} />
      <input type="hidden" name="positie_id" value={positieId} />
      <div className="flex items-start gap-4">
        {svg ? <div className="w-24 shrink-0 rounded-lg bg-[#efebe3] p-1.5" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="h-24 w-24 shrink-0 rounded-lg bg-stone-100" />}
        <div className="min-w-0">
          <div className="text-lg font-bold">Pos. {nummer}{ruimte ? ` · ${ruimte}` : ""}</div>
          <div className="text-sm text-stone-600">{omschrijving}{aantal > 1 ? ` · ${aantal} stuks` : ""}</div>
          <div className="mt-1 text-sm">Offertemaat: <b className="tabular-nums">{offerteBreedte} × {offerteHoogte} mm</b></div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border-2 border-[#B35B40]/40 bg-[#fbf3ef] p-3">
        <div className="text-sm font-bold">Bestelmaat (kozijnmaat voor de bestelling)</div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label className="text-sm font-semibold">Breedte (mm)
            <input name="bestel_breedte" inputMode="numeric" value={breedte} onChange={(e) => setBreedte(e.target.value)} disabled={vergrendeld} placeholder={String(offerteBreedte)} className={`${veld} mt-1`} />
          </label>
          <label className="text-sm font-semibold">Hoogte (mm)
            <input name="bestel_hoogte" inputMode="numeric" value={hoogte} onChange={(e) => setHoogte(e.target.value)} disabled={vergrendeld} placeholder={String(offerteHoogte)} className={`${veld} mt-1`} />
          </label>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="col-span-2 text-sm font-semibold text-stone-700">Binnenmaat (dagmaat binnen)</div>
        <label className="text-sm text-stone-600">Breedte (mm)
          <input name="binnen_breedte" inputMode="numeric" defaultValue={getal(begin?.binnen_breedte_mm)} disabled={vergrendeld} className={`${veld} mt-1 text-base`} />
        </label>
        <label className="text-sm text-stone-600">Hoogte (mm)
          <input name="binnen_hoogte" inputMode="numeric" defaultValue={getal(begin?.binnen_hoogte_mm)} disabled={vergrendeld} className={`${veld} mt-1 text-base`} />
        </label>
        <div className="col-span-2 text-sm font-semibold text-stone-700">Buitenmaat (dagmaat buiten)</div>
        <label className="text-sm text-stone-600">Breedte (mm)
          <input name="buiten_breedte" inputMode="numeric" defaultValue={getal(begin?.buiten_breedte_mm)} disabled={vergrendeld} className={`${veld} mt-1 text-base`} />
        </label>
        <label className="text-sm text-stone-600">Hoogte (mm)
          <input name="buiten_hoogte" inputMode="numeric" defaultValue={getal(begin?.buiten_hoogte_mm)} disabled={vergrendeld} className={`${veld} mt-1 text-base`} />
        </label>
      </div>

      {afw?.afwijkend && (
        <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">Afwijking van de offerte: {afwijkingTekst(afw)}. Boven {AFWIJKING_DREMPEL_MM} mm bespreekt kantoor het verschil met de klant.</p>
      )}
      {afw && !afw.afwijkend && <p className="mt-3 text-sm text-green-700">Binnen {AFWIJKING_DREMPEL_MM} mm van de offerte.</p>}

      <label className="mt-3 block text-sm text-stone-600">Bijzonderheden
        <textarea name="opmerking" rows={2} defaultValue={begin?.opmerking ?? ""} disabled={vergrendeld} placeholder="Bijvoorbeeld: scheve dagkant, rolluikkast, boeiboord" className={`${veld} mt-1 text-base`} />
      </label>

      {status.fout && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{status.fout}</p>}
      {!vergrendeld && (
        <div className="mt-3 flex items-center gap-3">
          <button disabled={bezig} className="rounded-lg bg-[#B35B40] px-6 py-3 text-base font-bold text-white hover:brightness-110 disabled:opacity-60">{bezig ? "Opslaan…" : "Opslaan"}</button>
          {bewaard && <span role="status" className="text-sm font-semibold text-green-700">✓ Opgeslagen</span>}
          {wijzig && !bezig && <span className="text-sm text-amber-800">Nog niet opgeslagen</span>}
        </div>
      )}
    </form>
  );
}
