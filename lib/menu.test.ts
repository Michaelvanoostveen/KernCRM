import { describe, expect, it } from "vitest";
import { menuVoorRol } from "./menu";

const labels = (rol: string | null) => menuVoorRol(rol).map((i) => i.label);

describe("menu per rol", () => {
  it("geeft de directie alles", () => {
    expect(labels("directie")).toEqual(["Start", "Klanten", "Projecten", "Inmeting", "Montage", "Werkbonnen", "Facturen", "Catalogus", "Gebruikers"]);
  });
  it("laat verkoop en kantoor facturen en catalogus zien maar niet de gebruikers", () => {
    for (const rol of ["verkoop", "kantoor"]) {
      expect(labels(rol)).toContain("Facturen");
      expect(labels(rol)).toContain("Montage");
      expect(labels(rol)).toContain("Werkbonnen");
      expect(labels(rol)).toContain("Catalogus");
      expect(labels(rol)).not.toContain("Gebruikers");
    }
  });
  it("laat de inmeter alleen de inmetingen zien", () => {
    expect(labels("inmeter")).toEqual(["Inmeting"]);
  });
  it("laat de monteur alleen zijn eigen montages zien", () => {
    expect(labels("monteur")).toEqual(["Mijn montages"]);
  });
  it("geeft een onbekende rol of niemand alleen Start", () => {
    expect(labels("onbekend")).toEqual(["Start"]);
    expect(labels(null)).toEqual(["Start"]);
  });
  it("noemt nooit klantgegevens of facturen aan wie ze niet mag zien", () => {
    for (const rol of ["inmeter", "monteur"]) {
      expect(labels(rol)).not.toContain("Werkbonnen");
      expect(labels(rol)).not.toContain("Facturen");
      expect(labels(rol)).not.toContain("Klanten");
    }
  });
});
