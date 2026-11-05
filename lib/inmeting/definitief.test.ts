import { describe, expect, it } from "vitest";
import { REGELS_KERNKOZIJNEN as regels } from "../prijs/regels-kernkozijnen";
import { maakDefinitieveOpdracht } from "./definitief";
import type { Wijziging } from "./wijzigingen";

const kleuren = Object.keys(regels.kleuren);
const basis = { product: "raam", variant: regels.producten.raam.variants[0].key, w: 1200, h: 1200, glas: Object.keys(regels.glas)[0], kleur: kleuren[0], beslag: Object.keys(regels.beslag)[0], binnen: Object.keys(regels.binnen)[0], profiel: Object.keys(regels.profielen)[0], cols: null };
const posities = [{ id: "p1", nummer: 1, ruimte: "Woonkamer", aantal: 2, config: basis }, { id: "p2", nummer: 2, ruimte: null, aantal: 1, config: basis }];
const w = (o: Partial<Wijziging>): Wijziging => ({ id: "w", positie_id: null, soort: "extra", nieuwe_config: null, omschrijving: "x", aantal: 1, meerprijs: 0, status: "akkoord", ...o });

describe("definitieve opdracht", () => {
  it("telt alleen goedgekeurde wijzigingen en extra's", () => {
    const r = maakDefinitieveOpdracht(regels, posities, [
      w({ id: "a", soort: "configuratie", positie_id: "p1", nieuwe_config: { ...basis, kleur: kleuren[1] }, meerprijs: 150.5 }),
      w({ id: "b", soort: "extra", omschrijving: "Raamdorpel", aantal: 2, positie_id: "p2", meerprijs: 121 }),
      w({ id: "c", soort: "extra", status: "voorgesteld", meerprijs: 999 }),
      w({ id: "d", soort: "extra", status: "vervallen", meerprijs: 999 }),
    ]);
    expect(r.meerwerk).toBe(271.5);
    expect(r.gewijzigd).toHaveLength(1);
    expect(r.gewijzigd[0]).toMatchObject({ nummer: 1, aantal: 2, meerprijs: 150.5 });
    expect(r.gewijzigd[0].wijziging).toContain("kleur");
    expect(r.extras).toEqual([{ id: "b", omschrijving: "Raamdorpel", aantal: 2, positieNummer: 2, meerprijs: 121 }]);
  });

  it("geeft niets terug zonder goedgekeurde wijzigingen", () => {
    const r = maakDefinitieveOpdracht(regels, posities, [w({ status: "voorgesteld", meerprijs: 50 })]);
    expect(r).toEqual({ gewijzigd: [], extras: [], meerwerk: 0 });
  });

  it("slaat een onleesbare configuratie over zonder te crashen", () => {
    const r = maakDefinitieveOpdracht(regels, posities, [w({ soort: "configuratie", positie_id: "p1", nieuwe_config: { kapot: true }, meerprijs: 10 })]);
    expect(r.gewijzigd).toHaveLength(0);
    expect(r.meerwerk).toBe(10);
  });
});
