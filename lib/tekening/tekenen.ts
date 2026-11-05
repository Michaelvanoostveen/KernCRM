import type { Prijsregels, Variant } from "../prijs/types";

// Statische kozijntekening (vooraanzicht) in SVG. Overgenomen uit de website-configurator
// (buildSVG, drawWindow, drawDoor, drawSlider, drawFrench), zonder de werking-animatie.
// De uitvoer is gelijk aan die van de website; dat wordt in de tests per configuratie gecontroleerd.

type Kleur = { label?: string; mult?: number; frame: string; stroke: string };

const GLASSFILL = "#d4e3ec";
const GLASSO = 1;
const HANDLE = "#b9933f";

/** Profielgeometrie Schüco LivIng 82. Zichtbare aanzichtbreedtes in mm. */
export const PROFIEL_SCHUCO = { system: "Schüco LivIng 82", depth: 82, frameFace: 48, sashFace: 53, bead: 16, fixedBead: 20, post: 94, radius: 2 };

type Profiel = { frame: number; sash: number; bead: number; fixedBead: number; post: number; rad: number; fr: number };

function profilePx(pxPerMm: number): Profiel {
  const q = (mm: number, min: number) => Math.max(min, mm * pxPerMm);
  const f = q(PROFIEL_SCHUCO.frameFace, 2.2);
  const sa = q(PROFIEL_SCHUCO.sashFace, 1.8);
  const be = q(PROFIEL_SCHUCO.bead, 0.9);
  return { frame: f, sash: sa, bead: be, fixedBead: q(PROFIEL_SCHUCO.fixedBead, 1.2), post: q(PROFIEL_SCHUCO.post, 2.6), rad: q(PROFIEL_SCHUCO.radius, 0.4), fr: f + sa + be };
}

function profileFallback(fr: number): Profiel {
  return { frame: fr * 0.41, sash: fr * 0.45, bead: fr * 0.14, fixedBead: fr * 0.3, post: fr, rad: fr * 0.06, fr };
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const R = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255;
  const m = (c: number) => Math.max(0, Math.min(255, Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f)));
  return "#" + ((1 << 24) + (m(R) << 16) + (m(G) << 8) + m(B)).toString(16).slice(1);
}

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

/** Tint die altijd afsteekt tegen de basiskleur: donkerder bij lichte RAL's, lichter bij donkere. */
function contrastTint(hex: string, amount: number): string {
  return shade(hex, lum(hex) > 96 ? -amount : amount * 0.85);
}

const f1 = (n: number) => n.toFixed(1);

function r(x: number, y: number, w: number, h: number, fill: string, st?: string | null, sw?: number): string {
  return `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${fill}"${st ? ` stroke="${st}" stroke-width="${sw || 1}"` : ""}/>`;
}

function rr(x: number, y: number, w: number, h: number, fill: string, st: string | null | undefined, sw: number | undefined, rad: number): string {
  return `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${(rad || 0).toFixed(2)}" fill="${fill}"${st ? ` stroke="${st}" stroke-width="${sw || 1}"` : ""}/>`;
}

function glass(x: number, y: number, w: number, h: number): string {
  return `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${GLASSFILL}" fill-opacity="${GLASSO}"/>`;
}

/** Openingssymbool per vaktype. De punt van de driehoek is de kruk; het scharnier zit aan de andere kant. */
function sym(t: string | undefined, x: number, y: number, w: number, h: number): string {
  const cy = y + h / 2;
  const sw = Math.max(0.7, Math.min(w, h) * 0.013);
  const o = 0.7;
  const c = "#4a6172";
  const L = (x1: number, y1: number, x2: number, y2: number) => `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${c}" stroke-width="${sw.toFixed(2)}" opacity="${o}"/>`;
  const T = (x: number, y: number, w: number, h: number) => L(x, y + h, x + w / 2, y) + L(x + w, y + h, x + w / 2, y);
  if (t === "turnR") return L(x, y, x + w, cy) + L(x, y + h, x + w, cy);
  if (t === "turnL") return L(x + w, y, x, cy) + L(x + w, y + h, x, cy);
  if (t === "tilt") return T(x, y, w, h);
  if (t === "tiltturn") return L(x + w, y, x, cy) + L(x + w, y + h, x, cy) + T(x, y, w, h);
  if (t === "tiltturnR") return L(x, y, x + w, cy) + L(x, y + h, x + w, cy) + T(x, y, w, h);
  return "";
}

