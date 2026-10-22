"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Landmark } from "lucide-react";

declare global {
  interface Window {
    TellerConnect?: {
      setup: (opts: {
        applicationId: string;
        environment?: string;
        onSuccess: (enrollment: {
          accessToken: string;
          enrollment: { id: string; institution: { name: string } };
        }) => void;
        onExit?: () => void;
      }) => { open: () => void };
    };
  }
}

function loadTellerScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.TellerConnect) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdn.teller.io/connect/connect.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Teller Connect"));
    document.body.appendChild(s);
  });
}

export function ConnectTellerButton({
  applicationId,
  environment,
}: {
  applicationId: string;
  environment: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);

  async function connect() {
    setStatus("Opening Teller…");
    await loadTellerScript();
    const tc = window.TellerConnect!.setup({
      applicationId,
      environment,
      onSuccess: async (enrollment) => {
        setStatus("Saving connection…");
        const res = await fetch("/api/integrations/teller/enroll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: enrollment.accessToken,
            enrollment_id: enrollment.enrollment.id,
            institution_name: enrollment.enrollment.institution.name,
          }),
        });
        if (!res.ok) {
          setStatus(`Error: ${(await res.json()).error}`);
          return;
        }
        setStatus("Connected — accounts appear after sync.");
        router.refresh();
      },
      onExit: () => setStatus(null),
    });
    tc.open();
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={connect}>
        <Landmark className="mr-1 h-4 w-4" /> Connect bank (Teller)
      </Button>
      {status && <span className="text-xs text-muted-foreground">{status}</span>}
    </div>
  );
}
