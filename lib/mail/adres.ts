const EMAIL = /^[a-z0-9._+-]+@[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i;

/** Is dit een bruikbaar e-mailadres? Eén adres, geen spaties, geen komma's of puntkomma's, geen regeleinden. */
export const isMailAdres = (adres: string | null | undefined): adres is string => !!adres && adres.length <= 200 && EMAIL.test(adres.trim());

/** Haalt regeleinden en tekens weg die in een mailkop niet horen (tegen het inspuiten van extra kopregels). */
export const schoneKop = (tekst: string): string => tekst.replace(/[\r\n\0]+/g, " ").trim();

/** De afzender zoals mailprogramma's hem tonen: "Naam <adres>". Tekens die de kop zouden breken, vallen weg uit de naam. */
export const afzenderKop = (naam: string, adres: string): string => `${schoneKop(naam).replace(/[<>",;]/g, "")} <${adres.trim()}>`;