function beadGlass(x: number, y: number, w: number, h: number, col: Kleur, P: Profiel): string {
  const s = rr(x, y, w, h, contrastTint(col.frame, 0.12), null, 0, P.rad * 0.7);
  const b = P.bead;
  x += b; y += b; w -= 2 * b; h -= 2 * b;
  return w <= 0.5 || h <= 0.5 ? s : s + glass(x, y, w, h);
}

/** Eén vak volgens de LivIng-opbouw: vleugel, glaslat, glas. Vast glas heeft geen vleugel. */
function livPane(t: string | undefined, x: number, y: number, w: number, h: number, col: Kleur, P: Profiel, cv?: Kleur): string {
  const open = !!(t && t !== "fixed");
  let s = "";
  const cc = open ? cv || col : col;
  if (open) {
    s += rr(x, y, w, h, cc.frame, cc.stroke, 0.7, P.rad);
    x += P.sash; y += P.sash; w -= 2 * P.sash; h -= 2 * P.sash;
    if (w <= 0.5 || h <= 0.5) return s;
  }
  const bd = open ? P.bead : P.fixedBead;
  s += rr(x, y, w, h, contrastTint(cc.frame, 0.12), null, 0, P.rad * 0.7);
  x += bd; y += bd; w -= 2 * bd; h -= 2 * bd;
  if (w <= 0.5 || h <= 0.5) return s;
  return s + glass(x, y, w, h) + sym(t, x, y, w, h);
}

type Maten = number[] | null | undefined;

function drawWindow(v: Variant, bx: number, by: number, bw: number, bh: number, col: Kleur, colW: Maten, rowH: Maten, P: Profiel, cv: Kleur): string {
  let s = r(bx, by, bw, bh, col.frame, col.stroke, 1.5);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

  function contentRow(rx: number, ry: number, rw: number, rh: number, cols: string[], cwArr: Maten): string {
    const n = cols.length, gx = rx + P.frame, gy = ry + P.frame, gw = rw - 2 * P.frame, gh = rh - 2 * P.frame;
    const half = v.stolp ? 0 : P.post * 0.5;
    const ws = cwArr && cwArr.length === n ? cwArr : null;
    const tot = ws ? sum(ws) : n;
    let px = gx, out = "";
    for (let i = 0; i < n; i++) {
      const pw = ws ? (gw * ws[i]) / tot : gw / n;
      const ix0 = px + (i > 0 ? half : 0), iw = pw - (i > 0 ? half : 0) - (i < n - 1 ? half : 0);
      out += livPane(cols[i], ix0, gy, iw, gh, col, P, cv);
      if (i < n - 1 && !v.stolp) out += r(px + pw - half, ry, P.post, rh, col.frame);
      px += pw;
    }
    return out;
  }

  if (v.grid) {
    const R = v.grid.r, C = v.grid.c;
    const rws = rowH && rowH.length === R ? rowH : null, rtot = rws ? sum(rws) : R;
    const cws = colW && colW.length === C ? colW : null, ctot = cws ? sum(cws) : C;
    let yy = by;
    for (let ri = 0; ri < R; ri++) {
      const rH = rws ? (rws[ri] / rtot) * bh : bh / R;
      let xx = bx;
      for (let ci = 0; ci < C; ci++) {
        const cW = cws ? (cws[ci] / ctot) * bw : bw / C;
        s += livPane("fixed", xx + P.frame, yy + P.frame, cW - 2 * P.frame, rH - 2 * P.frame, col, P);
        xx += cW;
      }
      if (ri < R - 1) s += r(bx, yy + rH - P.post * 0.4, bw, P.post * 0.8, col.frame);
      yy += rH;
    }
    let xx2 = bx;
    for (let cj = 1; cj < C; cj++) {
      xx2 += cws ? (cws[cj - 1] / ctot) * bw : bw / C;
      s += r(xx2 - P.post * 0.4, by, P.post * 0.8, bh, col.frame);
    }
    return s;
  }

  if (v.stack) {
    const m = v.stack.length, rws3 = rowH && rowH.length === m ? rowH : null, rtot3 = rws3 ? sum(rws3) : m;
    let yy3 = by;
    for (let k = 0; k < m; k++) {
      const rH3 = rws3 ? (rws3[k] / rtot3) * bh : bh / m;
      const px3 = bx + P.frame, py3 = yy3 + P.frame, pw3 = bw - 2 * P.frame, ph3 = rH3 - 2 * P.frame;
      s += livPane(v.stack[k], px3, py3, pw3, ph3, col, P, cv);
      if (k < m - 1) s += r(bx, yy3 + rH3 - P.post * 0.5, bw, P.post, col.frame);
      yy3 += rH3;
    }
    return s;
  }

  const rowTypes: string[] = [];
  if (v.topLight) rowTypes.push("top");
  rowTypes.push("main");
  if (v.bottomLight) rowTypes.push("bottom");
  const nr = rowTypes.length;
  const rprop = rowH && rowH.length === nr ? rowH : rowTypes.map((t) => (t === "main" ? 3 : t === "top" ? 0.9 : 1.05));
  const rsum = sum(rprop);
  let yy4 = by;
  for (let ti = 0; ti < nr; ti++) {
    const rH4 = (rprop[ti] / rsum) * bh, t = rowTypes[ti];
    if (t === "main") s += contentRow(bx, yy4, bw, rH4, v.cols ?? [], colW);
    else s += livPane("fixed", bx + P.frame, yy4 + P.frame, bw - 2 * P.frame, rH4 - 2 * P.frame, col, P);
    if (ti < nr - 1) s += r(bx, yy4 + rH4 - P.post * 0.5, bw, P.post, col.frame);
    yy4 += rH4;
  }
  return s;
}

