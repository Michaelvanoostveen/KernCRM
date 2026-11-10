import { describe, expect, it } from "vitest";
import { leesWerkbon, onvolledigeKozijnen, openPunten, regelKlaar, URENSTAPPEN, urenOverzicht, werkbonFotoPad, type Opleverpunt, type WerkbonRegel } from "./werkbon";

const regel = (o: Partial<WerkbonRegel>): WerkbonRegel => ({ positie_id: "p1", geplaatst: false, afgesteld: false, afgekit: false, afgewerkt: false, opmerking: null, ...o });
const punt = (o: Partial<Opleverpunt>): Opleverpunt => ({ id: "x", positie_id: "p1", omschrijving: "kras", status: "open", opgelost_op: null, ...o });

describe("opleverregels", () => {
  it("laat een volledig afgewerkt kozijn door", () => {
    const r = regel({ geplaatst: true, afgesteld: true, afgekit: true, afgewerkt: true });
    expect(regelKlaar(r)).toBe(true);
    expect(onvolledigeKozijnen([r], [])).toBe(0);
  });
  it("eist dat elk kozijn is geplaatst, ook als er een opleverpunt voor staat", () => {
    expect(onvolledigeKozijnen([regel({})], [punt({})])).toBe(1);
  });
  it("accepteert een ontbrekende stap alleen met een open opleverpunt voor dat kozijn", () => {
    const r = regel({ geplaatst: true, afgesteld: true });
    expect(onvolledigeKozijnen([r], [])).toBe(1);
    expect(onvolledigeKozijnen([r], [punt({ positie_id: "p2" })])).toBe(1);
    expect(onvolledigeKozijnen([r], [punt({ status: "opgelost" })])).toBe(1);
    expect(onvolledigeKozijnen([r], [punt({})])).toBe(0);
  });
  it("telt de open opleverpunten", () => {
    expect(openPunten([punt({}), punt({ status: "opgelost" }), punt({})])).toBe(2);
  });
});

describe("uren en gegevens", () => {
  it("telt uren per monteur en in totaal, zonder afrondingsfouten", () => {
    const o = urenOverzicht([
      { monteur: "Frits", monteur_id: "a", datum: "2026-11-10", uren: 7.5, notitie: null },
      { monteur: "Frits", monteur_id: "a", datum: "2026-11-11", uren: 0.1, notitie: null },
      { monteur: "Sem", monteur_id: "b", datum: "2026-11-10", uren: 7.25, notitie: null },
    ]);
    expect(o.perMonteur).toEqual([{ monteur: "Frits", uren: 7.6 }, { monteur: "Sem", uren: 7.25 }]);
    expect(o.totaal).toBe(14.85);
  });
  it("biedt kwartieren aan tot 16 uur", () => {
    expect(URENSTAPPEN[0]).toBe(0.25);
    expect(URENSTAPPEN.at(-1)).toBe(16);
    expect(URENSTAPPEN).toHaveLength(64);
  });
  it("leest een werkbon uit de database en weigert onzin", () => {
    expect(leesWerkbon(null)).toBeNull();
    expect(leesWerkbon({})).toBeNull();
    const w = leesWerkbon({ id: "w", status: "opgeleverd", uren: [{ monteur: "F", monteur_id: "a", datum: "d", uren: "7.50" }] });
    expect(w?.status).toBe("opgeleverd");
    expect(w?.uren[0].uren).toBe(7.5);
    expect(w?.regels).toEqual([]);
  });
  it("maakt het fotopad zoals de database het verwacht", () => {
    const p = werkbonFotoPad("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222");
    expect(p).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);
  });
});
