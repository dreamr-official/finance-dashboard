import type { Subscription } from "./types";
import { appToday, shiftDate } from "./dates";

const DAY_MS = 24 * 60 * 60 * 1000;

type SubscriptionDateFields = Pick<
  Subscription,
  "nextExpectedDate" | "frequency" | "status"
>;

function addDays(date: string, amount: number) {
  return shiftDate(date, amount);
}

function addMonthsFromAnchor(date: string, months: number, originalDay: number) {
  const anchor = new Date(`${date}T00:00:00.000Z`);
  const monthIndex = anchor.getUTCMonth() + months;
  const year = anchor.getUTCFullYear() + Math.floor(monthIndex / 12);
  const month = monthIndex % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(originalDay, lastDay)))
    .toISOString()
    .slice(0, 10);
}

export function getSubscriptionNextPaymentDate(
  subscription: SubscriptionDateFields,
  today = new Date(),
) {
  const storedDate = subscription.nextExpectedDate;
  const todayDate = appToday(today);
  if (subscription.status === "canceled" || storedDate >= todayDate) return storedDate;

  if (subscription.frequency === "weekly") {
    let due = storedDate;
    while (due < todayDate) due = addDays(due, 7);
    return due;
  }

  const monthsPerPeriod = {
    monthly: 1,
    quarterly: 3,
    annual: 12,
  }[subscription.frequency];
  const originalDay = Number(storedDate.slice(8, 10));
  for (let periods = 1; ; periods += 1) {
    const due = addMonthsFromAnchor(
      storedDate,
      periods * monthsPerPeriod,
      originalDay,
    );
    if (due >= todayDate) return due;
  }
}

export function isSubscriptionDatePredicted(
  subscription: Subscription & SubscriptionDateFields,
  today: Date,
) {
  return (
    getSubscriptionNextPaymentDate(subscription, today) !==
      subscription.nextExpectedDate ||
    !subscription.dateVerified
  );
}

export function daysUntilSubscription(
  subscription: SubscriptionDateFields,
  today: Date,
) {
  const todayDate = appToday(today);
  return Math.round(
    (new Date(
      `${getSubscriptionNextPaymentDate(subscription, today)}T00:00:00.000Z`,
    ).getTime() -
      new Date(`${todayDate}T00:00:00.000Z`).getTime()) /
      DAY_MS,
  );
}

export function getUpcomingSubscriptions(
  subscriptions: Subscription[],
  today: Date,
  days = 14,
) {
  const current = appToday(today);
  const lastDate = addDays(current, days);
  return subscriptions
    .filter((subscription) => {
      const due = getSubscriptionNextPaymentDate(subscription, today);
      return subscription.status === "active" && due >= current && due <= lastDate;
    })
    .sort((a, b) =>
      getSubscriptionNextPaymentDate(a, today).localeCompare(
        getSubscriptionNextPaymentDate(b, today),
      ),
    );
}

export function getSubscriptionsToRemind(subscriptions: Subscription[], today: Date) {
  return subscriptions.filter(
    (subscription) =>
      subscription.status === "active" &&
      getSubscriptionNextPaymentDate(subscription, today) ===
        addDays(appToday(today), subscription.remindDaysBefore ?? 2),
  );
}
