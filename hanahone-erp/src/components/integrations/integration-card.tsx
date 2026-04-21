"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { CredentialsModal } from "./credentials-modal";

type Platform = "SHOPIFY" | "AMAZON" | "TIKTOK" | "CGETC" | "NAVER" | "PHARMACY" | "ORDERDESK" | "COUPANG";

interface IntegrationCardProps {
  platform: Platform;
  companyId: string;
  isActive: boolean;
  hasCreds: boolean;
  lastSyncAt: string | null;
  lastJobStatus: string | null;
}

const platformLabels: Record<Platform, string> = {
  SHOPIFY: "Shopify",
  AMAZON: "Amazon",
  TIKTOK: "TikTok",
  CGETC: "CGETC",
  NAVER: "Naver",
  PHARMACY: "Pharmacy",
  ORDERDESK: "OrderDesk",
  COUPANG: "Coupang",
};

function getStatus(isActive: boolean, hasCreds: boolean, lastJobStatus: string | null) {
  if (!hasCreds) return { label: "Not configured", style: "text-[var(--badge-slate)] bg-[var(--badge-slate-bg)]" };
  if (lastJobStatus === "FAILED") return { label: "Failed", style: "text-[var(--badge-red)] bg-[var(--badge-red-bg)]" };
  if (isActive) return { label: "Active", style: "text-[var(--badge-teal)] bg-[var(--badge-teal-bg)]" };
  return { label: "Inactive", style: "text-[var(--badge-slate)] bg-[var(--badge-slate-bg)]" };
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function IntegrationCard({ platform, companyId, isActive, hasCreds, lastSyncAt, lastJobStatus }: IntegrationCardProps) {
  const [showModal, setShowModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const status = getStatus(isActive, hasCreds, lastJobStatus);

  async function handleSync() {
    setSyncing(true);
    try {
      await fetch(`/api/sync/${platform.toLowerCase()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      window.location.reload();
    } catch {
      setSyncing(false);
    }
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center">
              <span className="text-accent text-sm font-bold">{platformLabels[platform][0]}</span>
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">{platformLabels[platform]}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`inline-flex px-2.5 py-0.5 text-[11px] font-semibold rounded-full ${status.style}`}>
                  {status.label}
                </span>
                {lastSyncAt && (
                  <span className="text-[11px] text-[var(--text-tertiary)]">
                    Last sync: {timeAgo(lastSyncAt)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowModal(true)}>
              Edit
            </Button>
            {hasCreds && (
              <Button variant="primary" size="sm" onClick={handleSync} disabled={syncing}>
                {syncing ? "Syncing..." : "Sync Now"}
              </Button>
            )}
          </div>
        </div>
      </Card>
      {showModal && (
        <CredentialsModal
          platform={platform}
          companyId={companyId}
          hasCreds={hasCreds}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