function drawDoor(v: Variant, bx: number, by: number, bw: number, bh: number, col: Kleur, colW: Maten, rowH: Maten, P: Profiel, cv: Kleur): string {
  let s = r(bx, by, bw, bh, col.frame, col.stroke, 1.5);
  const nL = v.nL != null ? v.nL : v.sideL ? 1 : 0;
  const nR = v.nR != null ? v.nR : v.sideR ? 1 : 0;
  const top = !!v.top, blade = v.blade || "panel", borst = !!v.sideBorst;
  const nCols = nL + 1 + nR, doorIdx = nL;
  let widths: number[];
  if (colW && colW.length === nCols) {
    const tot = colW.reduce((a, b) => a + b, 0);
    widths = colW.map((x) => (bw * x) / tot);
  } else {
    const sideW = nL >= 2 || nR >= 2 ? bw * 0.15 : bw * 0.2;
    widths = [];
    for (let i = 0; i < nCols; i++) widths.push(i === doorIdx ? bw - (nL + nR) * sideW : sideW);
  }
  const topH = top ? (rowH && rowH.length === 2 ? (bh * rowH[0]) / (rowH[0] + rowH[1]) : bh * 0.15) : 0;
  let x = bx;
  for (let i = 0; i < nCols; i++) {
    const cw = widths[i];
    if (i === doorIdx) {
      if (top) {
        s += livPane("fixed", x + P.frame, by + P.frame, cw - 2 * P.frame, topH - P.frame - P.post * 0.5, col, P);
        s += r(x, by + topH - P.post * 0.5, cw, P.post, col.frame);
      }
      const px = x + P.frame, py = by + topH + P.frame, pw = cw - 2 * P.frame, ph = bh - topH - 2 * P.frame;
      let bl = rr(px, py, pw, ph, cv.frame, cv.stroke, 0.8, P.rad);
      if (blade === "glassStrip") bl += beadGlass(px + pw * 0.58, py + ph * 0.06, pw * 0.32, ph * 0.88, cv, P);
      else if (blade === "halfglass") bl += beadGlass(px + pw * 0.12, py + ph * 0.06, pw * 0.76, ph * 0.42, cv, P);
      else if (blade === "fullglass") bl += beadGlass(px + pw * 0.12, py + ph * 0.06, pw * 0.76, ph * 0.88, cv, P);
      else {
        bl += rr(px + pw * 0.18, py + ph * 0.1, pw * 0.64, ph * 0.34, "none", cv.stroke, 1, P.rad);
        bl += rr(px + pw * 0.18, py + ph * 0.54, pw * 0.64, ph * 0.34, "none", cv.stroke, 1, P.rad);
      }
      bl += `<circle cx="${f1(px + pw * 0.14)}" cy="${f1(py + ph * 0.52)}" r="2.4" fill="${HANDLE}"/>`;
      s += bl;
    } else {
      const oy = by + P.frame, oh = bh - 2 * P.frame, gh = borst ? oh * 0.64 : oh;
      s += livPane("fixed", x + P.frame * 0.5, oy, cw - P.frame, gh, col, P);
      if (borst) s += rr(x + P.frame * 0.5, oy + gh + P.post * 0.4, cw - P.frame, oh - gh - P.post * 0.4, col.frame, col.stroke, 0.8, P.rad);
    }
    if (i < nCols - 1) s += r(x + cw - P.post * 0.5, by, P.post, bh, col.frame);
    x += cw;
  }
  return s;
}

