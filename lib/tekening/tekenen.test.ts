import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { REGELS_KERNKOZIJNEN as regels } from "../prijs/regels-kernkozijnen";
import golden from "./tekening.golden.json";
import { effectieveVariant, kozijnSvg, tekenInhoud, type Tekenconfig } from "./tekenen";

const hash = (svg: string) => crypto.createHash("sha256").update(svg).digest("hex").slice(0, 16);

describe("tekening gelijk aan de website-configurator", () => {
  it(`geeft voor alle ${golden.tekeningen.length} gouden configuraties dezelfde SVG`, () => {
    const afwijkend = golden.tekeningen
      .map((g) => ({ g, svg: tekenInhoud(regels, g.cfg as Tekenconfig) }))
      .filter(({ g, svg }) => hash(svg) !== g.hash)
      .map(({ g }) => `${g.cfg.product}/${g.cfg.variant} ${g.cfg.w}x${g.cfg.h}`);
    expect(afwijkend).toEqual([]);
  });

  it("komt voor de eerste voorbeelden letterlijk overeen", () => {
    for (const g of golden.tekeningen.slice(0, 3)) {
      expect((g as { svg?: string }).svg).toBeDefined();
      expect(tekenInhoud(regels, g.cfg as Tekenconfig)).toBe((g as { svg: string }).svg);
    }
  });

  it("dekt alle producten en indelingen", () => {
    const aantal = Object.values(regels.producten).reduce((n, p) => n + p.variants.length, 0);
    expect(golden.tekeningen.length).toBe(aantal * 3);
  });
});

describe("kozijnSvg", () => {
  const cfg: Tekenconfig = { product: "raam", variant: "stolp", w: 1400, h: 1200, kleur: "antraciet" };
  it("levert een complete, toegankelijke svg", () => {
    const svg = kozijnSvg(regels, cfg, 'Pos. 1 "Woonkamer" & keuken');
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"')).toBe(true);
    expect(svg).toContain('role="img"');
    expect(svg).toContain("<title>Pos. 1 &quot;Woonkamer&quot; &amp; keuken</title>");
    expect(svg.endsWith("</svg>")).toBe(true);
  });
  it("tekent een andere vakindeling anders", () => {
    expect(tekenInhoud(regels, { ...cfg, cols: ["fixed", "fixed"] })).not.toBe(tekenInhoud(regels, cfg));
  });
  it("weigert onbekende keuzes", () => {
    expect(() => tekenInhoud(regels, { ...cfg, product: "bestaat-niet" })).toThrow();
    expect(() => tekenInhoud(regels, { ...cfg, kleur: "bestaat-niet" })).toThrow();
    expect(() => tekenInhoud(regels, { ...cfg, w: 0 })).toThrow();
  });
});

describe("effectieveVariant", () => {
  const stolp = regels.producten.raam.variants.find((v) => v.key === "stolp")!;
  it("verliest de stolpnaad als een vleugel vast wordt", () => {
    expect(effectieveVariant(stolp, ["turnR", "fixed"]).stolp).toBe(false);
    expect(effectieveVariant(stolp, ["turnR", "turnL"]).stolp).toBe(true);
  });
  it("laat de variant ongemoeid bij een aantal vakken dat niet klopt", () => {
    expect(effectieveVariant(stolp, ["fixed"])).toBe(stolp);
  });
});
