"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Account } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { ArrowLeftRight } from "lucide-react";

export function TransferButton({
  accounts,
  initialFromAccountId,
}: {
  accounts: Account[];
  initialFromAccountId?: string;
}) {
  const router = useRouter();
  const defaultFromAccountId = initialFromAccountId ?? accounts[0]?.id ?? "";
  const [open, setOpen] = useState(false);
  const [fromAccountId, setFromAccountId] = useState(defaultFromAccountId);
  const [toAccountId, setToAccountId] = useState(
    accounts.find((account) => account.id !== defaultFromAccountId)?.id ??
      accounts[1]?.id ??
      "",
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount: Number(formData.get("amount")),
        date: formData.get("date"),
        note: formData.get("note") || undefined,
      }),
    });
    setLoading(false);
    if (!response.ok) {
      const result = await response.json();
      setError(typeof result.error === "string" ? result.error : "Transfer failed.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={accounts.length < 2}
        onClick={() => setOpen(true)}
      >
        <ArrowLeftRight className="mr-1 h-4 w-4" /> Transfer
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg overflow-y-auto max-h-[90dvh]">
          <DialogHeader>
            <DialogTitle>Transfer between accounts</DialogTitle>
            <DialogDescription>
              Moving money between your own accounts — not counted as a contribution.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <Label>From</Label>
                <Select
                  value={fromAccountId}
                  onValueChange={(value) => {
                    if (!value) return;
                    setFromAccountId(value);
                    if (value === toAccountId) {
                      setToAccountId(accounts.find((account) => account.id !== value)?.id ?? "");
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <span className="min-w-0 truncate text-left">
                      {accounts.find((account) => account.id === fromAccountId)?.name ??
                        "Choose account"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0">
                <Label>To</Label>
                <Select
                  value={toAccountId}
                  onValueChange={(value) => value && setToAccountId(value)}
                >
                  <SelectTrigger className="w-full">
                    <span className="min-w-0 truncate text-left">
                      {accounts.find((account) => account.id === toAccountId)?.name ??
                        "Choose account"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((account) => account.id !== fromAccountId)
                      .map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="transfer-amount">Amount</Label>
                <Input
                  id="transfer-amount"
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                />
              </div>
              <div>
                <Label htmlFor="transfer-date">Date</Label>
                <Input
                  id="transfer-date"
                  name="date"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="transfer-note">Note (optional)</Label>
              <Input id="transfer-note" name="note" maxLength={200} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={loading || accounts.length < 2}>
              {loading ? "Saving…" : "Transfer"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
