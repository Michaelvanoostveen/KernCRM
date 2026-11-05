import { describe, expect, it } from "vitest";
import { fotoPad, schaalAfmeting } from "./foto";

describe("foto's", () => {
  it("verkleint een grote foto en houdt de verhouding", () => {
    expect(schaalAfmeting(4000, 3000)).toEqual({ breedte: 1600, hoogte: 1200 });
    expect(schaalAfmeting(3000, 4000)).toEqual({ breedte: 1200, hoogte: 1600 });
  });
  it("laat een kleine foto ongemoeid", () => {
    expect(schaalAfmeting(800, 600)).toEqual({ breedte: 800, hoogte: 600 });
    expect(schaalAfmeting(1600, 1600)).toEqual({ breedte: 1600, hoogte: 1600 });
  });
  it("maakt het pad zoals de database het verwacht", () => {
    const p = fotoPad("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222");
    expect(p).toBe("11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.jpg");
    expect(p).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);
  });
});
