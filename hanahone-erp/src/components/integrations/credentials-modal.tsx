"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Platform = "SHOPIFY" | "AMAZON" | "TIKTOK" | "CGETC" | "NAVER" | "PHARMACY";

interface CredentialsModalProps {
  platform: Platform;
  companyId: string;
  hasCreds: boolean;
  onClose: () => void;
}

interface FieldDef {
  key: string;
  label: string;
  type?: string;
}

const platformFields: Record<Platform, FieldDef[]> = {
  SHOPIFY: [
    { key: "apiKey", label: "API Key" },
    { key: "storeUrl", label: "Store URL" },
  ],
  AMAZON: [
    { key: "sellerId", label: "Seller ID" },
    { key: "marketplaceId", label: "Marketplace ID" },
    { key: "refreshToken", label: "Refresh Token" },
    { key: "clientId", label: "Client ID" },
    { key: "clientSecret", label: "Client Secret", type: "password" },
  ],
  TIKTOK: [],
  NAVER: [
    { key: "clientId", label: "Client ID" },
    { key: "clientSecret", label: "Client Secret", type: "password" },
  ],
  PHARMACY: [
    { key: "baseUrl", label: "Base URL" },
    { key: "apiKey", label: "API Key" },
  ],
  CGETC: [
    { key: "url", label: "URL" },
    { key: "email", label: "Email", type: "email" },
    { key: "password", label: "Password", type: "password" },
    { key: "partnerId", label: "Partner ID" },
  ],
};

const platformLabels: Record<Platform, string> = {
  SHOPIFY: "Shopify",
  AMAZON: "Amazon",
  TIKTOK: "TikTok",
  CGETC: "CGETC",
  NAVER: "Naver",
  PHARMACY: "Pharmacy",
};

export function CredentialsModal({ platform, companyId, hasCreds, onClose }: CredentialsModalProps) {
  const fields = platformFields[platform];
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, ""]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleChange(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, companyId, credentials: values }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save credentials");
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
        window.location.reload();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-1.5 w-full max-w-lg mx-4 shadow-2xl">
        <div className="bg-[var(--surface)] rounded-[calc(1.5rem-6px)] p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-bold tracking-tight">
              {platformLabels[platform]} Credentials
            </h2>
            <button
              onClick={onClose}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors text-lg"
            >
              &times;
            </button>
          </div>

          {hasCreds && (
            <div className="mb-4 px-3 py-2 rounded-xl bg-teal-600/[0.06] border border-teal-600/[0.12] text-[11px] text-teal-600 dark:text-teal-400">
              Credentials are configured. Enter new values to update, or leave blank to keep existing.
            </div>
          )}

          {fields.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              This platform does not require API credentials. Use CSV upload instead.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {fields.map((field) => (
                <Input
                  key={field.key}
                  label={field.label}
                  type={field.type || "text"}
                  placeholder={hasCreds ? "********" : `Enter ${field.label.toLowerCase()}`}
                  value={values[field.key]}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                />
              ))}

              {error && (
                <p className="text-xs text-red-500">{error}</p>
              )}

              {success && (
                <p className="text-xs text-teal-600">Credentials saved successfully.</p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" variant="primary" size="md" disabled={saving}>
                  {saving ? "Saving..." : "Save Credentials"}
                </Button>
                <Button type="button" variant="ghost" size="md" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
