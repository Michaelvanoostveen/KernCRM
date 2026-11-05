const AANHEF: Record<string, string> = { dhr: "heer", mevr: "mevrouw" };

/** Concepttekst voor de mail aan de klant. Tot de koppeling met Microsoft 365 er is, kopieert de verkoper deze tekst. */
export function maakMail(o: { aanhef: string | null; achternaam: string | null; klantNaam: string; nummer: string; versie: number; geldigTot: string | null; adres: string; link: string; bedrijf: string }) {
  const geldig = o.geldigTot ? new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(new Date(o.geldigTot)) : null;
  return {
    onderwerp: `Uw offerte ${o.nummer} voor ${o.adres}`,
    tekst: [
      `Beste ${AANHEF[o.aanhef ?? ""] ?? "heer/mevrouw"} ${o.achternaam ?? o.klantNaam},`,
      "",
      "Hartelijk dank voor uw interesse in kunststof kozijnen. Via onderstaande link opent u uw offerte. Daar ziet u alle kozijnen met tekening en kunt u akkoord geven met uw handtekening.",
      "",
      o.link,
      "",
      geldig ? `De offerte is geldig tot ${geldig}. Heeft u vragen, dan hoort u het graag.` : "Heeft u vragen, dan hoort u het graag.",
      "",
      "Met vriendelijke groet,",
      o.bedrijf,
    ].join("\n"),
  };
}
