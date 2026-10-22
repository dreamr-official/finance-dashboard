"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TABLES = ["accounts", "transactions", "subscriptions", "holdings", "balance_snapshots"];

export function RealtimeRefresh() {
  const router = useRouter();

  useEffect(() => {
    let client: ReturnType<typeof createClient>;
    try {
      client = createClient();
    } catch {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let channel = client.channel("finance-data-refresh");
    for (const table of TABLES) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => router.refresh(), 800);
        },
      );
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [router]);

  return null;
}
