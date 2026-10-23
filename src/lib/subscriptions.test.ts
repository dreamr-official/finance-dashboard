import { describe, expect, it } from "vitest";
import type { Subscription } from "./types";
import {
  getSubscriptionNextPaymentDate,
  getSubscriptionsToRemind,
  getUpcomingSubscriptions,
  isSubscriptionDatePredicted,
} from "./subscriptions";

function subscription(
  overrides: Partial<Subscription> = {},
): Subscription {
  return {
    id: "sub-1",
    name: "Service",
    amount: 10,
    frequency: "monthly",
    nextExpectedDate: "2026-10-20",
    dateVerified: true,
    status: "active",
    detected: false,
    ...overrides,
  };
}

describe("subscription date roll-forward", () => {
  it("rolls overdue monthly payments into upcoming and reminder windows", () => {
    const sub = subscription({ remindDaysBefore: 2 });
    expect(getSubscriptionNextPaymentDate(sub, new Date("2026-10-23T12:00:00Z")))
      .toBe("2026-11-20");
    expect(getUpcomingSubscriptions([sub], new Date("2026-10-23T12:00:00Z"), 30))
      .toEqual([sub]);
    expect(getSubscriptionsToRemind([sub], new Date("2026-11-18T12:00:00Z")))
      .toEqual([sub]);
    expect(isSubscriptionDatePredicted(sub, new Date("2026-10-23T12:00:00Z"))).toBe(true);
  });

  it("clamps monthly dates to month end while preserving the original day", () => {
    const sub = subscription({ nextExpectedDate: "2026-01-31" });
    expect(getSubscriptionNextPaymentDate(sub, new Date("2026-02-01T12:00:00Z")))
      .toBe("2026-02-28");
    expect(getSubscriptionNextPaymentDate(sub, new Date("2026-03-01T12:00:00Z")))
      .toBe("2026-03-31");
  });

  it("does not roll canceled subscriptions", () => {
    const sub = subscription({
      nextExpectedDate: "2026-10-20",
      status: "canceled",
    });
    expect(getSubscriptionNextPaymentDate(sub, new Date("2026-10-23T12:00:00Z")))
      .toBe("2026-10-20");
    expect(getUpcomingSubscriptions([sub], new Date("2026-10-23T12:00:00Z"), 30))
      .toEqual([]);
  });
});