function drawSlider(v: Variant, bx: number, by: number, bw: number, bh: number, col: Kleur, P: Profiel, cv: Kleur): string {
  let s = r(bx, by, bw, bh, col.frame, col.stroke, 1.5);
  const gx = bx + P.frame, gy = by + P.frame, gw = bw - 2 * P.frame, gh = bh - 2 * P.frame, n = v.panels || 2;
  const pw = gw / n;
  const hh = v.hef ? gh * 0.22 : gh * 0.1, hw = v.hef ? 3.2 : 2;
  for (let i = 0; i < n; i++) {
    const lx = gx + i * pw;
    s += livPane("slide", lx, gy, pw, gh, col, P, cv) + r(lx + pw * 0.5 - hw / 2, gy + gh * 0.42, hw, hh, cv.frame);
  }
  return s;
}

function drawFrench(v: Variant, bx: number, by: number, bw: number, bh: number, col: Kleur, P: Profiel, cv: Kleur): string {
  let s = r(bx, by, bw, bh, col.frame, col.stroke, 1.5);
  const top = !!v.top, borst = !!v.borst, topH = top ? bh * 0.13 : 0;
  if (top) {
    s += livPane("fixed", bx + P.frame, by + P.frame, bw - 2 * P.frame, topH - P.frame - P.post * 0.5, col, P);
    s += r(bx, by + topH - P.post * 0.5, bw, P.post, col.frame);
  }
  const ay = by + topH, aH = bh - topH;
  let dx = bx, dw = bw, sw = 0;
  if (v.sidelights) {
    sw = bw * 0.16;
    const sy = ay + P.frame, sh0 = aH - 2 * P.frame, sgh = borst ? sh0 * 0.64 : sh0;
    [bx + P.frame * 0.5, bx + bw - sw + P.frame * 0.25].forEach((lx0) => {
      s += livPane("fixed", lx0, sy, sw - P.frame * 0.75, sgh, col, P);
      if (borst) s += rr(lx0, sy + sgh + P.post * 0.35, sw - P.frame * 0.75, sh0 - sgh - P.post * 0.35, col.frame, col.stroke, 0.8, P.rad);
    });
    s += r(bx + sw, ay, P.post, aH, col.frame) + r(bx + bw - sw - P.post, ay, P.post, aH, col.frame);
    dx = bx + sw;
    dw = bw - 2 * sw;
  }
  const gx = dx + P.frame, gy = ay + P.frame, gw = dw - 2 * P.frame, gh = aH - 2 * P.frame, lw = gw / 2;
  const cy = ay + aH * 0.52;
  const leaf = (lx: number, hx: number) => {
    let out = rr(lx, gy, lw, gh, cv.frame, cv.stroke, 0.7, P.rad);
    const ix = lx + P.sash, iy = gy + P.sash, iw = lw - 2 * P.sash, ih = gh - 2 * P.sash;
    if (iw > 0.5 && ih > 0.5) {
      if (borst) out += beadGlass(ix, iy, iw, ih * 0.7, cv, P) + rr(ix, iy + ih * 0.74, iw, ih * 0.26, cv.frame, cv.stroke, 0.8, P.rad);
      else out += beadGlass(ix, iy, iw, ih, cv, P);
    }
    return out + `<circle cx="${f1(hx)}" cy="${f1(cy)}" r="2.2" fill="${HANDLE}"/>`;
  };
  const hL = gx + lw - P.sash * 1.3, hR = gx + lw + P.sash * 1.3;
  return s + leaf(gx, hL) + leaf(gx + lw, hR);
}

