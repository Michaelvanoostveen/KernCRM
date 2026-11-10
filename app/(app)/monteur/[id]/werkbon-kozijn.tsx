"use client";

import { startTransition, useActionState, useState } from "react";
import { CHECKLIST, type WerkbonRegel } from "@/lib/montage/werkbon";
import { bewaarWerkbonRegel, type WerkbonStatus } from "../actions";
import WerkbonFotoBlok, { type WerkbonFotoItem } from "./werkbon-foto-blok";

/** De checklist van één kozijn, met opmerking en foto's voor en na. */
export default function WerkbonKozijn({ montageId, positieId, regel, voor, na, vergrendeld }: {
  montageId: string; positieId: string; regel: WerkbonRegel | null; voor: WerkbonFotoItem[]; na: WerkbonFotoItem[]; vergrendeld: boolean;
}) {
  const [wijzig, setWijzig] = useState(false);
  const [status, actie, bezig] = useActionState<WerkbonStatus, FormData>(async (vorige, formData) => {
    const uitkomst = await bewaarWerkbonRegel(vorige, formData);
    if (uitkomst.opgeslagen) startTransition(() => setWijzig(false));
    return uitkomst;
  }, {});
  const waarde = (s: (typeof CHECKLIST)[number]["sleutel"]) => regel?.[s] ?? false;
  const klaar = CHECKLIST.every((c) => waarde(c.sleutel));

  return (
    <div className="mt-3 border-t border-stone-100 pt-3">
      <form action={actie} onChange={() => setWijzig(true)}>
        <input type="hidden" name="montage_id" value={montageId} />
        <input type="hidden" name="positie_id" value={positieId} />
        <div className="grid gap-1">
          {CHECKLIST.map((c) => (
            <label key={c.sleutel} className="flex items-center gap-3 rounded-lg px-1 py-1.5 text-base">
              <input type="checkbox" name={c.sleutel} defaultChecked={waarde(c.sleutel)} disabled={vergrendeld} className="h-6 w-6 shrink-0 accent-[#B35B40]" />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
        <label className="mt-2 block text-sm text-stone-600">Opmerking bij dit kozijn
          <textarea name="opmerking" rows={2} defaultValue={regel?.opmerking ?? ""} disabled={vergrendeld} placeholder="Bijvoorbeeld: dagkant scheef, extra kit nodig" className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base disabled:bg-stone-100" />
        </label>
        {status.fout && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{status.fout}</p>}
        {!vergrendeld && (
          <div className="mt-2 flex items-center gap-3">
            <button disabled={bezig} className="rounded-lg bg-[#B35B40] px-5 py-2.5 text-base font-bold text-white hover:brightness-110 disabled:opacity-60">{bezig ? "Opslaan…" : "Opslaan"}</button>
            {!wijzig && (status.opgeslagen || klaar) && <span role="status" className="text-sm font-semibold text-green-700">✓ {klaar ? "Alles af" : "Opgeslagen"}</span>}
            {wijzig && !bezig && <span className="text-sm text-amber-800">Nog niet opgeslagen</span>}
          </div>
        )}
      </form>
      <WerkbonFotoBlok montageId={montageId} positieId={positieId} soort="voor" fotos={voor} vergrendeld={vergrendeld} titel="Foto's voor" />
      <WerkbonFotoBlok montageId={montageId} positieId={positieId} soort="na" fotos={na} vergrendeld={vergrendeld} titel="Foto's na" />
    </div>
  );
}
