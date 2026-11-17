import { describe, expect, it } from "vitest";
import { afzenderKop, isMailAdres, schoneKop } from "./adres";
import { MailFout, ResendMailProvider, maakMailProvider } from "./provider";
import { beoordeelHerinnering } from "../facturatie/herinnering";

const bericht = { vanNaam: "KernKozijnen", vanAdres: "info@mail.kernkozijnen.nl", aan: "klant@example.nl", antwoordAan: "info@kernkozijnen.nl", onderwerp: "Factuur 2026-0001", tekst: "Hallo", sleutel: "factuur-1" };

describe("adressen en koppen", () => {
  it("accepteert één gewoon adres en weigert rommel", () => {
    expect(isMailAdres("klant@example.nl")).toBe(true);
    expect(isMailAdres(" info+frits@kernkozijnen.nl ")).toBe(true);
    for (const x of ["", "geen", "a@b", "a@b.nl, c@d.nl", "a@b.nl;c@d.nl", "a b@c.nl", "a@b.nl\r\nBcc: x@y.nl", null, undefined]) expect(isMailAdres(x as string), String(x)).toBe(false);
  });
  it("haalt regeleinden uit kopregels en breekbare tekens uit de afzendernaam", () => {
    expect(schoneKop("Onderwerp\r\nBcc: x@y.nl")).toBe("Onderwerp Bcc: x@y.nl");
    expect(afzenderKop('Kern "Kozijnen" <x>', "info@mail.kernkozijnen.nl")).toBe("Kern Kozijnen x <info@mail.kernkozijnen.nl>");
  });
});

describe("Resend", () => {
  const nep = (status: number, body: unknown, opvang?: (url: string, init: RequestInit) => void): typeof fetch =>
    (async (url: string, init: RequestInit) => { opvang?.(url, init); return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;

  it("verstuurt met de juiste kop, afzender, reply-to en bijlage, en geeft de verwijzing terug", async () => {
    let gezien: { url: string; init: RequestInit } | null = null;
    const p = new ResendMailProvider("re_test", nep(200, { id: "abc-123" }, (url, init) => { gezien = { url, init }; }));
    const uit = await p.verstuur({ ...bericht, bijlagen: [{ bestandsnaam: "Factuur.pdf", inhoud: new Uint8Array([37, 80, 68, 70]) }] });
    expect(uit.externId).toBe("abc-123");
    expect(gezien!.url).toBe("https://api.resend.com/emails");
    const h = gezien!.init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer re_test");
    expect(h["Idempotency-Key"]).toBe("factuur-1");
    const body = JSON.parse(gezien!.init.body as string);
    expect(body.from).toBe("KernKozijnen <info@mail.kernkozijnen.nl>");
    expect(body.to).toEqual(["klant@example.nl"]);
    expect(body.reply_to).toBe("info@kernkozijnen.nl");
    expect(body.attachments[0]).toEqual({ filename: "Factuur.pdf", content: Buffer.from("%PDF").toString("base64") });
  });
  it("weigert een ongeldig adres zonder iets te versturen", async () => {
    let aangeroepen = false;
    const p = new ResendMailProvider("re_test", nep(200, { id: "x" }, () => { aangeroepen = true; }));
    await expect(p.verstuur({ ...bericht, aan: "geen adres" })).rejects.toMatchObject({ code: "ongeldig" });
    expect(aangeroepen).toBe(false);
  });
  it("vertaalt fouten van Resend naar duidelijke codes", async () => {
    await expect(new ResendMailProvider("re_x", nep(403, { message: "domain not verified" })).verstuur(bericht)).rejects.toMatchObject({ code: "geweigerd" });
    await expect(new ResendMailProvider("re_x", nep(422, { message: "invalid" })).verstuur(bericht)).rejects.toMatchObject({ code: "ongeldig" });
    await expect(new ResendMailProvider("re_x", nep(500, {})).verstuur(bericht)).rejects.toMatchObject({ code: "dienst" });
    await expect(new ResendMailProvider("re_x", nep(200, {})).verstuur(bericht)).rejects.toMatchObject({ code: "dienst" });
  });
  it("meldt een netwerkfout en een ontbrekende sleutel", async () => {
    const stuk = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    await expect(new ResendMailProvider("re_x", stuk).verstuur(bericht)).rejects.toMatchObject({ code: "netwerk" });
    await expect(new ResendMailProvider("", nep(200, { id: "x" })).verstuur(bericht)).rejects.toBeInstanceOf(MailFout);
  });
  it("weigert te grote bijlagen", async () => {
    await expect(new ResendMailProvider("re_x", nep(200, { id: "x" })).verstuur({ ...bericht, bijlagen: [{ bestandsnaam: "x.pdf", inhoud: new Uint8Array(11 * 1024 * 1024) }] })).rejects.toMatchObject({ code: "ongeldig" });
  });
  it("kiest alleen een aansluiting als er een sleutel is", () => {
    expect(maakMailProvider("resend", "re_x")?.naam).toBe("Resend");
    expect(maakMailProvider("resend", undefined)).toBeNull();
    expect(maakMailProvider("geen", "re_x")).toBeNull();
  });
});

describe("herinnering toegestaan", () => {
  const basis = { status: "open" as const, verzondenOp: "2026-11-01T10:00:00Z", vervaldatum: "2026-11-05", vandaag: "2026-11-10", nu: new Date("2026-11-10T10:00:00Z"), herinneringen: [] as { niveau: number; verstuurd_op: string }[] };
  it("staat de eerste herinnering toe na de vervaldatum", () => expect(beoordeelHerinnering(basis)).toEqual({ ok: true, niveau: 1 }));
  it("weigert voor de vervaldatum, zonder verzending of bij een niet-open factuur", () => {
    expect(beoordeelHerinnering({ ...basis, vervaldatum: "2026-11-10" })).toEqual({ ok: false, fout: "nog_niet_verlopen" });
    expect(beoordeelHerinnering({ ...basis, verzondenOp: null })).toEqual({ ok: false, fout: "niet_verzonden" });
    expect(beoordeelHerinnering({ ...basis, status: "betaald" })).toEqual({ ok: false, fout: "niet_open" });
  });
  it("wacht 7 dagen tussen herinneringen en stopt na drie", () => {
    expect(beoordeelHerinnering({ ...basis, herinneringen: [{ niveau: 1, verstuurd_op: "2026-11-07T10:00:00Z" }] })).toEqual({ ok: false, fout: "te_snel" });
    expect(beoordeelHerinnering({ ...basis, herinneringen: [{ niveau: 1, verstuurd_op: "2026-11-02T10:00:00Z" }] })).toEqual({ ok: true, niveau: 2 });
    expect(beoordeelHerinnering({ ...basis, herinneringen: [{ niveau: 3, verstuurd_op: "2026-10-01T10:00:00Z" }] })).toEqual({ ok: false, fout: "geen_volgende" });
  });
});
