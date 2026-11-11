import { describe, expect, it } from "vitest";
import { isBetaalLink, maakBetaalProvider } from "./provider";

describe("betaallink", () => {
  it("accepteert alleen https zonder spaties", () => {
    expect(isBetaalLink("https://www.mollie.com/checkout/select-method/abc123")).toBe(true);
    expect(isBetaalLink(" https://pay.example/1 ")).toBe(true);
    expect(isBetaalLink("http://pay.example/1")).toBe(false);
    expect(isBetaalLink("javascript:alert(1)")).toBe(false);
    expect(isBetaalLink("https://pay.example/a b")).toBe(false);
    expect(isBetaalLink("https://")).toBe(false);
    expect(isBetaalLink("https://mollie.com@evil.example/x")).toBe(false);
    expect(isBetaalLink('https://pay.example/a"onmouseover="x')).toBe(false);
    expect(isBetaalLink("https://pay.example/<script>")).toBe(false);
    expect(isBetaalLink("https://pay.example/a\\b")).toBe(false);
    expect(isBetaalLink("https://pay.example:8443/pay?id=tr_1&x=2#a")).toBe(true);
    expect(isBetaalLink("x".repeat(10))).toBe(false);
    expect(isBetaalLink(`https://x.nl/${"a".repeat(500)}`)).toBe(false);
  });
});

describe("betaalprovider", () => {
  it("meldt vriendelijk dat de koppeling nog niet verbonden is", async () => {
    const p = maakBetaalProvider("mollie");
    const c = await p.controleer();
    expect(c.ok).toBe(false);
    expect(c.melding).toContain("Mollie");
    await expect(p.maakBetaling({} as never)).rejects.toThrow("nog niet verbonden");
    await expect(p.haalStatus("tr_1")).rejects.toThrow("nog niet verbonden");
  });
});
