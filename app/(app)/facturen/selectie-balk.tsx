"use client";

import { useEffect, useRef, useState } from "react";

const knop = "rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-stone-50";

/**
 * De werkbalk bij het factuuroverzicht: facturen aanvinken (of alles in deze weergave) en de selectie exporteren. Staat binnen het formulier met de vinkjes
 * (name="id"); het formulier verstuurt de selectie naar de export.
 */
export default function SelectieBalk() {
  const ref = useRef<HTMLDivElement>(null);
  const [aantal, setAantal] = useState(0);

  const vakjes = () => Array.from(ref.current?.closest("form")?.querySelectorAll<HTMLInputElement>('input[name="id"]') ?? []);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const tel = () => setAantal(form.querySelectorAll('input[name="id"]:checked').length);
    form.addEventListener("change", tel);
    return () => form.removeEventListener("change", tel);
  }, []);
  const zet = (aan: boolean) => {
    for (const v of vakjes()) v.checked = aan;
    setAantal(aan ? vakjes().length : 0);
  };

  return (
    <div ref={ref} className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm">
      <span className="font-semibold">{aantal === 0 ? "Vink facturen aan om te exporteren" : `${aantal} geselecteerd`}</span>
      <button type="button" onClick={() => zet(true)} className={knop}>Alles in deze weergave</button>
      <button type="button" onClick={() => zet(false)} disabled={aantal === 0} className={`${knop} disabled:opacity-50`}>Niets</button>
      <span className="ml-auto flex flex-wrap items-center gap-2">
        <select name="soort" aria-label="Wat exporteren" defaultValue="boekingen" className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-xs">
          <option value="boekingen">Verkoopboekingen (met creditnota&apos;s)</option>
          <option value="betalingen">Ontvangen betalingen</option>
        </select>
        <button disabled={aantal === 0} className="rounded-md bg-[#24332B] px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Exporteer selectie (CSV)</button>
      </span>
    </div>
  );
}
