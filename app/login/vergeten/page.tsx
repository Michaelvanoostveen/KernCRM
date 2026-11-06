import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { isAliasAdres, naarInlogAdres, STANDAARD_ALIAS_ADRES } from "@/lib/auth/gebruikersnaam";
import { maakServerClient } from "@/lib/supabase/server";

async function vraagHerstel(formData: FormData) {
  "use server";
  const alias = process.env.ALIAS_ADRES ?? STANDAARD_ALIAS_ADRES;
  const adres = naarInlogAdres(String(formData.get("email") ?? ""), alias);
  let soort = "mail";
  if (adres) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
    const protocol = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    const supabase = await maakServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(adres, { redirectTo: `${protocol}://${host}/auth/herstel` });
    if (error) console.error("wachtwoord herstellen mislukt:", error.code, error.message);
    // We zeggen nooit of een account bestaat. Alleen of de mail naar de eigen mailbox of naar kantoor gaat.
    if (isAliasAdres(adres, alias)) soort = "kantoor";
  }
  redirect(`/login/vergeten?verstuurd=${soort}`);
}

async function Formulier({ zoek }: { zoek: Promise<{ verstuurd?: string }> }) {
  const { verstuurd } = await zoek;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Wachtwoord vergeten</h1>
      {verstuurd ? (
        <div role="status" className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-900">
          {verstuurd === "kantoor"
            ? "Als dit account bestaat, is er een herstelmail naar kantoor gestuurd. Kantoor stelt een nieuw wachtwoord voor je in en geeft dat aan je door. Bel of spreek ze even aan, dan gaat het sneller."
            : "Als dit account bestaat, is er een mail met een herstellink naar het bijbehorende e-mailadres gestuurd. Kijk ook in je ongewenste post."}
        </div>
      ) : (
        <form action={vraagHerstel} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            E-mailadres of gebruikersnaam
            <input name="email" type="text" required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="rounded-md border border-stone-300 bg-white px-3 py-2 text-base font-normal" />
          </label>
          <button className="rounded-md bg-[#B35B40] px-4 py-2 font-semibold text-white hover:brightness-110">Herstelmail versturen</button>
          <p className="text-xs text-stone-500">Monteur met een gebruikersnaam? De herstelmail gaat dan naar kantoor. Je kunt ook direct aan kantoor vragen om een nieuw wachtwoord.</p>
        </form>
      )}
      <Link href="/login" className="text-sm text-stone-600 underline">Terug naar inloggen</Link>
    </main>
  );
}

export default function VergetenPagina(props: { searchParams: Promise<{ verstuurd?: string }> }) {
  return <Suspense fallback={null}><Formulier zoek={props.searchParams} /></Suspense>;
}
