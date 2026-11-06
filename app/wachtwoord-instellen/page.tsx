import { redirect } from "next/navigation";
import { Suspense } from "react";
import { controleerNieuwWachtwoord } from "@/lib/auth/gebruikersnaam";
import { maakServerClient } from "@/lib/supabase/server";

async function stelIn(formData: FormData) {
  "use server";
  const fout = controleerNieuwWachtwoord(String(formData.get("wachtwoord") ?? ""), String(formData.get("herhaling") ?? ""));
  if (fout) redirect(`/wachtwoord-instellen?fout=${encodeURIComponent(fout)}`);
  const supabase = await maakServerClient();
  const { error } = await supabase.auth.updateUser({ password: String(formData.get("wachtwoord")) });
  if (error) {
    console.error("nieuw wachtwoord instellen mislukt:", error.code, error.message);
    redirect(`/wachtwoord-instellen?fout=${encodeURIComponent(error.code === "same_password" ? "Kies een ander wachtwoord dan je huidige." : "Het lukte niet. Vraag een nieuwe herstelmail aan.")}`);
  }
  redirect("/");
}

async function Formulier({ zoek }: { zoek: Promise<{ fout?: string }> }) {
  const { fout } = await zoek;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Nieuw wachtwoord</h1>
      <form action={stelIn} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nieuw wachtwoord
          <input name="wachtwoord" type="password" required minLength={10} autoComplete="new-password" className="rounded-md border border-stone-300 bg-white px-3 py-2 text-base font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Herhaal het wachtwoord
          <input name="herhaling" type="password" required minLength={10} autoComplete="new-password" className="rounded-md border border-stone-300 bg-white px-3 py-2 text-base font-normal" />
        </label>
        <p className="text-xs text-stone-500">Minstens 10 tekens.</p>
        {fout && <p role="alert" className="text-sm text-red-700">{fout}</p>}
        <button className="rounded-md bg-[#B35B40] px-4 py-2 font-semibold text-white hover:brightness-110">Wachtwoord opslaan</button>
      </form>
    </main>
  );
}

export default function NieuwWachtwoordPagina(props: { searchParams: Promise<{ fout?: string }> }) {
  return <Suspense fallback={null}><Formulier zoek={props.searchParams} /></Suspense>;
}
