export function classifyType(name: string, amount: number): string {
  if (/dividend/i.test(name)) return "dividend";
  if (/interest/i.test(name)) return "interest";
  if (/transfer|xfer|zelle|venmo/i.test(name)) {
    return amount >= 0 ? "transfer_in" : "transfer_out";
  }
  return amount >= 0 ? "income" : "expense";
}
