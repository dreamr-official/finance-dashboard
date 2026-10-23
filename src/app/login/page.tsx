import { LoginForm } from "./login-form";
import { isDemoMode } from "@/lib/env";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Finance</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Private dashboard — authorized users only.
        </p>
        {params.error === "not_authorized" && (
          <p className="mb-4 text-sm text-muted-foreground">
            This account isn&apos;t authorized for this dashboard. Ask the owner to add you.
          </p>
        )}
        {isDemoMode() ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
            Demo mode: Supabase isn&apos;t configured, so authentication is
            disabled and all data is sample data.{" "}
            <a className="underline" href="/overview">
              Continue to the demo →
            </a>
          </div>
        ) : (
          <LoginForm initialMfaRequired={params.mfa === "1"} />
        )}
      </div>
    </div>
  );
}
