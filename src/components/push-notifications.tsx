"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

function decodeVapidKey(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(window.atob(padded), (char) => char.charCodeAt(0));
}

export function PushNotifications({
  configured,
  publicKey,
  isAdmin,
}: {
  configured: boolean;
  publicKey: string;
  isAdmin: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const canPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    queueMicrotask(() => {
      setSupported(canPush);
      setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
    });
    if (!canPush) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => registration.pushManager.getSubscription())
      .then(setSubscription)
      .catch(() => {});
  }, []);

  async function enable() {
    setBusy(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Allow notifications in your browser to continue.");
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(publicKey),
      });
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!response.ok) throw new Error("Could not save this device.");
      setSubscription(sub);
      setMessage("Notifications enabled on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!subscription) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      if (!response.ok) throw new Error("Could not disable notifications.");
      await subscription.unsubscribe();
      setSubscription(null);
      setMessage("Notifications disabled on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not disable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      if (!response.ok) throw new Error("Could not send a test notification.");
      setMessage("Test notification sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send a test notification.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {!configured ? (
        isAdmin ? (
          <p className="text-sm text-muted-foreground">
            To enable notifications, set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
            and VAPID_SUBJECT in Vercel. Generate them with{" "}
            <code>npx web-push generate-vapid-keys</code>, then redeploy.
          </p>
        ) : null
      ) : !supported ? (
        <p className="text-sm text-muted-foreground">
          Push notifications are not supported in this browser. On iPhone, first add
          Finance to your Home Screen (iOS 16.4 or later).
        </p>
      ) : (
        <>
          {ios && (
            <p className="text-sm text-muted-foreground">
              On iPhone, add Finance to your Home Screen first (iOS 16.4 or later).
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {subscription ? (
              <>
                <Button type="button" variant="outline" disabled={busy} onClick={disable}>
                  Disable on this device
                </Button>
                <Button type="button" disabled={busy} onClick={sendTest}>
                  Send test
                </Button>
              </>
            ) : (
              <Button type="button" disabled={busy} onClick={enable}>
                Enable on this device
              </Button>
            )}
          </div>
        </>
      )}
      {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
    </div>
  );
}
