"use client";

import { useActionState, useMemo, useState } from "react";
import { berekenPrijs, PrijsFout } from "@/lib/prijs/berekenen";
import type { Configuratie, Prijsregels, Variant } from "@/lib/prijs/types";
import { kozijnSvg, tekenInhoud } from "@/lib/tekening/tekenen";
import { euro, regelTotaal } from "@/lib/projecten/positie";
import type { PositieStatus } from "../../../actions";

const label = "mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-stone-500";
const veld = "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm";
const nl = (n: number, d = 2) => n.toLocaleString("nl-NL", { minimumFractionDigits: d, maximumFractionDigits: d });

function Keuze<T extends string>({ opties, waarde, onKies, naam }: { opties: { key: T; label: string }[]; waarde: T; onKies: (k: T) => void; naam: string }) {
  return (
    <div role="group" aria-label={naam} className="flex flex-wrap overflow-hidden rounded-md border border-stone-300">
      {opties.map((o) => (
        <button key={o.key} type="button" aria-pressed={o.key === waarde} onClick={() => onKies(o.key)}
          className={`flex-1 border-l border-stone-300 px-3 py-2 text-sm font-medium first:border-l-0 ${o.key === waarde ? "bg-[#24332B] text-white" : "bg-white hover:bg-stone-50"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function vakBron(v: Variant): "cols" | "stack" | null {
  return v.cols ? "cols" : v.stack ? "stack" : null;
}

export default function Configurator({ regels, begin, beginRuimte, beginAantal, projectId, positieId, actie, annuleerHref }: {
  regels: Prijsregels;
  begin: Configuratie;
  beginRuimte: string;
  beginAantal: number;
  projectId: string;
  positieId: string;
  actie: (vorige: PositieStatus, formData: FormData) => Promise<PositieStatus>;
  annuleerHref: string;
}) {
  const [cfg, setCfg] = useState<Configuratie>(begin);
  const [ruimte, setRuimte] = useState(beginRuimte);
  const [aantal, setAantal] = useState(beginAantal);
  const [status, formActie, bezig] = useActionState<PositieStatus, FormData>(actie, {});

  const product = regels.producten[cfg.product];
  const variant = product.variants.find((v) => v.key === cfg.variant) ?? product.variants[0];
  const bron = vakBron(variant);
  const standaardVakken = bron ? (variant[bron] as string[]) : [];
  const vakken = bron && cfg.cols && cfg.cols.length === standaardVakken.length ? cfg.cols : standaardVakken;
  const aangepast = bron !== null && cfg.cols !== null && cfg.cols !== undefined && cfg.cols.some((t, i) => t !== standaardVakken[i]);

  const wijzig = (d: Partial<Configuratie>) => setCfg((c) => ({ ...c, ...d }));
  const kiesProduct = (key: string) => {
    const p = regels.producten[key];
    setCfg((c) => ({ ...c, product: key, variant: p.variants[0].key, w: p.wDef, h: p.hDef, cols: null }));
  };
  const kiesVariant = (key: string) => wijzig({ variant: key, cols: null });
  const zetVak = (i: number, type: string) => wijzig({ cols: vakken.map((t, j) => (j === i ? type : t)) });
  const maat = (k: "w" | "h", waarde: number) => {
    const [min, max] = k === "w" ? [product.wMin, product.wMax] : [product.hMin, product.hMax];
    if (Number.isFinite(waarde)) wijzig({ [k]: Math.min(max, Math.max(min, Math.round(waarde))) } as Partial<Configuratie>);
  };

  const berekening = useMemo(() => {
    try { return { r: berekenPrijs(regels, cfg), fout: null as string | null }; }
    catch (e) { return { r: null, fout: e instanceof PrijsFout ? e.message : "De prijs kon niet worden berekend." }; }
  }, [regels, cfg]);

  const tekening = useMemo(() => {
    try { return kozijnSvg(regels, { ...cfg }, `${product.label}, ${variant.label}`); } catch { return ""; }
  }, [regels, cfg, product.label, variant.label]);

  const miniaturen = useMemo(() => {
    const verhouding = product.kind === "door" ? 0.5 : product.kind === "slider" ? 1.9 : product.kind === "french" ? 1 : 0.85;
    return product.variants.map((v) => {
      try {
        const inhoud = tekenInhoud(regels, { product: cfg.product, variant: v.key, w: Math.round(verhouding * 1000), h: 1000, kleur: cfg.kleur, kleurVleugel: cfg.kleurVleugel, miniatuur: true });
        return { key: v.key, label: v.label, svg: `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${inhoud}</svg>` };
      } catch { return { key: v.key, label: v.label, svg: "" }; }
    });
  }, [regels, product, cfg.product, cfg.kleur, cfg.kleurVleugel]);

  const r = berekening.r;
  const lijst = <T,>(o: Record<string, T & { label: string }>) => Object.entries(o).map(([key, v]) => ({ key, label: v.label }));

  return (
    <form action={formActie} className="grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="positie_id" value={positieId} />
      <input type="hidden" name="config" value={JSON.stringify(cfg)} />

      <div className="flex flex-col gap-5 rounded-lg border border-stone-200 bg-white p-5">
        <div>
          <div className={label}>Product</div>
          <div role="group" aria-label="Product" className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {Object.entries(regels.producten).map(([key, p]) => (
              <button key={key} type="button" aria-pressed={key === cfg.product} onClick={() => kiesProduct(key)}
                className={`rounded-md border px-2 py-2 text-sm font-medium ${key === cfg.product ? "border-[#24332B] bg-[#24332B] text-white" : "border-stone-300 bg-white hover:bg-stone-50"}`}>{p.label}</button>
            ))}
          </div>
        </div>

        <div>
          <div className={label}>{product.indeling}</div>
          <div role="group" aria-label={product.indeling} className="grid max-h-72 grid-cols-3 gap-1.5 overflow-y-auto pr-1">
            {miniaturen.map((m) => (
              <button key={m.key} type="button" aria-pressed={m.key === variant.key} onClick={() => kiesVariant(m.key)} title={m.label}
                className={`flex flex-col items-center rounded-md border p-1.5 text-center text-[11px] leading-tight ${m.key === variant.key ? "border-[#B35B40] bg-[#F4E3DC]" : "border-stone-200 bg-white hover:bg-stone-50"}`}>
                <span className="block w-full rounded bg-[#efebe3]" dangerouslySetInnerHTML={{ __html: m.svg }} />
                <span className="mt-1">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {(["w", "h"] as const).map((k) => {
            const [min, max] = k === "w" ? [product.wMin, product.wMax] : [product.hMin, product.hMax];
            const naam = k === "w" ? "Breedte" : "Hoogte";
            return (
              <div key={k}>
                <label htmlFor={`maat-${k}`} className={label}><span>{naam}</span><span className="font-mono normal-case tracking-normal">mm</span></label>
                <input id={`maat-${k}`} type="number" inputMode="numeric" min={min} max={max} step={10} value={cfg[k]} onChange={(e) => wijzig({ [k]: e.target.valueAsNumber || 0 } as Partial<Configuratie>)} onBlur={(e) => maat(k, e.target.valueAsNumber || min)} className={veld} />
                <input type="range" aria-label={`${naam} (schuifbalk)`} min={min} max={max} step={10} value={cfg[k]} onChange={(e) => maat(k, e.target.valueAsNumber)} className="mt-2 w-full accent-[#B35B40]" />
                <div className="flex justify-between font-mono text-[10px] text-stone-400"><span>{min}</span><span>{max}</span></div>
              </div>
            );
          })}
        </div>

        {bron && (
          <div>
            <div className={label}>
              <span>Per vak</span>
              {aangepast && <button type="button" onClick={() => wijzig({ cols: null })} className="font-medium normal-case tracking-normal text-[#9C4B32] underline">Standaard</button>}
            </div>
            <div className="grid gap-2">
              {vakken.map((t, i) => (
                <label key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-14 shrink-0 text-stone-500">Vak {i + 1}</span>
                  <select value={t} onChange={(e) => zetVak(i, e.target.value)} className={veld} aria-label={`Vak ${i + 1}`}>
                    {regels.vakVolgorde.map((k) => <option key={k} value={k}>{regels.vak[k].label}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}

        <div><div className={label}>Profielsysteem</div><Keuze naam="Profielsysteem" opties={lijst(regels.profielen)} waarde={cfg.profiel} onKies={(k) => wijzig({ profiel: k })} /></div>
        <div><div className={label}>Glas</div><Keuze naam="Glas" opties={lijst(regels.glas)} waarde={cfg.glas} onKies={(k) => wijzig({ glas: k })} /></div>
        <div>
          <div className={label}><span>Kleur</span><span className="font-medium normal-case tracking-normal text-stone-600">{regels.kleuren[cfg.kleur]?.label}</span></div>
          <div role="group" aria-label="Kleur" className="flex flex-wrap gap-2">
            {Object.entries(regels.kleuren).map(([key, k]) => (
              <button key={key} type="button" aria-label={k.label} aria-pressed={key === cfg.kleur} title={k.label} onClick={() => wijzig({ kleur: key })}
                style={{ background: k.frame }} className={`h-8 w-8 rounded-full border-2 ${key === cfg.kleur ? "border-[#B35B40] ring-2 ring-[#F4E3DC]" : "border-stone-300"}`} />
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <span className="shrink-0 text-stone-500">Vleugels</span>
            <select value={cfg.kleurVleugel ?? ""} onChange={(e) => wijzig({ kleurVleugel: e.target.value || null })} className={veld} aria-label="Kleur van de vleugels">
              <option value="">Zelfde kleur als kozijn</option>
              {Object.entries(regels.kleuren).map(([key, k]) => <option key={key} value={key}>{k.label}</option>)}
            </select>
          </label>
        </div>
        <div><div className={label}>Binnenzijde</div><Keuze naam="Binnenzijde" opties={lijst(regels.binnen)} waarde={cfg.binnen} onKies={(k) => wijzig({ binnen: k })} /></div>
        <div><div className={label}>Beslag</div><Keuze naam="Beslag" opties={lijst(regels.beslag)} waarde={cfg.beslag} onKies={(k) => wijzig({ beslag: k })} /></div>
      </div>

      <div className="flex flex-col gap-5 lg:sticky lg:top-4">
        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <div className="rounded-md bg-[#efebe3] p-3">
            <div className="mx-auto max-w-lg" dangerouslySetInnerHTML={{ __html: tekening }} />
          </div>
          <p className="mt-3 text-center text-sm text-stone-600">
            {product.label} · {variant.label} · {cfg.w} × {cfg.h} mm{r ? ` · ${nl(r.m2)} m²` : ""}
          </p>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <label className="text-sm font-medium">Ruimte of omschrijving
              <input name="ruimte" value={ruimte} onChange={(e) => setRuimte(e.target.value)} placeholder="Bijvoorbeeld: Woonkamer voorgevel" maxLength={120} className={`${veld} mt-1`} />
            </label>
            <label className="text-sm font-medium">Aantal
              <input name="aantal" type="number" min={1} max={999} value={aantal} onChange={(e) => setAantal(Math.max(1, Math.min(999, e.target.valueAsNumber || 1)))} className={`${veld} mt-1`} />
            </label>
          </div>

          {berekening.fout && <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{berekening.fout}</p>}
          {r?.waarschuwingen.map((w) => <p key={w} role="status" className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{w}</p>)}

          {r && (
            <>
              <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-stone-200 pt-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Prijs per stuk, incl. btw</div>
                  <div className="text-3xl font-semibold tabular-nums">{euro(r.prijs)}</div>
                </div>
                {aantal > 1 && (
                  <div className="text-right">
                    <div className="text-xs text-stone-500">{aantal} stuks</div>
                    <div className="text-xl font-semibold tabular-nums">{euro(regelTotaal(r.prijs, aantal))}</div>
                  </div>
                )}
              </div>
              <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm text-stone-600">
                <dt>Basis en meerprijs per m²</dt><dd className="font-mono tabular-nums">{euro(r.basis)}</dd>
                <dt>Toeslagen (glas, kleur, indeling, profiel)</dt><dd className="font-mono tabular-nums">× {nl(r.factor)}</dd>
                {r.plafondActief && (<><dt>Prijsplafond van toepassing</dt><dd className="font-mono">ja</dd></>)}
                {r.isde.hoog > 0 && (<><dt>ISDE-subsidie, indicatie</dt><dd className="font-mono tabular-nums">{euro(r.isde.laag)} – {euro(r.isde.hoog)}</dd></>)}
              </dl>
            </>
          )}

          {status.fout && <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{status.fout}</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <button disabled={bezig || !r} className="rounded-md bg-[#B35B40] px-5 py-2.5 font-semibold text-white hover:brightness-110 disabled:opacity-60">{bezig ? "Opslaan…" : "Positie opslaan"}</button>
            <a href={annuleerHref} className="rounded-md border border-stone-300 bg-white px-5 py-2.5 font-semibold hover:bg-stone-50">Annuleren</a>
          </div>
        </div>
      </div>
    </form>
  );
}
