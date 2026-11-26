import { describe, expect, it } from "vitest";
import { BEZORG_LABEL, besteGebeurtenis, IS_PROBLEEM, probleemUitleg, type BezorgEvent } from "./bezorging";

const e = (soort: BezorgEvent["soort"], opgetreden: string, detail: string | null = null): BezorgEvent => ({ soort, opgetreden, detail });

describe("bezorgstatus", () => {
  it("geeft niets terug zolang er geen melding is", () => expect(besteGebeurtenis([])).toBeNull());
  it("neemt de zwaarste gebeurtenis, ongeacht de volgorde", () => {
    expect(besteGebeurtenis([e("verzonden", "2026-11-24T10:00:00Z"), e("bezorgd", "2026-11-24T10:00:05Z")])?.soort).toBe("bezorgd");
    expect(besteGebeurtenis([e("bezorgd", "2026-11-24T10:00:05Z"), e("verzonden", "2026-11-24T10:00:00Z")])?.soort).toBe("bezorgd");
    expect(besteGebeurtenis([e("vertraagd", "2026-11-24T10:00:00Z"), e("teruggekaatst", "2026-11-24T10:05:00Z", "550 geen mailbox")])).toMatchObject({ soort: "teruggekaatst", detail: "550 geen mailbox" });
  });
  it("laat een klacht zwaarder wegen dan bezorgd", () => {
    expect(besteGebeurtenis([e("bezorgd", "2026-11-24T10:00:00Z"), e("klacht", "2026-11-25T08:00:00Z")])?.soort).toBe("klacht");
  });
  it("kiest bij gelijke zwaarte de nieuwste", () => {
    expect(besteGebeurtenis([e("teruggekaatst", "2026-11-24T10:00:00Z", "eerste"), e("teruggekaatst", "2026-11-24T11:00:00Z", "tweede")])?.detail).toBe("tweede");
  });
  it("herkent problemen en geeft er uitleg bij", () => {
    for (const s of ["teruggekaatst", "klacht", "mislukt", "geblokkeerd"] as const) {
      expect(IS_PROBLEEM(s)).toBe(true);
      expect(probleemUitleg(s).length).toBeGreaterThan(20);
    }
    for (const s of ["verzonden", "bezorgd", "vertraagd", null, undefined] as const) expect(IS_PROBLEEM(s)).toBe(false);
    expect(probleemUitleg("bezorgd")).toBe("");
  });
  it("heeft een label voor elke status", () => {
    for (const s of ["onderweg", "verzonden", "bezorgd", "vertraagd", "teruggekaatst", "klacht", "mislukt", "geblokkeerd"] as const) expect(BEZORG_LABEL[s].label.length).toBeGreaterThan(2);
  });
});
