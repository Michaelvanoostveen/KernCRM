export const FOTO_BUCKET = "inmeting-fotos";
export const FOTO_MAX_ZIJDE = 1600;

/** Schaalt een afmeting zo dat de langste zijde niet groter wordt dan `max`; een kleinere afbeelding blijft zoals hij is. */
export function schaalAfmeting(breedte: number, hoogte: number, max = FOTO_MAX_ZIJDE): { breedte: number; hoogte: number } {
  const langste = Math.max(breedte, hoogte);
  if (langste <= max || langste <= 0) return { breedte, hoogte };
  const f = max / langste;
  return { breedte: Math.max(1, Math.round(breedte * f)), hoogte: Math.max(1, Math.round(hoogte * f)) };
}

/** Pad van een foto in de opslag: <inmeting-id>/<foto-id>.jpg. */
export const fotoPad = (inmetingId: string, fotoId: string) => `${inmetingId}/${fotoId}.jpg`;

/**
 * Verkleint een foto in de browser tot een JPEG van hooguit 1600 px aan de lange zijde. Telefoonfoto's zijn vaak 5 tot 10 MB;
 * zo blijft uploaden snel, ook met slecht bereik, en blijven de details goed leesbaar.
 */
export async function verkleinFoto(bestand: File): Promise<Blob> {
  const bitmap = await createImageBitmap(bestand, { imageOrientation: "from-image" });
  const { breedte, hoogte } = schaalAfmeting(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = breedte;
  canvas.height = hoogte;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("De foto kon niet worden verwerkt.");
  ctx.drawImage(bitmap, 0, 0, breedte, hoogte);
  bitmap.close();
  const blob = await new Promise<Blob | null>((klaar) => canvas.toBlob(klaar, "image/jpeg", 0.82));
  if (!blob) throw new Error("De foto kon niet worden verwerkt.");
  return blob;
}
