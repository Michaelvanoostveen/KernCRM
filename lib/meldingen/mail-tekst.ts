export type MeldingSoort = "offerte_geopend" | "offerte_akkoord";

/** De mail aan de verkoper (of directie/kantoor) als een klant een offerte opent of ondertekent. `tekst` is de zin uit de melding; `link` wijst naar het project in het CRM. */
export function maakMeldingMail(soort: MeldingSoort, tekst: string, link: string | null, bedrijf: string) {
  const zin = tekst.trim();
  return {
    onderwerp: (soort === "offerte_akkoord" ? "Offerte getekend: " : "Offerte geopend: ") + zin.replace(/\.$/, "").slice(0, 150),
    tekst: [zin, "", ...(link ? [soort === "offerte_akkoord" ? "Open het project om de volgende stap te plannen:" : "Open het project in KernCRM:", link, ""] : ["Open KernCRM om het project te bekijken.", ""]), `Dit is een automatisch bericht van ${bedrijf}. Je kunt deze mail uitzetten bij Meldingen in het CRM.`].join("\n"),
  };
}
