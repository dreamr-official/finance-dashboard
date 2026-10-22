import { getDataset } from "@/lib/data/provider";
import { getSessionUser } from "@/lib/auth";
import { monthlyEquivalent } from "@/lib/finance";
import { SubscriptionsClient } from "./subscriptions-client";


export default async function SubscriptionsPage() {
  const [{ subscriptions, accounts }, user] = await Promise.all([
    getDataset(),
    getSessionUser(),
  ]);
  const active = subscriptions.filter((s) => s.status === "active");
  const monthly = active.reduce((s, x) => s + monthlyEquivalent(x.amount, x.frequency), 0);
  const annual = active.reduce(
    (s, x) => s + monthlyEquivalent(x.amount, x.frequency) * 12,
    0,
  );
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
        <div className="text-sm text-muted-foreground">
          ${monthly.toFixed(2)}/mo · ${annual.toFixed(0)}/yr
        </div>
      </div>
      <SubscriptionsClient
        subscriptions={subscriptions}
        accounts={accounts}
        isAdmin={user?.role === "admin"}
      />
    </div>
  );
}
