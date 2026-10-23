"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Account, AccountType, Transaction } from "@/lib/types";
import { appToday } from "@/lib/dates";
import { ACCOUNT_TYPE_OPTIONS } from "@/lib/account-types";
import { getResponseError } from "@/lib/client-api";
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
import { Plus, Pencil, Trash2, History } from "lucide-react";

export function AddPastBalanceButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const today = appToday();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/accounts/${accountId}/snapshots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: form.get("date"),
        balance: Number(form.get("balance")),
      }),
    });
    setLoading(false);
    if (!response.ok) {
      setError(await getResponseError(response, "Could not save balance."));
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => setOpen(true)}>
        Add past balance
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add past balance</DialogTitle>
            <DialogDescription>
              Record a known balance without changing the account&apos;s current balance.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <div>
              <Label htmlFor="snapshot-date">Date</Label>
              <Input id="snapshot-date" name="date" type="date" max={today} required />
            </div>
            <div>
              <Label htmlFor="snapshot-balance">Balance</Label>
              <Input
                id="snapshot-balance"
                name="balance"
                type="number"
                step="0.01"
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : "Save past balance"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RebuildHistoryButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function rebuild() {
    setLoading(true);
    setMessage(null);
    const response = await fetch(`/api/accounts/${accountId}/rebuild-history`, {
      method: "POST",
    });
    setLoading(false);
    if (!response.ok) {
      setMessage(await getResponseError(response, "Could not rebuild history."));
      return;
    }
    const result = await response.json().catch(() => null);
    setMessage(`Added ${result.reconstructed} reconstructed balance days.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" size="sm" variant="outline" className="h-9" onClick={rebuild} disabled={loading}>
        <History className="mr-1 h-4 w-4" />
        {loading ? "Rebuilding…" : "Rebuild history from transactions"}
      </Button>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}

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

export function TransactionTypeSelect({
  transactionId,
  transactionType,
  transactionName,
  transactionDate,
  accountType,
  transactionTaxYear,
}: {
  transactionId: string;
  transactionType: Transaction["type"];
  transactionName: string;
  transactionDate: string;
  accountType: Account["type"];
  transactionTaxYear?: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(transactionType);
  const [taxYear, setTaxYear] = useState(
    transactionTaxYear ?? Number(transactionDate.slice(0, 4)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dateYear = Number(transactionDate.slice(0, 4));
  const monthDay = transactionDate.slice(5);
  const canSetTaxYear =
    accountType === "roth_ira" &&
    transactionType === "deposit" &&
    monthDay >= "01-01" &&
    monthDay <= "04-15";

  async function updateType(nextType: string | null) {
    if (!nextType || nextType === value) return;
    setSaving(true);
    setError(null);
    const response = await fetch(`/api/transactions/${transactionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: nextType }),
    });
    setSaving(false);
    if (!response.ok) {
      setError(await getResponseError(response, "Could not update transaction type."));
      return;
    }
    setValue(nextType as Transaction["type"]);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value} onValueChange={updateType}>
        <SelectTrigger
          aria-label={`Edit type for ${transactionName}`}
          className="h-9 w-[132px] text-xs"
          disabled={saving}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TXN_TYPES.map((type) => (
            <SelectItem key={type.value} value={type.value}>
              {type.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {canSetTaxYear && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>Counts toward</span>
          <Select
            value={String(taxYear)}
            onValueChange={async (nextYear) => {
              if (!nextYear) return;
              const year = Number(nextYear);
              setSaving(true);
              const response = await fetch(`/api/transactions/${transactionId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taxYear: year }),
              });
              setSaving(false);
              if (!response.ok) {
                setError(await getResponseError(response, "Could not update tax year."));
                return;
              }
              setTaxYear(year);
              router.refresh();
            }}
          >
            <SelectTrigger aria-label="Counts toward tax year" className="h-9 w-[100px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={String(dateYear)}>{dateYear}</SelectItem>
              <SelectItem value={String(dateYear - 1)}>{dateYear - 1}</SelectItem>
            </SelectContent>
      </Select>
      {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}

export function AddTransactionButton({ account }: { account: Account }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [transactionType, setTransactionType] = useState("deposit");
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
        type: transactionType,
        category: fd.get("category") || undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError(await getResponseError(res, "Could not add transaction."));
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" size="sm" className="h-9" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" /> Add transaction
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
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
                <Select
                  value={transactionType}
                  onValueChange={(value) => value && setTransactionType(value)}
                >
                  <SelectTrigger className="w-full">
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
            <Button type="submit" disabled={loading}>
              {loading ? "Adding…" : "Add"}
            </Button>
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
  const [accountType, setAccountType] = useState<AccountType>(account.type);

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
        type: accountType,
        ...(account.isManual
          ? { current_balance: Number(fd.get("current_balance")) }
          : {}),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError(await getResponseError(res, "Could not save account."));
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function onDelete() {
    if (!confirm(`Delete ${account.name} and all its transactions?`)) return;
    const res = await fetch(`/api/accounts/${account.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(await getResponseError(res, "Could not delete account."));
      return;
    }
    router.push("/accounts");
  }

  return (
    <>
      <div className="flex flex-wrap gap-1">
        <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => setOpen(true)}>
          <Pencil className="mr-1 h-4 w-4" /> Edit
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-9" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit {account.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={account.name} required />
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={accountType}
                onValueChange={(value) => value && setAccountType(value as AccountType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {account.isManual && (
              <div>
                <Label htmlFor="current_balance">
                  {account.assetClass === "liability" ? "Amount owed" : "Current balance"}
                </Label>
                <Input
                  id="current_balance"
                  name="current_balance"
                  type="number"
                  step="0.01"
                  defaultValue={
                    account.assetClass === "liability"
                      ? Math.abs(account.currentBalance)
                      : account.currentBalance
                  }
                  required
                />
              </div>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : "Save"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeleteTransactionButton({
  id,
  showLabel = false,
}: {
  id: string;
  showLabel?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    setError(null);
    const response = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setError(await getResponseError(response, "Could not delete transaction."));
      return;
    }
    router.refresh();
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={onDelete}
        className={
          showLabel
            ? "inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:text-red-500"
            : "inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-red-500"
        }
        aria-label="Delete transaction"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {showLabel && <span>Delete</span>}
      </button>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
