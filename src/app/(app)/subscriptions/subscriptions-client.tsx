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

type SortKey = "date" | "cost" | "name";

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
  const acctById = Object.fromEntries(accounts.map((a) => [a.id, a]));

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
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Manage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Manual add/edit/cancel uses the admin API routes
                (<code>/api/subscriptions</code>). Recurring-charge detection
                runs on synced transactions in Phase 2.
              </p>
              <Button size="sm" variant="outline" disabled>
                Add subscription (Supabase required)
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
