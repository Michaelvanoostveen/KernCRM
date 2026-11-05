"use client";

import { useActionState, useState } from "react";
import HandtekeningVeld from "@/components/handtekening-veld";
import { geefKlantAkkoord, type WijzigingStatus } from "../actions";

/** De klant ziet de wijzigingen met de meerprijs en tekent ter plekke op het scherm van de inmeter. */
export default function KlantAkkoord({ inmetingId, klantNaam, bedrag, totaal }: { inmetingId: string; klantNaam: string; bedrag: string; totaal: number }) {
  const [status, actie, bezig] = useActionState<WijzigingStatus, FormData>(geefKlantAkkoord, {});
  const [naam, setNaam] = useState("");
  const [vink, setVink] = useState(false);
  const [handtekening, setHandtekening] = useState("");
  const klaar = naam.trim().length >= 3 && vink && handtekening !== "";

  return (
    <form action={actie} className="mt-4 rounded-xl border-2 border-[#B35B40] bg-white p-4">
      <input type="hidden" name="inmeting_id" value={inmetingId} />
      <input type="hidden" name="verwacht_totaal" value={totaal.toFixed(2)} />
      <h3 className="text-lg font-bold">Akkoord van de klant</h3>
      <p className="mt-1 text-sm text-stone-600">Geef de telefoon aan {klantNaam}. Met de handtekening gaat de klant akkoord met de wijzigingen hierboven en de {bedrag} incl. btw.</p>

      <label className="mt-3 block text-sm font-semibold">Naam klant
        <input name="naam" value={naam} onChange={(e) => setNaam(e.target.value)} autoComplete="off" placeholder="Voor- en achternaam" className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-3 text-base" />
      </label>
      <div className="mt-3 text-sm font-semibold">Handtekening (met vinger)</div>
      <HandtekeningVeld onChange={setHandtekening} />
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" name="akkoord" checked={vink} onChange={(e) => setVink(e.target.checked)} className="mt-1 h-5 w-5" />
        <span>Ik ga akkoord met de wijzigingen en de meerprijs van {bedrag} incl. btw.</span>
      </label>
      <p className="mt-2 text-xs text-stone-500">Naam, handtekening, tijdstip, IP-adres en apparaat worden vastgelegd als bewijs.</p>
      {status.fout && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{status.fout}</p>}
      <button disabled={!klaar || bezig} className="mt-3 w-full rounded-lg bg-[#B35B40] px-6 py-4 text-base font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{bezig ? "Bezig…" : "Klant geeft akkoord"}</button>
    </form>
  );
}
