"use client";

import { useActionState, useState } from "react";
import HandtekeningVeld from "@/components/handtekening-veld";
import { geefAkkoord, type AkkoordStatus } from "./actions";

export default function AkkoordFormulier({ token, bedrag }: { token: string; bedrag: string }) {
  const [status, actie, bezig] = useActionState<AkkoordStatus, FormData>(geefAkkoord, {});
  const [naam, setNaam] = useState("");
  const [vink, setVink] = useState(false);
  const [handtekening, setHandtekening] = useState("");
  const klaar = naam.trim().length >= 3 && vink && handtekening !== "";

  return (
    <form action={actie} className="rounded-xl border-2 border-[#B35B40] bg-white p-5">
      <input type="hidden" name="token" value={token} />
      <h2 className="text-lg font-bold">Akkoord geven met uw handtekening</h2>
      <p className="mt-1 text-sm text-stone-600">Met uw handtekening gaat u akkoord met deze offerte van {bedrag} incl. btw.</p>

      <label className="mt-4 block text-sm font-medium">Uw naam
        <input name="naam" value={naam} onChange={(e) => setNaam(e.target.value)} autoComplete="name" placeholder="Voor- en achternaam" className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-base" />
      </label>

      <div className="mt-4 text-sm font-medium">Uw handtekening (met vinger of muis)</div>
      <HandtekeningVeld onChange={setHandtekening} />

      <label className="mt-4 flex items-start gap-2 text-sm">
        <input type="checkbox" name="akkoord" checked={vink} onChange={(e) => setVink(e.target.checked)} className="mt-1 h-4 w-4" />
        <span>Ik ga akkoord met deze offerte en de algemene voorwaarden.</span>
      </label>
      <p className="mt-3 text-xs text-stone-500">Wij leggen uw naam, handtekening, het tijdstip, uw IP-adres en uw apparaat vast als bewijs van uw akkoord.</p>

      {status.fout && <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{status.fout}</p>}
      <button disabled={!klaar || bezig} className="mt-4 rounded-md bg-[#B35B40] px-6 py-3 text-base font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{bezig ? "Bezig…" : "Akkoord geven"}</button>
    </form>
  );
}
