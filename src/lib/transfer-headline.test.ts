import { describe, expect, it } from "vitest";
import { transferHeadline } from "./transfer-headline";

describe("transferHeadline", () => {
  it("says all transfers arrived when there are no unmatched items", () => {
    expect(transferHeadline({ count: 0, total: 0 }, { count: 0, total: 0 })).toBe(
      "Everything that left your accounts arrived.",
    );
  });

  it("mentions the in-transit total and normal matching window", () => {
    expect(transferHeadline({ count: 0, total: 0 }, { count: 1, total: 975 })).toBe(
      "Everything arrived except $975.00 still in transit (normal for up to 7 days).",
    );
  });

  it("summarizes items that need review without pending transfers", () => {
    expect(transferHeadline({ count: 2, total: 1000 }, { count: 0, total: 0 })).toBe(
      "Everything that left your accounts arrived, except 2 items to check ($1,000.00).",
    );
  });

  it("includes both review and in-transit totals", () => {
    expect(transferHeadline({ count: 2, total: 1000 }, { count: 1, total: 475 })).toBe(
      "Everything arrived except $475.00 still in transit (normal for up to 7 days), plus 2 items to check ($1,000.00).",
    );
  });
});
