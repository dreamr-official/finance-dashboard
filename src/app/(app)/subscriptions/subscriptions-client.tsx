"use client";

import { useMemo, useState } from "react";
import { appToday } from "@/lib/dates";
import type { Account, Subscription } from "@/lib/types";
import { fmtCurrency, fmtDate } from "@/lib/format";
import {
  getSubscriptionNextPaymentDate,
  getUpcomingSubscriptions,
  isSubscriptionDatePredicted,
} from "@/lib/subscriptions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { getResponseError } from "@/lib/client-api";

type SortKey = "date" | "cost" | "name";

const FREQUENCIES = ["weekly", "monthly", "quarterly", "annual"] as const;

function SubscriptionDialog({
  accounts,
  sub,
  open,
  setOpen,
}: {
  accounts: Account[];
  sub?: Subscription;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [frequency, setFrequency] = useState(sub?.frequency ?? "monthly");
  const [accountId, setAccountId] = useState(sub?.accountId ?? "none");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: fd.get("name"),
      amount: Number(fd.get("amount")),
      frequency,
      next_expected_date: fd.get("next_expected_date"),
      account_id: accountId === "none" ? null : accountId,
      remind_days_before:
        String(fd.get("remind_days_before") ?? "").trim() === ""
          ? 2
          : Number(fd.get("remind_days_before")),
    };
    try {
      const res = sub
        ? await fetch(`/api/subscriptions/${sub.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/subscriptions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        setError(await getResponseError(res, "Could not save subscription."));
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sub ? `Edit ${sub.name}` : "Add subscription"}</DialogTitle>
          <DialogDescription>
            Enter the amount charged and the next renewal date.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={sub?.name} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="amount">Cost</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                defaultValue={sub?.amount}
                required
              />
            </div>
            <div>
              <Label>Frequency</Label>
              <Select
                value={frequency}
                onValueChange={(value) => value && setFrequency(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f} className="capitalize">
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="next_expected_date">Next payment date</Label>
            <Input
              id="next_expected_date"
              name="next_expected_date"
              type="date"
              defaultValue={sub?.nextExpectedDate ?? appToday()}
              required
            />
          </div>
          <div>
            <Label htmlFor="remind_days_before">Remind me N days before</Label>
            <Input
              id="remind_days_before"
              name="remind_days_before"
              type="number"
              min={0}
              max={14}
              step={1}
              inputMode="numeric"
              defaultValue={sub?.remindDaysBefore ?? 2}
            />
            <p className="mt-1 text-xs text-muted-foreground">Leave blank for the default of 2 days.</p>
          </div>
          <div>
            <Label>Charged to (optional)</Label>
            <Select
              value={accountId}
              onValueChange={(value) => value && setAccountId(value)}
            >
              <SelectTrigger className="w-full">
                <span className="min-w-0 truncate text-left">
                  {accountId === "none"
                    ? "No account"
                    : accounts.find((account) => account.id === accountId)?.name ?? "Choose account"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No account</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "Saving…" : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SubscriptionsClient({
  subscriptions,
  accounts,
  isAdmin,
}: {
  subscriptions: Subscription[];
  accounts: Account[];
  isAdmin: boolean;
}) {
  const [sort, setSort] = useState<SortKey>("date");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const router = useRouter();
  const acctById = Object.fromEntries(accounts.map((a) => [a.id, a]));

  async function cancel(sub: Subscription) {
    setActionError(null);
    try {
      const response = await fetch(`/api/subscriptions/${sub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "canceled" }),
      });
      if (!response.ok) {
        setActionError(await getResponseError(response, "Could not cancel subscription."));
        return;
      }
      router.refresh();
    } catch {
      setActionError("Could not reach the server. Try again.");
    }
  }

  async function remove(sub: Subscription) {
    if (!confirm(`Delete ${sub.name}?`)) return;
    setActionError(null);
    try {
      const response = await fetch(`/api/subscriptions/${sub.id}`, { method: "DELETE" });
      if (!response.ok) {
        setActionError(await getResponseError(response, "Could not delete subscription."));
        return;
      }
      router.refresh();
    } catch {
      setActionError("Could not reach the server. Try again.");
    }
  }

  const today = useMemo(() => new Date(`${appToday()}T12:00:00.000Z`), []);
  const sorted = useMemo(
    () =>
      [...subscriptions].sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "cost") return b.amount - a.amount;
        return getSubscriptionNextPaymentDate(a, today).localeCompare(
          getSubscriptionNextPaymentDate(b, today),
        );
      }),
    [subscriptions, sort, today],
  );

  const upcoming30 = getUpcomingSubscriptions(subscriptions, today, 30);
  const upcoming7 = getUpcomingSubscriptions(subscriptions, today, 7);
  const markedDates = subscriptions
    .filter((s) => s.status === "active")
    .map((s) => new Date(getSubscriptionNextPaymentDate(s, today) + "T12:00:00"));

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="min-w-0">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="min-w-0">
            {upcoming7.length} due in 7 days · {upcoming30.length} in 30
          </CardTitle>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button type="button" size="sm" className="h-9" onClick={() => setAddOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            )}
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Renewal date</SelectItem>
                <SelectItem value="cost">Cost</SelectItem>
                <SelectItem value="name">Name</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        {actionError && (
          <p role="alert" className="px-4 text-sm text-destructive">
            {actionError}
          </p>
        )}
        <CardContent className="space-y-3 p-3 md:hidden">
          {sorted.map((s) => (
            <article key={s.id} className="space-y-3 rounded-lg border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="break-words font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {s.frequency}
                    {s.detected ? " · auto-detected" : " · manual"}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-medium tabular-nums">{fmtCurrency(s.amount)}</div>
                  <Badge
                    variant={
                      s.status === "active"
                        ? "default"
                        : s.status === "canceled"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {s.status === "canceled" ? "Canceled" : s.status}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t pt-3">
                <div>
                  <div className="text-xs text-muted-foreground">Next payment</div>
                  {s.status === "canceled" ? (
                    <div className="text-sm text-muted-foreground">Canceled</div>
                  ) : (
                    <>
                      <div className="text-sm">{fmtDate(getSubscriptionNextPaymentDate(s, today))}</div>
                      <div className="text-xs text-muted-foreground">
                        {isSubscriptionDatePredicted(s, today) ? "predicted" : "verified"}
                      </div>
                    </>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">Account</div>
                  <div className="truncate text-sm">
                    {s.accountId ? acctById[s.accountId]?.name ?? "—" : "—"}
                  </div>
                </div>
              </div>
              {isAdmin && (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setEditing(s)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                  </Button>
                  {s.status === "active" && (
                    <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => cancel(s)}>
                      Cancel
                    </Button>
                  )}
                  <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => remove(s)}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              )}
            </article>
          ))}
          {!sorted.length && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No subscriptions yet.
            </p>
          )}
        </CardContent>
        <div className="hidden md:block">
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead>Next payment</TableHead>
                  <TableHead className="hidden xl:table-cell">Account</TableHead>
                  <TableHead>Status</TableHead>
                  {isAdmin && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="max-w-48 truncate font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {s.frequency}
                        {s.detected ? " · auto-detected" : " · manual"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtCurrency(s.amount)}
                    </TableCell>
                    <TableCell>
                      {s.status === "canceled" ? (
                        <div className="text-sm text-muted-foreground">Canceled</div>
                      ) : (
                        <>
                          <div className="text-sm">{fmtDate(getSubscriptionNextPaymentDate(s, today))}</div>
                          <div className="text-xs text-muted-foreground">
                            {isSubscriptionDatePredicted(s, today) ? "predicted" : "verified"}
                          </div>
                        </>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                      <span className="block max-w-40 truncate">
                        {s.accountId ? acctById[s.accountId]?.name ?? "—" : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          s.status === "active"
                            ? "default"
                            : s.status === "canceled"
                              ? "secondary"
                              : "outline"
                        }
                      >
                    {s.status === "canceled" ? "Canceled" : s.status}
                      </Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditing(s)}
                            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                            aria-label="Edit subscription"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {s.status === "active" && (
                            <button
                              type="button"
                              onClick={() => cancel(s)}
                              className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
                            >
                              cancel
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => remove(s)}
                            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-red-500"
                            aria-label="Delete subscription"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 px-2 sm:px-6">
            <Calendar
              mode="multiple"
              selected={markedDates}
              className="w-full"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Highlighted days are upcoming renewal dates.
            </p>
          </CardContent>
        </Card>
      </div>

      <SubscriptionDialog
        accounts={accounts}
        open={addOpen}
        setOpen={setAddOpen}
      />
      {editing && (
        <SubscriptionDialog
          key={editing.id}
          accounts={accounts}
          sub={editing}
          open={!!editing}
          setOpen={(v) => !v && setEditing(null)}
        />
      )}
    </div>
  );
}
