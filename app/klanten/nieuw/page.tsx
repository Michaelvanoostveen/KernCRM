import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { maakServerClient } from "@/lib/supabase/server";

async function bewaren(formData: FormData) {
  "use server";
  const supabase = await maakServerClient();
  const { data: lid } = await supabase.from("tenant_leden").select("tenant_id").limit(1).maybeSingle();
  if (!lid) redirect("/klanten/nieuw?fout=tenant");

  const leeg = (v: FormDataEntryValue | null) => (String(v ?? "").trim() || null);
  const { error } = await supabase.from("klanten").insert({
    tenant_id: lid.tenant_id,
    naam: String(formData.get("naam") ?? "").trim(),
    type: String(formData.get("type") ?? "particulier"),
    email: leeg(formData.get("email")),
    telefoon: leeg(formData.get("telefoon")),
    herkomst: leeg(formData.get("herkomst")),
  });
  if (error) redirect("/klanten/nieuw?fout=opslaan");
  redirect("/klanten");
}

const veld = "rounded-md border border-stone-300 bg-white px-3 py-2 text-base font-normal";

async function Formulier({ searchParams }: { searchParams: Promise<{ fout?: string }> }) {
  const { fout } = await searchParams;
  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <Link href="/klanten" className="text-sm text-stone-600 underline">&larr; Terug naar klanten</Link>
      <h1 className="mt-3 text-2xl font-semibold">Nieuwe klant</h1>
      <form action={bewaren} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">Naam
          <input name="naam" required className={veld} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Soort klant
          <select name="type" className={veld} defaultValue="particulier">
            <option value="particulier">Particulier</option>
            <option value="vve">VvE</option>
            <option value="aannemer">Aannemer</option>
            <option value="woningcorporatie">Woningcorporatie</option>
            <option value="zakelijk">Zakelijk</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">E-mailadres
          <input name="email" type="email" className={veld} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Telefoon
          <input name="telefoon" type="tel" className={veld} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Herkomst
          <select name="herkomst" className={veld} defaultValue="">
            <option value="">Onbekend</option>
            <option>Website-configurator</option>
            <option>Offerteaanvraag</option>
            <option>Telefoon</option>
            <option>Showroom</option>
            <option>Doorverwijzing</option>
          </select>
        </label>
        {fout === "tenant" && <p role="alert" className="text-sm text-red-700">Je account hoort nog bij geen bedrijf. Vraag de beheerder om je toe te voegen.</p>}
        {fout === "opslaan" && <p role="alert" className="text-sm text-red-700">Opslaan lukte niet. Controleer je gegevens en probeer opnieuw.</p>}
        <button className="rounded-md bg-[#B35B40] px-4 py-2 font-semibold text-white hover:brightness-110">Klant opslaan</button>
      </form>
    </main>
  );
}

export default function NieuweKlant(props: { searchParams: Promise<{ fout?: string }> }) {
  return (
    <Suspense fallback={null}>
      <Formulier {...props} />
    </Suspense>
  );
}
