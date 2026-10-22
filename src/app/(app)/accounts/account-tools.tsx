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
import { Plus, Upload } from "lucide-react";

const TYPES = [
  "checking",
  "savings",
  "cash",
  "brokerage",
  "roth_ira",
  "traditional_ira",
  "401k",
  "credit_card",
  "loan",
  "other",
] as const;

export function AddAccountDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        institution_name: fd.get("institution_name"),
        type: fd.get("type"),
        opening_balance: Number(fd.get("opening_balance")),
        opening_date: fd.get("opening_date") || undefined,
        mask: fd.get("mask") || undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" /> Add account
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add manual account</DialogTitle>
            <DialogDescription>
              For institutions that don&apos;t connect via API. The opening
              balance seeds your net-worth history.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <div>
              <Label htmlFor="institution_name">Institution</Label>
              <Input
                id="institution_name"
                name="institution_name"
                placeholder="e.g. Happen Bank"
                required
              />
            </div>
            <div>
              <Label htmlFor="name">Account name</Label>
              <Input id="name" name="name" placeholder="e.g. High-Yield Savings" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select name="type" defaultValue="checking">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">
                        {t.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="mask">Last 4 (optional)</Label>
                <Input id="mask" name="mask" maxLength={4} placeholder="1234" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="opening_balance">Opening balance</Label>
                <Input
                  id="opening_balance"
                  name="opening_balance"
                  type="number"
                  step="0.01"
                  required
                />
              </div>
              <div>
                <Label htmlFor="opening_date">As of</Label>
                <Input id="opening_date" name="opening_date" type="date" />
              </div>
            </div>
            {error && <p className="text-sm text-red-500">{String(error)}</p>}
            <Button type="submit" disabled={loading}>{loading ? "Adding…" : "Add account"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ImportCsvDialog({ account }: { account: Account }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    const fd = new FormData(e.currentTarget);
    const file = fd.get("csv_file") as File | null;
    const csv = file && file.size ? await file.text() : String(fd.get("csv_text") ?? "");
    const res = await fetch(`/api/accounts/${account.id}/import-csv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setResult(`Error: ${typeof data.error === "string" ? data.error : "failed"}`);
      return;
    }
    setResult(`Imported ${data.imported} transactions (re-importing is safe).`);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Upload className="h-3 w-3" /> CSV
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import transactions — {account.name}</DialogTitle>
            <DialogDescription>
              Format: <code>date,name,amount[,type]</code> (YYYY-MM-DD, signed
              amount). Types: deposit, withdrawal, transfer_in/out, buy, sell,
              dividend, interest, fee, expense, income. Safe to re-import —
              rows dedupe automatically.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <div>
              <Label htmlFor="csv_file">CSV file</Label>
              <Input id="csv_file" name="csv_file" type="file" accept=".csv,text/csv" />
            </div>
            <div className="text-center text-xs text-muted-foreground">or paste</div>
            <textarea
              name="csv_text"
              rows={6}
              className="w-full rounded-md border bg-background p-2 font-mono text-xs"
              placeholder={"2026-01-15,ACH Deposit — Fidelity,2000.00,deposit"}
            />
            {result && <p className="text-sm">{result}</p>}
            <Button type="submit" disabled={loading}>{loading ? "Importing…" : "Import"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
