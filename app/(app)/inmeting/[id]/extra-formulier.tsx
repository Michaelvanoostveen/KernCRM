"use client";

import { useActionState, useState } from "react";
import { voegExtraToe, type WijzigingStatus } from "../actions";

const veld = "w-full rounded-lg border border-stone-300 bg-white px-3 py-3 text-base";

export interface ExtraArtikel { id: string; groep: string; naam: string; eenheid: string }

/** Een artikel uit de catalogus toevoegen. De inmeter ziet de prijs pas nadat het artikel is toegevoegd; de prijs komt uit de catalogus. */
export default function ExtraFormulier({ inmetingId, artikelen, posities, magPrijzen }: {
  inmetingId: string; artikelen: ExtraArtikel[]; posities: { id: string; label: string }[]; magPrijzen: boolean;
}) {
  const [status, actie, bezig] = useActionState<WijzigingStatus, FormData>(voegExtraToe, {});
  const [eigen, setEigen] = useState("");
  const groepen = [...new Set(artikelen.map((a) => a.groep))];
  return (
    <form action={actie} className="rounded-lg border border-stone-200 bg-stone-50 p-3">
      <input type="hidden" name="inmeting_id" value={inmetingId} />
      <label className="block text-sm font-semibold">Artikel
        <select name="artikel_id" required defaultValue="" className={`${veld} mt-1`}>
          <option value="" disabled>Kies een artikel…</option>
          {groepen.map((g) => (
            <optgroup key={g} label={g}>
              {artikelen.filter((a) => a.groep === g).map((a) => <option key={a.id} value={a.id}>{a.naam} ({a.eenheid})</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <label className="block text-sm font-semibold">Aantal
          <input name="aantal" inputMode="numeric" defaultValue="1" className={`${veld} mt-1`} />
        </label>
        <label className="col-span-2 block text-sm font-semibold">Bij positie
          <select name="positie_id" defaultValue="" className={`${veld} mt-1`}>
            <option value="">Hele project</option>
            {posities.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
      </div>
      {magPrijzen && (
        <details className="mt-3 rounded-lg border border-stone-200 bg-white px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold">Eigen prijs invoeren</summary>
          <label className="mt-2 block text-sm font-semibold">Eigen prijs (incl. btw, voor het totale aantal)
            <input name="eigen_prijs" inputMode="decimal" value={eigen} onChange={(e) => setEigen(e.target.value)} placeholder="Leeg = catalogusprijs" className={`${veld} mt-1`} />
          </label>
          {eigen.trim() !== "" && (
            <label className="mt-2 block text-sm font-semibold">Reden
              <input name="reden" required autoComplete="off" placeholder="Bijvoorbeeld: coulance of extra werk" className={`${veld} mt-1`} />
            </label>
          )}
          <p className="mt-2 text-xs text-stone-500">De reden en de catalogusprijs zijn alleen zichtbaar voor de directie, niet voor de klant.</p>
        </details>
      )}
      {status.fout && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{status.fout}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button disabled={bezig} className="rounded-lg bg-[#B35B40] px-6 py-3 text-base font-bold text-white hover:brightness-110 disabled:opacity-60">{bezig ? "Toevoegen…" : "Toevoegen"}</button>
        {status.opgeslagen && <span role="status" className="text-sm font-semibold text-green-700">✓ Toegevoegd</span>}
      </div>
    </form>
  );
}
