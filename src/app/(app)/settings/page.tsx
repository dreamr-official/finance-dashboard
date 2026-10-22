import { getSessionUser } from "@/lib/auth";
import { isDemoMode, isPlaidConfigured, isSnapTradeConfigured } from "@/lib/env";
import { listProviders } from "@/lib/integrations/registry";
import { DEFAULT_ROTH_LIMITS } from "@/lib/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";


export default async function SettingsPage() {
  const user = await getSessionUser();
  const providers = listProviders();
  void isPlaidConfigured;
  void isSnapTradeConfigured;
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
        <CardContent className="space-y-3 text-sm">
          {providers.map((p) => (
            <div key={p.id} className="flex items-center justify-between">
              <span className="capitalize">{p.id}</span>
              <Badge variant={p.configured ? "default" : "secondary"}>
                {p.configured ? "configured" : "not configured"}
              </Badge>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            See docs/SETUP.md for creating a Plaid/SnapTrade developer account and
            adding credentials — never paste secrets into the repo or chat.
          </p>
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
