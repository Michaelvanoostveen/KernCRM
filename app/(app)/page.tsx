import { Suspense } from "react";
import { begroeting, bepaalActies, groepeerPijplijn } from "@/lib/dashboard/start";
import StartScherm from "./start-scherm";
import { haalRol, laadStart } from "./start-gegevens";

async function Inhoud({ zoek }: { zoek: Promise<{ weergave?: string }> }) {
  const { weergave: gekozen } = await zoek;
  // Een verkoper ziet standaard de eigen projecten; directie en kantoor ziet alles. Iedereen kan wisselen.
  const rol = await haalRol();
  const standaard = rol === "verkoop" ? "mijn" : "alle";
  const weergave = gekozen === "mijn" || gekozen === "alle" ? gekozen : standaard;
  const nu = new Date();
  const data = await laadStart(weergave, nu);

  return (
    <StartScherm
      begroeting={begroeting(nu)}
      weergave={weergave}
      magAlle
      acties={bepaalActies(data.items, nu)}
      kolommen={groepeerPijplijn(data.items)}
      activiteit={data.activiteit}
      aantalProjecten={data.items.length}
    />
  );
}

export default function Start(props: { searchParams: Promise<{ weergave?: string }> }) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-6xl px-4 py-10"><p className="text-stone-500">Startscherm laden…</p></main>}>
      <Inhoud zoek={props.searchParams} />
    </Suspense>
  );
}
