"use client";

import { useActionState, useRef, useState } from "react";
import { geefAkkoord, type AkkoordStatus } from "./actions";

const BREEDTE = 800;
const HOOGTE = 220;

export default function AkkoordFormulier({ token, bedrag }: { token: string; bedrag: string }) {
  const [status, actie, bezig] = useActionState<AkkoordStatus, FormData>(geefAkkoord, {});
  const [naam, setNaam] = useState("");
  const [vink, setVink] = useState(false);
  const [handtekening, setHandtekening] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const tekent = useRef(false);

  const punt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return [((e.clientX - r.left) * c.width) / r.width, ((e.clientY - r.top) * c.height) / r.height] as const;
  };
  const begin = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvas.current!.getContext("2d")!;
    ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#23272A";
    e.currentTarget.setPointerCapture(e.pointerId);
    tekent.current = true;
    const [x, y] = punt(e);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.1, y + 0.1); ctx.stroke();
  };
  const beweeg = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!tekent.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    const [x, y] = punt(e);
    ctx.lineTo(x, y); ctx.stroke();
  };
  const stop = () => {
    if (!tekent.current) return;
    tekent.current = false;
    setHandtekening(canvas.current!.toDataURL("image/png"));
  };
  const wis = () => {
    canvas.current!.getContext("2d")!.clearRect(0, 0, BREEDTE, HOOGTE);
    setHandtekening("");
  };

  const klaar = naam.trim().length >= 3 && vink && handtekening !== "";

  return (
    <form action={actie} className="rounded-xl border-2 border-[#B35B40] bg-white p-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="handtekening" value={handtekening} />
      <h2 className="text-lg font-bold">Akkoord geven met uw handtekening</h2>
      <p className="mt-1 text-sm text-stone-600">Met uw handtekening gaat u akkoord met deze offerte van {bedrag} incl. btw.</p>

      <label className="mt-4 block text-sm font-medium">Uw naam
        <input name="naam" value={naam} onChange={(e) => setNaam(e.target.value)} autoComplete="name" placeholder="Voor- en achternaam" className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-base" />
      </label>

      <div className="mt-4 text-sm font-medium">Uw handtekening (met vinger of muis)</div>
      <canvas ref={canvas} width={BREEDTE} height={HOOGTE} aria-label="Handtekening" onPointerDown={begin} onPointerMove={beweeg} onPointerUp={stop} onPointerCancel={stop}
        className="mt-1 h-40 w-full cursor-crosshair touch-none rounded-md border border-dashed border-[#B35B40] bg-white" />
      <div className="mt-1 flex items-center justify-between text-xs text-stone-500">
        <span>{handtekening ? "Handtekening gezet" : "Nog niet getekend"}</span>
        <button type="button" onClick={wis} className="text-[#9C4B32] underline">Opnieuw</button>
      </div>

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
