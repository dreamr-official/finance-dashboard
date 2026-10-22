import { describe, expect, it } from "vitest";
import { buildDividendNotification } from "./push-messages";
import { getSubscriptionsToRemind, getUpcomingSubscriptions } from "./subscriptions";
import type { Subscription } from "./types";

const subscription = (
  id: string,
  nextExpectedDate: string,
  options: Partial<Subscription> = {},
): Subscription => ({
  id,
  name: id,
  amount: 10,
  frequency: "monthly",
  nextExpectedDate,
  dateVerified: false,
  status: "active",
  detected: false,
  ...options,
});

describe("dividend push message", () => {
  it("formats one payment with its account and symbol", () => {
    expect(
      buildDividendNotification([
        { name: "Dividend VTI", accountName: "Fidelity Brokerage", amount: 42.18, type: "dividend" },
      ]),
    ).toEqual({
      title: "Dividend received",
      body: "Dividend: $42.18 into Fidelity Brokerage (VTI)",
      url: "/investments",
    });
  });

  it("summarizes multiple payments", () => {
    expect(
      buildDividendNotification([
        { name: "Dividend VTI", accountName: "Brokerage", amount: 42.18, type: "dividend" },
        { name: "Interest", accountName: "Savings", amount: 7.82, type: "interest" },
      ])?.body,
    ).toBe("2 new dividend/interest payments · $50.00 total");
  });
});

describe("subscription reminders", () => {
  const today = new Date("2026-05-10T12:00:00.000Z");

  it("selects due dates exactly N days out, defaults to two, and excludes canceled", () => {
    const due = getSubscriptionsToRemind(
      [
        subscription("default", "2026-05-12"),
        subscription("same-day", "2026-05-12", { remindDaysBefore: 2 }),
        subscription("early", "2026-05-11", { remindDaysBefore: 2 }),
        subscription("canceled", "2026-05-12", { status: "canceled" }),
      ],
      today,
    );
    expect(due.map((item) => item.id)).toEqual(["default", "same-day"]);
  });
});

describe("Overview coming up filter", () => {
  it("includes active subscriptions through 14 days and excludes canceled or later dates", () => {
    const upcoming = getUpcomingSubscriptions(
      [
        subscription("today", "2026-05-10"),
        subscription("inside", "2026-05-24"),
        subscription("outside", "2026-05-25"),
        subscription("canceled", "2026-05-12", { status: "canceled" }),
      ],
      new Date("2026-05-10T12:00:00.000Z"),
    );
    expect(upcoming.map((item) => item.id)).toEqual(["today", "inside"]);
  });
});
