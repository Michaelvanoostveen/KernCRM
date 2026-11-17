import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verstuurMail, type VerzendOpdracht } from "./versturen";

type Rpc = { naam: string; args: Record<string, unknown> };

function nepSupabase(antwoorden: Record<string, unknown>): { client: SupabaseClient; calls: Rpc[] } {
  const calls: Rpc[] = [];
  const client = { rpc: async (naam: string, args: Record<string, unknown>) => { calls.push({ naam, args }); return { data: antwoorden[naam] ?? { ok: true }, error: null }; } } as unknown as SupabaseClient;
  return { client, calls };
}
const afzender = { provider: "resend", actief: true, naam: "KernKozijnen", adres: "info@mail.kernkozijnen.nl", antwoord: "info@kernkozijnen.nl", domein_ok: true };
const opdracht = (o: Partial<VerzendOpdracht> = {}): VerzendOpdracht => ({
  tenantId: "t1", soort: "factuur", factuurId: "f1", aan: "klant@example.nl", bijlagen: [], sleutel: "factuur-f1",
  maakTekst: (b) => ({ onderwerp: "Factuur", tekst: `Groet, ${b}` }), ...o,
});

describe("verstuurMail", () => {
  const oud = process.env.RESEND_API_KEY;
  beforeEach(() => { process.env.RESEND_API_KEY = "re_test"; vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "mail-1" }), { status: 200 }))); });
  afterEach(() => { process.env.RESEND_API_KEY = oud; vi.unstubAllGlobals(); });

  it("verstuurt en legt een geslaagde mail vast in het logboek", async () => {
    const { client, calls } = nepSupabase({ mail_afzender: afzender });
    const uit = await verstuurMail(client, opdracht());
    expect(uit).toEqual({ ok: true, afzenderNaam: "KernKozijnen" });
    expect(calls.map((c) => c.naam)).toEqual(["mail_afzender", "mail_mag_versturen", "mail_log_toevoegen"]);
    expect(calls[2].args).toMatchObject({ p_soort: "factuur", p_status: "verzonden", p_extern_id: "mail-1", p_aan: "klant@example.nl" });
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toBe("Groet, KernKozijnen");
  });
  it("gebruikt voor een offerte de offertefuncties (ook voor verkoop)", async () => {
    const { client, calls } = nepSupabase({ mail_afzender: afzender });
    const uit = await verstuurMail(client, opdracht({ soort: "offerte", offerteId: "o1", factuurId: null }));
    expect(uit.ok).toBe(true);
    expect(calls.map((c) => c.naam)).toEqual(["mail_afzender", "mail_mag_versturen_offerte", "mail_log_offerte_toevoegen"]);
    expect(calls[2].args).toMatchObject({ p_offerte: "o1", p_status: "verzonden" });
  });
  it("verstuurt niets als mailen uitstaat, het domein niet is vrijgegeven of de sleutel ontbreekt", async () => {
    expect(await verstuurMail(nepSupabase({ mail_afzender: { ...afzender, actief: false } }).client, opdracht())).toEqual({ ok: false, code: "mail_niet_actief" });
    expect(await verstuurMail(nepSupabase({ mail_afzender: { ...afzender, domein_ok: false } }).client, opdracht())).toEqual({ ok: false, code: "mail_niet_actief" });
    expect(await verstuurMail(nepSupabase({ mail_afzender: null }).client, opdracht())).toEqual({ ok: false, code: "mail_niet_actief" });
    delete process.env.RESEND_API_KEY;
    expect(await verstuurMail(nepSupabase({ mail_afzender: afzender }).client, opdracht())).toEqual({ ok: false, code: "mail_geen_sleutel" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("meldt de limiet en ontbrekende toegang zonder te verzenden", async () => {
    expect(await verstuurMail(nepSupabase({ mail_afzender: afzender, mail_mag_versturen: { ok: false, fout: "limiet" } }).client, opdracht())).toEqual({ ok: false, code: "mail_limiet" });
    expect(await verstuurMail(nepSupabase({ mail_afzender: afzender, mail_mag_versturen: { ok: false, fout: "geen_toegang" } }).client, opdracht())).toEqual({ ok: false, code: "geen_toegang" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("logt een mislukte verzending als mislukt en geeft mail_mislukt terug", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 })));
    const { client, calls } = nepSupabase({ mail_afzender: afzender });
    expect(await verstuurMail(client, opdracht())).toEqual({ ok: false, code: "mail_mislukt" });
    expect(calls[2].args).toMatchObject({ p_status: "mislukt", p_extern_id: null });
    expect(String(calls[2].args.p_fout)).toContain("domain not verified");
  });
});
