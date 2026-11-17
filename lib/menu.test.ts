import { describe, expect, it } from "vitest";
import { menuGroepen, menuVoorRol } from "./menu";

const labels = (rol: string | null) => menuVoorRol(rol).map((i) => i.label);

describe("menu per rol", () => {
  it("geeft de directie alles", () => {
    expect(labels("directie")).toEqual(["Start", "Klanten", "Projecten", "Inmeting", "Montage", "Werkbonnen", "Facturen", "Boekhouding", "E-mail", "Catalogus", "Gebruikers"]);
  });
  it("laat verkoop en kantoor facturen en catalogus zien maar niet de gebruikers", () => {
    for (const rol of ["verkoop", "kantoor"]) {
      expect(labels(rol)).toContain("Facturen");
      expect(labels(rol)).toContain("Montage");
      expect(labels(rol)).toContain("Werkbonnen");
      expect(labels(rol).includes("Boekhouding")).toBe(rol === "kantoor");
      expect(labels(rol).includes("E-mail")).toBe(rol === "kantoor");
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
      expect(labels(rol)).not.toContain("Boekhouding");
      expect(labels(rol)).not.toContain("E-mail");
      expect(labels(rol)).not.toContain("Facturen");
      expect(labels(rol)).not.toContain("Klanten");
    }
  });
});

describe("menu in groepen", () => {
  const titels = (rol: string | null) => menuGroepen(rol).map((g) => g.titel);
  const alle = (rol: string | null) => menuGroepen(rol).flatMap((g) => g.items.map((i) => i.label));
  it("deelt de directie in vier groepen onder Start", () => {
    expect(titels("directie")).toEqual([null, "Verkoop", "Uitvoering", "Financieel", "Beheer"]);
    expect(menuGroepen("directie")[0].items.map((i) => i.label)).toEqual(["Start"]);
    expect(menuGroepen("directie")[2].items.map((i) => i.label)).toEqual(["Inmeting", "Montage", "Werkbonnen"]);
  });
  it("laat precies dezelfde onderdelen zien als het platte menu, voor elke rol", () => {
    for (const rol of ["directie", "kantoor", "verkoop", "inmeter", "monteur", "onbekend", null]) expect(alle(rol)).toEqual(menuVoorRol(rol).map((i) => i.label));
  });
  it("laat verkoop wel facturen maar geen boekhouding, e-mail of gebruikers zien", () => {
    expect(alle("verkoop")).toContain("Facturen");
    for (const x of ["Boekhouding", "E-mail", "Gebruikers"]) expect(alle("verkoop")).not.toContain(x);
    expect(menuGroepen("verkoop").find((g) => g.titel === "Beheer")?.items.map((i) => i.label)).toEqual(["Catalogus"]);
  });
  it("geeft een monteur of inmeter één groep zonder titel", () => {
    expect(menuGroepen("monteur")).toEqual([{ titel: null, items: [{ href: "/monteur", label: "Mijn montages" }] }]);
    expect(titels("inmeter")).toEqual([null]);
  });
});