/** Tekent in een viewBox van 200 x 200; `ratio` is breedte/hoogte, `wMm` de breedte in mm voor profielen op ware schaal. */
function buildSVG(kind: string, v: Variant, ratio: number, col: Kleur, colW: Maten, rowH: Maten, wMm: number, cv?: Kleur): string {
  const maxW = 172, maxH = 172;
  let vw: number, vh: number;
  if (ratio >= 1) { vw = maxW; vh = maxW / ratio; } else { vh = maxH; vw = maxH * ratio; }
  if (vh > maxH) { vh = maxH; vw = maxH * ratio; }
  if (vw > maxW) { vw = maxW; vh = maxW / ratio; }
  const x = (200 - vw) / 2, y = (200 - vh) / 2;
  const P = wMm ? profilePx(vw / wMm) : profileFallback(Math.max(5, vw * 0.055));
  const cvk = cv || col;
  if (kind === "window") return drawWindow(v, x, y, vw, vh, col, colW, rowH, P, cvk);
  if (kind === "door") return drawDoor(v, x, y, vw, vh, col, colW, rowH, P, cvk);
  if (kind === "slider") return drawSlider(v, x, y, vw, vh, col, P, cvk);
  if (kind === "french") return drawFrench(v, x, y, vw, vh, col, P, cvk);
  return "";
}

export interface Tekenconfig {
  product: string;
  variant: string;
  w: number;
  h: number;
  kleur: string;
  kleurVleugel?: string | null;
  /** Aangepaste vaktypes per kolom (bij ramen). */
  cols?: string[] | null;
  /** Eigen vakbreedtes in mm of als verhouding. Moet even lang zijn als het aantal vakken. */
  kolombreedtes?: number[] | null;
  /** Eigen rijhoogtes in mm of als verhouding. */
  rijhoogtes?: number[] | null;
  /** Voor kleine keuzetegels: profielen in een vaste verhouding in plaats van op ware schaal. */
  miniatuur?: boolean;
}

/** De variant met de gekozen vaktypes erin; een stolpraam zonder twee draaiende vleugels heeft geen stolpnaad. */
export function effectieveVariant(variant: Variant, cols?: string[] | null): Variant {
  const bron = variant.cols ? "cols" : variant.stack ? "stack" : null;
  if (!cols || !bron || cols.length !== (variant[bron] as string[]).length) return variant;
  const kopie: Variant = { ...variant, [bron]: cols.slice() };
  if (kopie.stolp && !(cols.length === 2 && cols.every((t) => t !== "fixed"))) kopie.stolp = false;
  return kopie;
}

/** Binnenwerk van de tekening (zonder <svg>), voor een viewBox van 0 0 200 200. */
export function tekenInhoud(regels: Prijsregels, cfg: Tekenconfig): string {
  const product = regels.producten[cfg.product];
  if (!product) throw new Error(`Onbekend product: "${cfg.product}".`);
  const variant = product.variants.find((v) => v.key === cfg.variant);
  if (!variant) throw new Error(`Onbekende indeling "${cfg.variant}" voor ${product.label}.`);
  const kozijn = regels.kleuren[cfg.kleur];
  if (!kozijn) throw new Error(`Onbekende kleur: "${cfg.kleur}".`);
  const tweede = cfg.kleurVleugel && cfg.kleurVleugel !== "zelfde" && cfg.kleurVleugel !== cfg.kleur ? regels.kleuren[cfg.kleurVleugel] : undefined;
  if (!(cfg.w > 0 && cfg.h > 0)) throw new Error("Breedte en hoogte moeten groter dan 0 zijn.");
  return buildSVG(product.kind, effectieveVariant(variant, cfg.cols), cfg.w / cfg.h, kozijn, cfg.kolombreedtes, cfg.rijhoogtes, cfg.miniatuur ? 0 : cfg.w, tweede ?? kozijn);
}

/** Volledige <svg> voor een positie, klaar voor op het scherm, in de offerte of in een PDF. */
export function kozijnSvg(regels: Prijsregels, cfg: Tekenconfig, titel?: string): string {
  const t = titel ? `<title>${titel.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string)}</title>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" role="img">${t}${tekenInhoud(regels, cfg)}</svg>`;
}
