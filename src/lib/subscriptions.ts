import type { Subscription } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function getSubscriptionNextPaymentDate(subscription: Pick<Subscription, "nextExpectedDate">) {
  return subscription.nextExpectedDate;
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, amount: number) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + amount);
  return dateOnly(result);
}

export function daysUntilSubscription(
  subscription: Pick<Subscription, "nextExpectedDate">,
  today: Date,
) {
  const todayDate = dateOnly(today);
  return Math.round(
    (new Date(`${getSubscriptionNextPaymentDate(subscription)}T00:00:00.000Z`).getTime() -
      new Date(`${todayDate}T00:00:00.000Z`).getTime()) /
      DAY_MS,
  );
}

export function getUpcomingSubscriptions(
  subscriptions: Subscription[],
  today: Date,
  days = 14,
) {
  return subscriptions
    .filter((subscription) => {
      const due = getSubscriptionNextPaymentDate(subscription);
      const current = dateOnly(today);
      return subscription.status === "active" && due >= current && due <= addDays(current, days);
    })
    .sort((a, b) =>
      getSubscriptionNextPaymentDate(a).localeCompare(getSubscriptionNextPaymentDate(b)),
    );
}

export function getSubscriptionsToRemind(subscriptions: Subscription[], today: Date) {
  return subscriptions.filter(
    (subscription) =>
      subscription.status === "active" &&
      getSubscriptionNextPaymentDate(subscription) ===
        addDays(dateOnly(today), subscription.remindDaysBefore ?? 2),
  );
}
