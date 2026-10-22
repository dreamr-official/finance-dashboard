import { getSessionUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { DEFAULT_ROTH_LIMITS } from "@/lib/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";


export default async function SettingsPage() {
  const user = await getSessionUser();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>
            Signed in as <span className="font-medium">{user?.email}</span>{" "}
            <Badge className="ml-1 capitalize">{user?.role}</Badge>
          </div>
          <div className="text-muted-foreground">
            {isDemoMode()
              ? "Demo mode — authentication disabled until Supabase is configured."
              : "Supabase Auth with allowlist + MFA."}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Financial integrations</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          All data is entered manually. Bank/brokerage API connections (Teller,
          Plaid, SnapTrade) are disabled — ask an admin to re-enable them if you
          ever want automatic syncing.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roth IRA contribution limits</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="mb-2 text-muted-foreground">
            Per-tax-year limits are stored in <code>app_settings.roth_limits</code>.
            Current defaults:
          </p>
          <ul className="space-y-1 tabular-nums">
            {Object.entries(DEFAULT_ROTH_LIMITS).map(([y, v]) => (
              <li key={y}>
                {y}: ${v.toLocaleString()}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
