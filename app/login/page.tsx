import { Suspense } from "react";
import { redirect } from "next/navigation";
import { maakServerClient } from "@/lib/supabase/server";

async function inloggen(formData: FormData) {
  "use server";
  const supabase = await maakServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("wachtwoord") ?? ""),
  });
  if (error) redirect(`/login?fout=${encodeURIComponent(error.code ?? error.name ?? "onbekend")}`);
  redirect("/klanten");
}

async function Formulier({ searchParams }: { searchParams: Promise<{ fout?: string }> }) {
  const { fout } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Inloggen bij KernCRM</h1>
      <form action={inloggen} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          E-mailadres
          <input name="email" type="email" required autoComplete="email" className="rounded-md border border-stone-300 bg-white px-3 py-2 text-base font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Wachtwoord
          <input name="wachtwoord" type="password" required autoComplete="current-password" className="rounded-md border border-stone-300 bg-white px-3 py-2 text-base font-normal" />
        </label>
        {fout === "invalid_credentials" && <p role="alert" className="text-sm text-red-700">E-mailadres of wachtwoord klopt niet.</p>}
        {fout === "email_not_confirmed" && <p role="alert" className="text-sm text-red-700">Dit account is nog niet bevestigd.</p>}
        {fout && fout !== "invalid_credentials" && fout !== "email_not_confirmed" && (
          <p role="alert" className="text-sm text-red-700">Inloggen mislukt door een technische fout (code: {fout}). Meld deze code aan de beheerder.</p>
        )}
        <button className="rounded-md bg-[#B35B40] px-4 py-2 font-semibold text-white hover:brightness-110">Inloggen</button>
      </form>
    </main>
  );
}

export default function LoginPagina(props: { searchParams: Promise<{ fout?: string }> }) {
  return (
    <Suspense fallback={null}>
      <Formulier {...props} />
    </Suspense>
  );
}
