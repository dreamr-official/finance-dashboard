"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Account, Holding } from "@/lib/types";
import { fmtCurrency } from "@/lib/format";
import { holdingsBalanceGap } from "@/lib/holdings";
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
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Plus, Trash2 } from "lucide-react";

const ASSET_TYPES: { value: Holding["assetType"]; label: string }[] = [
  { value: "stock", label: "Stock" },
  { value: "etf", label: "ETF" },
  { value: "mutual_fund", label: "Mutual fund" },
  { value: "bond", label: "Bond" },
  { value: "cash", label: "Cash / money market" },
  { value: "crypto", label: "Crypto" },
  { value: "other", label: "Other" },
];

function errorMessage(result: unknown, fallback: string) {
  const error = (result as { error?: unknown } | null)?.error;
  if (typeof error === "string") return error;
  if (Array.isArray(error) && error[0]?.message) {
    const issue = error[0] as { path?: unknown[]; message: string };
    return issue.path?.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message;
  }
  return fallback;
}

function optionalNumber(value: FormDataEntryValue | null) {
  return value === null || value === "" ? undefined : Number(value);
}

function HoldingDialog({
  accountId,
  holding,
  open,
  onOpenChange,
}: {
  accountId: string;
  holding?: Holding;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [assetType, setAssetType] = useState<Holding["assetType"]>(
    holding?.assetType ?? "stock",
  );
  const [quantity, setQuantity] = useState(holding ? String(holding.quantity) : "");
  const [price, setPrice] = useState(holding ? String(holding.price) : "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const computed = Number(quantity) * Number(price);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const costBasis = optionalNumber(form.get("cost_basis"));
    const response = await fetch(
      holding
        ? `/api/accounts/${accountId}/holdings/${holding.id}`
        : `/api/accounts/${accountId}/holdings`,
      {
        method: holding ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: form.get("symbol"),
          name: form.get("name") || undefined,
          quantity: Number(quantity),
          price: Number(price),
          value: optionalNumber(form.get("value")),
          cost_basis: holding && costBasis === undefined ? null : costBasis,
          asset_type: assetType,
        }),
      },
    );
    setLoading(false);
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      setError(errorMessage(result, "Could not save holding."));
      return;
    }
    onOpenChange(false);
    router.refresh();
  }

  const prefix = holding ? `holding-${holding.id}` : "holding-new";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{holding ? `Edit ${holding.symbol}` : "Add holding"}</DialogTitle>
          <DialogDescription>
            Holdings are tracked separately — the account balance won&apos;t change.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={`${prefix}-symbol`}>Symbol</Label>
              <Input
                id={`${prefix}-symbol`}
                name="symbol"
                defaultValue={holding?.symbol}
                placeholder="e.g. VTI"
                className="uppercase"
                autoCapitalize="characters"
                maxLength={20}
                required
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select
                items={ASSET_TYPES}
                value={assetType}
                onValueChange={(value) => value && setAssetType(value as Holding["assetType"])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor={`${prefix}-name`}>Name</Label>
            <Input
              id={`${prefix}-name`}
              name="name"
              defaultValue={holding?.name}
              placeholder="e.g. Vanguard Total Stock Market ETF"
              maxLength={200}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={`${prefix}-quantity`}>Quantity</Label>
              <Input
                id={`${prefix}-quantity`}
                name="quantity"
                type="number"
                inputMode="decimal"
                step="any"
                min="0.000001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor={`${prefix}-price`}>Price</Label>
              <Input
                id={`${prefix}-price`}
                name="price"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={`${prefix}-value`}>Value</Label>
              <Input
                id={`${prefix}-value`}
                name="value"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder={Number.isFinite(computed) ? computed.toFixed(2) : "qty × price"}
              />
              <p className="mt-1 text-xs text-muted-foreground">Blank = qty × price</p>
            </div>
            <div>
              <Label htmlFor={`${prefix}-cost-basis`}>Cost basis</Label>
              <Input
                id={`${prefix}-cost-basis`}
                name="cost_basis"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                defaultValue={holding?.costBasis}
                placeholder="Optional"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "Saving…" : holding ? "Save holding" : "Add holding"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function HoldingRowActions({
  accountId,
  holding,
}: {
  accountId: string;
  holding: Holding;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    if (!confirm(`Delete ${holding.symbol} from this account?`)) return;
    setDeleting(true);
    const response = await fetch(`/api/accounts/${accountId}/holdings/${holding.id}`, {
      method: "DELETE",
    });
    setDeleting(false);
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      alert(errorMessage(result, "Could not delete holding."));
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex shrink-0 gap-1">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Edit ${holding.symbol}`}
        onClick={() => setOpen(true)}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Delete ${holding.symbol}`}
        className="text-muted-foreground hover:text-red-500"
        onClick={onDelete}
        disabled={deleting}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <HoldingDialog accountId={accountId} holding={holding} open={open} onOpenChange={setOpen} />
      )}
    </div>
  );
}

export function AddHoldingButton({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" /> Add holding
      </Button>
      {open && (
        <HoldingDialog accountId={accountId} open={open} onOpenChange={setOpen} />
      )}
    </>
  );
}

export function HoldingsManager({
  account,
  holdings,
}: {
  account: Account;
  holdings: Holding[];
}) {
  const gap = holdingsBalanceGap(holdings, account.currentBalance);
  if (!gap) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Holdings total {fmtCurrency(gap.total)}, which is{" "}
      {fmtCurrency(Math.abs(gap.gap))} {gap.gap > 0 ? "more" : "less"} than the account
      balance. The balance isn&apos;t changed by holdings — edit the account to update it.
    </p>
  );
}
