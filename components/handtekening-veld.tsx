"use client";

import { useRef, useState } from "react";

const BREEDTE = 800;
const HOOGTE = 220;

/** Tekenvak voor een handtekening met vinger of muis. Geeft een PNG (data-URL) door aan `onChange`, of een lege tekst na wissen. */
export default function HandtekeningVeld({ naam = "handtekening", onChange }: { naam?: string; onChange?: (waarde: string) => void }) {
  const [waarde, setWaarde] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const tekent = useRef(false);

  const zet = (w: string) => { setWaarde(w); onChange?.(w); };
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
    zet(canvas.current!.toDataURL("image/png"));
  };
  const wis = () => {
    canvas.current!.getContext("2d")!.clearRect(0, 0, BREEDTE, HOOGTE);
    zet("");
  };

  return (
    <>
      <input type="hidden" name={naam} value={waarde} />
      <canvas ref={canvas} width={BREEDTE} height={HOOGTE} aria-label="Handtekening" onPointerDown={begin} onPointerMove={beweeg} onPointerUp={stop} onPointerCancel={stop}
        className="mt-1 h-40 w-full cursor-crosshair touch-none rounded-md border border-dashed border-[#B35B40] bg-white" />
      <div className="mt-1 flex items-center justify-between text-xs text-stone-500">
        <span>{waarde ? "Handtekening gezet" : "Nog niet getekend"}</span>
        <button type="button" onClick={wis} className="text-[#9C4B32] underline">Opnieuw</button>
      </div>
    </>
  );
}
