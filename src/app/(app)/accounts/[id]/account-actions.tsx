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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";

const TXN_TYPES = [
  { value: "deposit", label: "Deposit / contribution" },
  { value: "withdrawal", label: "Withdrawal" },
  { value: "transfer_in", label: "Transfer in" },
  { value: "transfer_out", label: "Transfer out" },
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
  { value: "dividend", label: "Dividend" },
  { value: "interest", label: "Interest" },
  { value: "fee", label: "Fee" },
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "other", label: "Other" },
];

export function AddTransactionButton({ account }: { account: Account }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/accounts/${account.id}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: fd.get("date"),
        name: fd.get("name"),
        amount: Number(fd.get("amount")),
        type: fd.get("type"),
        category: fd.get("category") || undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json();
      setError(typeof d.error === "string" ? d.error : "Failed");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" /> Add transaction
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add transaction — {account.name}</DialogTitle>
            <DialogDescription>
              Use <b>deposit</b> only for money coming in from outside. Money
              moved between your own accounts is a <b>transfer</b>, not a
              deposit. The account balance updates automatically.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="date">Date</Label>
                <Input id="date" name="date" type="date" required />
              </div>
              <div>
                <Label>Type</Label>
                <Select name="type" defaultValue="deposit">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TXN_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="name">Description</Label>
              <Input id="name" name="name" placeholder="e.g. Monthly Roth contribution" required />
            </div>
            <div>
              <Label htmlFor="amount">Amount (+ in, − out)</Label>
              <Input id="amount" name="amount" type="number" step="0.01" required />
            </div>
            <div>
              <Label htmlFor="category">Category (optional)</Label>
              <Input id="category" name="category" placeholder="e.g. Investing" />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button disabled={loading}>{loading ? "Adding…" : "Add"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EditAccountButton({ account }: { account: Account }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        current_balance: Number(fd.get("current_balance")),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Failed to save");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function onDelete() {
    if (!confirm(`Delete ${account.name} and all its transactions?`)) return;
    const res = await fetch(`/api/accounts/${account.id}`, { method: "DELETE" });
    if (res.ok) router.push("/accounts");
  }

  return (
    <>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Pencil className="mr-1 h-4 w-4" /> Edit
        </Button>
        <Button size="sm" variant="outline" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {account.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={account.name} required />
            </div>
            <div>
              <Label htmlFor="current_balance">Current balance</Label>
              <Input
                id="current_balance"
                name="current_balance"
                type="number"
                step="0.01"
                defaultValue={account.currentBalance}
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button disabled={loading}>{loading ? "Saving…" : "Save"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeleteTransactionButton({ id }: { id: string }) {
  const router = useRouter();
  async function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    router.refresh();
  }
  return (
    <button
      onClick={onDelete}
      className="text-muted-foreground hover:text-red-500"
      aria-label="Delete transaction"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
