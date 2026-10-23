import { getSessionUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { listProviders } from "@/lib/integrations/registry";
import { DEFAULT_ROTH_LIMITS } from "@/lib/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlaidConnections } from "./plaid-connections";
import { PushNotifications } from "@/components/push-notifications";
import { isPushConfigured } from "@/lib/env";
import { MfaSettings } from "@/components/mfa-settings";

export default async function SettingsPage() {
  const user = await getSessionUser();
  const isAdmin = user?.role === "admin";
  const providers = listProviders();
  let plaidConnections: {
    id: string;
    institutionName: string;
    status: string;
    lastSyncedAt: string | null;
    lastError: string | null;
    notice: string | null;
  }[] = [];
  if (user?.role === "admin" && !isDemoMode()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("connections")
      .select("id,institution_id,status,last_synced_at,last_error,notice")
      .eq("provider", "plaid");
    if (error) throw new Error(`Unable to load Plaid connections: ${error.message}`);
    const institutionIds = (data ?? []).map((connection) => connection.institution_id);
    const { data: institutions, error: institutionError } = institutionIds.length
      ? await supabase
          .from("institutions")
          .select("id,name")
          .in("id", institutionIds)
      : { data: [], error: null };
    if (institutionError) {
      throw new Error(`Unable to load Plaid institutions: ${institutionError.message}`);
    }
    const nameById = new Map((institutions ?? []).map((institution) => [institution.id, institution.name]));
    plaidConnections = (data ?? []).map((connection) => ({
      id: connection.id,
      institutionName: nameById.get(connection.institution_id) ?? "Plaid institution",
      status: connection.status,
      lastSyncedAt: connection.last_synced_at,
      lastError: connection.last_error,
      notice: connection.notice,
    }));
  }
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
            {user?.role === "viewer"
              ? "You can view everything but can't change anything."
              : isDemoMode()
              ? "Demo mode — authentication disabled until Supabase is configured."
              : "Supabase Auth with an authorized-user allowlist."}
          </div>
        </CardContent>
      </Card>

      {user && !isDemoMode() && (
        <Card>
          <CardHeader>
            <CardTitle>2-step login</CardTitle>
          </CardHeader>
          <CardContent>
            <MfaSettings />
          </CardContent>
        </Card>
      )}

      {isAdmin && !isDemoMode() && (
        <Card>
          <CardHeader>
            <CardTitle>Plaid connections</CardTitle>
          </CardHeader>
          <CardContent>
            <PlaidConnections connections={plaidConnections} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <PushNotifications
            configured={isPushConfigured() && !isDemoMode()}
            publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
            isAdmin={isAdmin}
          />
        </CardContent>
      </Card>

      {isAdmin && <Card>
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
            Manual entry works either way — Plaid is optional. To connect a bank,
            set PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV, and TOKEN_ENCRYPTION_KEY
            in Vercel, redeploy, then use Accounts → Connect bank. Never paste
            secrets into the repo or chat.
          </p>
        </CardContent>
      </Card>}

      <Card>
        <CardHeader>
          <CardTitle>Roth IRA contribution limits</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="mb-2 text-muted-foreground">
            IRS limits currently used by the app:
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
