import Link from "next/link";
import Formulier from "./formulier";

export default function NieuweKlant() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/klanten" className="text-sm text-stone-600 underline">&larr; Terug naar klanten</Link>
      <h1 className="mt-3 text-2xl font-semibold">Nieuwe klant</h1>
      <Formulier />
    </main>
  );
}
