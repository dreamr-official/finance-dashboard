import { fmtCurrency } from "./format";
import { MATCH_WINDOW_DAYS } from "./transfer-match";

interface TransferHeadlineBucket {
  count: number;
  total: number;
}

export function transferHeadline(
  needsReview: TransferHeadlineBucket,
  pending: TransferHeadlineBucket,
) {
  if (needsReview.count === 0 && pending.count === 0) {
    return "Everything that left your accounts arrived.";
  }

  if (pending.count > 0 && needsReview.count === 0) {
    return `Everything arrived except ${fmtCurrency(pending.total)} still in transit (normal for up to ${MATCH_WINDOW_DAYS} days).`;
  }

  const reviewItems = `${needsReview.count} ${
    needsReview.count === 1 ? "item" : "items"
  } to check (${fmtCurrency(needsReview.total)})`;

  if (pending.count === 0) {
    return `Everything that left your accounts arrived, except ${reviewItems}.`;
  }

  return `Everything arrived except ${fmtCurrency(pending.total)} still in transit (normal for up to ${MATCH_WINDOW_DAYS} days), plus ${reviewItems}.`;
}
