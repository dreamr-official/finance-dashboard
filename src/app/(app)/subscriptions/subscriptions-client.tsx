"use client";

import { useMemo, useState } from "react";
import type { Account, Subscription } from "@/lib/types";
import { fmtCurrency, fmtDate } from "@/lib/format";
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const accountId = (fd.get("account_id") as string) || undefined;
    const payload = {
      name: fd.get("name"),
      amount: Number(fd.get("amount")),
      frequency: fd.get("frequency"),
      next_expected_date: fd.get("next_expected_date"),
      ...(accountId ? { account_id: accountId } : {}),
    };
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
    setLoading(false);
    if (!res.ok) {
      setError(sub ? "Failed to save" : "Failed to add (Supabase required)");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
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
              <Select name="frequency" defaultValue={sub?.frequency ?? "monthly"}>
                <SelectTrigger>
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
              defaultValue={sub?.nextExpectedDate}
              required
            />
          </div>
          <div>
            <Label>Charged to (optional)</Label>
            <Select name="account_id" defaultValue={sub?.accountId ?? ""}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button disabled={loading}>{loading ? "Saving…" : "Save"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function daysUntil(date: string) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
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
  const router = useRouter();
  const acctById = Object.fromEntries(accounts.map((a) => [a.id, a]));

  async function cancel(sub: Subscription) {
    await fetch(`/api/subscriptions/${sub.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "canceled" }),
    });
    router.refresh();
  }

  async function remove(sub: Subscription) {
    if (!confirm(`Delete ${sub.name}?`)) return;
    await fetch(`/api/subscriptions/${sub.id}`, { method: "DELETE" });
    router.refresh();
  }

  const sorted = useMemo(
    () =>
      [...subscriptions].sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "cost") return b.amount - a.amount;
        return a.nextExpectedDate.localeCompare(b.nextExpectedDate);
      }),
    [subscriptions, sort],
  );

  const upcoming30 = subscriptions.filter(
    (s) => s.status === "active" && daysUntil(s.nextExpectedDate) <= 30,
  );
  const upcoming7 = upcoming30.filter((s) => daysUntil(s.nextExpectedDate) <= 7);
  const markedDates = subscriptions
    .filter((s) => s.status === "active")
    .map((s) => new Date(s.nextExpectedDate + "T12:00:00"));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {upcoming7.length} due in 7 days · {upcoming30.length} in 30
          </CardTitle>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button size="sm" onClick={() => setAddOpen(true)}>
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
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Next payment</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {s.frequency}
                      {s.detected ? " · auto-detected" : " · manual"}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtCurrency(s.amount)}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{fmtDate(s.nextExpectedDate)}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.dateVerified ? "verified" : "predicted"}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {s.accountId ? acctById[s.accountId]?.name ?? "—" : "—"}
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
                      {s.status}
                    </Badge>
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditing(s)}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Edit subscription"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {s.status === "active" && (
                          <button
                            onClick={() => cancel(s)}
                            className="px-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            cancel
                          </button>
                        )}
                        <button
                          onClick={() => remove(s)}
                          className="text-muted-foreground hover:text-red-500"
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
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
          </CardHeader>
          <CardContent>
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
          accounts={accounts}
          sub={editing}
          open={!!editing}
          setOpen={(v) => !v && setEditing(null)}
        />
      )}
    </div>
  );
}
