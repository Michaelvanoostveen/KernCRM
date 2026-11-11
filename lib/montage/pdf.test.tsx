import { describe, expect, it } from "vitest";
import { REGELS_KERNKOZIJNEN as regels } from "../prijs/regels-kernkozijnen";
import { maakWerkbonPdf, type WerkbonPdfGegevens } from "./pdf";
import { kiesPdfFotos, werkbonBestandsnaam, type Werkbon, type WerkbonFoto } from "./werkbon";

// Een heel klein PNG-plaatje (1 x 1 pixel) om het insluiten van afbeeldingen te testen.
const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const png = new Uint8Array(Buffer.from(PIXEL, "base64"));
const cfg = { product: "raam", variant: regels.producten.raam.variants[0].key, w: 1200, h: 1000, glas: Object.keys(regels.glas)[0], kleur: Object.keys(regels.kleuren)[0], beslag: Object.keys(regels.beslag)[0], binnen: Object.keys(regels.binnen)[0], profiel: Object.keys(regels.profielen)[0], cols: null };

const werkbon = (o: Partial<Werkbon> = {}): Werkbon => ({
  id: "w", status: "opgeleverd", bijzonderheden: "Klant wil nog een rolluik.\nGraag terugbellen.", kantoor_actie: true, opgeruimd: true, kantoor_gezien_op: null, opgeleverd_op: "2026-11-10T14:30:00Z",
  regels: [{ positie_id: "p1", geplaatst: true, afgesteld: true, afgekit: true, afgewerkt: false, opmerking: "Dagkant scheef ✓" }],
  uren: [{ monteur: "Frits", monteur_id: "a", datum: "2026-11-10", uren: 7.5, notitie: null }, { monteur: "Angelo", monteur_id: "b", datum: "2026-11-10", uren: 7.5, notitie: null }],
  fotos: [], meerwerk: [], punten: [{ id: "x", positie_id: "p1", omschrijving: "Binnenkant nog afwerken", status: "open", opgelost_op: null }],
  akkoord: { naam: "Jan Jansen", op: "2026-11-10T14:30:00Z", met_voorbehoud: true, aantal_open_punten: 1 }, ...o,
});
const gegevens = (o: Partial<WerkbonPdfGegevens> = {}): WerkbonPdfGegevens => ({
  werkbon: werkbon(), klantNaam: "Jan Jansen", adresRegels: ["Voorbeeldstraat 1", "7551 AB Hengelo"], projectNummer: "2026-0003", projectNaam: "Kozijnen Voorbeeldstraat 1",
  ploeg: "Ploeg 1", collegas: ["Angelo", "Frits"], startDatum: "2026-11-10", eindDatum: "2026-11-11",
  kozijnen: [{ positieId: "p1", nummer: 1, ruimte: "Woonkamer", aantal: 2, config: cfg, gewijzigd: true, maten: { bestel: "1200 × 1000 mm", binnen: "1190 × 990 mm", buiten: null, opmerking: "scheve dagkant" }, regel: { geplaatst: true, afgesteld: true, afgekit: true, afgewerkt: false, opmerking: "Dagkant scheef ✓" }, fotosNa: [png, png] }],
  extras: [{ omschrijving: "Raamdorpel", aantal: 2, kozijn: "p1" }], puntFotos: [png], handtekening: `data:image/png;base64,${PIXEL}`, ...o,
});

describe("werkbon-pdf", () => {
  it("maakt een geldig PDF-bestand met foto's en handtekening", async () => {
    const pdf = await maakWerkbonPdf(gegevens());
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(3000);
  }, 30_000);

  it("maakt ook een PDF van een werkbon die nog niet is opgeleverd, zonder foto's en zonder handtekening", async () => {
    const pdf = await maakWerkbonPdf(gegevens({
      werkbon: werkbon({ status: "open", akkoord: null, opgeleverd_op: null, bijzonderheden: null, uren: [], punten: [] }),
      kozijnen: [{ positieId: "p1", nummer: 1, ruimte: null, aantal: 1, config: cfg, gewijzigd: false, maten: { bestel: null, binnen: null, buiten: null, opmerking: null }, regel: null, fotosNa: [] }],
      extras: [], puntFotos: [], handtekening: null,
    }));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);

  it("neemt goedgekeurd meerwerk op in de PDF", async () => {
    const pdf = await maakWerkbonPdf(gegevens({ werkbon: werkbon({ meerwerk: [{ id: "m", positie_id: "p1", omschrijving: "Vensterbank", aantal: 2, meerprijs: 242, status: "akkoord" }] }) }));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
  it("gaat niet kapot op een onleesbare configuratie", async () => {
    const pdf = await maakWerkbonPdf(gegevens({ kozijnen: [{ ...gegevens().kozijnen[0], config: { kapot: true } }] }));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);
});

describe("foto's in de PDF", () => {
  const foto = (id: string, soort: WerkbonFoto["soort"], positie: string | null): WerkbonFoto => ({ id, soort, positie_id: positie, pad: `m/${id}.jpg` });
  it("kiest hooguit drie foto's na per kozijn en zes bij opleverpunten, en geen foto's van voor", () => {
    const fotos = [
      foto("1", "na", "p1"), foto("2", "na", "p1"), foto("3", "na", "p1"), foto("4", "na", "p1"), foto("5", "voor", "p1"), foto("6", "na", "p2"),
      ...Array.from({ length: 8 }, (_, i) => foto(`punt${i}`, "punt", null)), foto("o", "overig", null),
    ];
    const k = kiesPdfFotos(fotos, ["p1", "p2", "p3"]);
    expect(k.perKozijn.get("p1")!.map((f) => f.id)).toEqual(["1", "2", "3"]);
    expect(k.perKozijn.get("p2")!.map((f) => f.id)).toEqual(["6"]);
    expect(k.perKozijn.get("p3")).toEqual([]);
    expect(k.punten).toHaveLength(6);
  });
  it("maakt een veilige bestandsnaam", () => {
    expect(werkbonBestandsnaam("2026-0003")).toBe("Werkbon-2026-0003.pdf");
    expect(werkbonBestandsnaam("../x y")).toBe("Werkbon-..-x-y.pdf");
  });
});
