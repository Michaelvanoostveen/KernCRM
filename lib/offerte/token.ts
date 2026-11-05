import { randomBytes } from "node:crypto";

/** Geheime sleutel voor de link naar de online offerte: 256 bits, niet te raden. */
export function maakToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isGeldigeToken(t: unknown): t is string {
  return typeof t === "string" && /^[A-Za-z0-9_-]{32,64}$/.test(t);
}
