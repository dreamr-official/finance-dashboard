export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  note?: string;
}

export function buildTransferLegs(input: TransferInput, pairId: string) {
  const note = input.note?.trim() || "Transfer";
  return [
    {
      account_id: input.fromAccountId,
      date: input.date,
      name: note,
      amount: -Math.abs(input.amount),
      type: "transfer_out" as const,
      transfer_pair_id: pairId,
    },
    {
      account_id: input.toAccountId,
      date: input.date,
      name: note,
      amount: Math.abs(input.amount),
      type: "transfer_in" as const,
      transfer_pair_id: pairId,
    },
  ];
}
