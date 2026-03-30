"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ActiveConfig {
  companyId: string;
  platform: string;
  companyName: string;
}

export function SyncAllButton({ configs }: { configs: ActiveConfig[] }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState<{ platform: string; company: string; ok: boolean; message: string }[]>([]);

  if (configs.length === 0) return null;

  async function handleSyncAll() {
    setSyncing(true);
    setResults([]);
    const newResults: typeof results = [];

    for (const config of configs) {
      try {
        const res = await fetch(`/api/sync/${config.platform}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId: config.companyId }),
        });
        const data = await res.json();
        newResults.push({
          platform: config.platform,
          company: config.companyName,
          ok: res.ok,
          message: res.ok
            ? `${data.recordsProcessed || 0} processed`
            : data.error || "Failed",
        });
      } catch {
        newResults.push({
          platform: config.platform,
          company: config.companyName,
          ok: false,
          message: "Network error",
        });
      }
      setResults([...newResults]);
    }

    setSyncing(false);
    setTimeout(() => router.refresh(), 1000);
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleSyncAll}
        disabled={syncing}
        className="px-4 py-2 text-xs font-semibold rounded-lg bg-accent text-white hover:opacity-90 transition-all disabled:opacity-50"
      >
        {syncing ? `Syncing... (${results.length}/${configs.length})` : `Sync All (${configs.length} platforms)`}
      </button>
      {results.length > 0 && (
        <div className="space-y-1">
          {results.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span className={`w-1.5 h-1.5 rounded-full ${r.ok ? "bg-teal-500" : "bg-rose-500"}`} />
              <span className="font-medium">{r.company}/{r.platform}</span>
              <span className="text-[var(--text-tertiary)]">{r.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
