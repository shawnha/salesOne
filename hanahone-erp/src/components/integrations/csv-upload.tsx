"use client";

import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface UploadResult {
  total: number;
  created: number;
  failed: number;
}

export function CsvUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload/tiktok", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await res.json();
      setResult(data);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <h3 className="text-sm font-bold tracking-tight mb-1">TikTok CSV Upload</h3>
      <p className="text-[11px] text-[var(--text-tertiary)] mb-4">
        Upload TikTok order data as a CSV file for manual import.
      </p>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setResult(null);
              setError(null);
            }}
            className="w-full text-sm text-[var(--text-secondary)] file:mr-3 file:px-4 file:py-1.5 file:text-xs file:font-semibold file:rounded-full file:border file:border-[var(--border)] file:bg-[var(--surface)] file:text-[var(--text-primary)] hover:file:border-[var(--border-strong)] file:transition-all file:cursor-pointer"
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleUpload}
          disabled={!file || uploading}
        >
          {uploading ? "Uploading..." : "Upload"}
        </Button>
      </div>

      {result && (
        <div className="mt-3 px-3 py-2 rounded-xl bg-teal-600/[0.06] border border-teal-600/[0.12] text-[11px] text-[var(--badge-teal)]">
          Processed {result.total} records: {result.created} created, {result.failed} failed.
        </div>
      )}

      {error && (
        <div className="mt-3 px-3 py-2 rounded-xl bg-red-600/[0.06] border border-red-600/[0.12] text-[11px] text-[var(--badge-red)]">
          {error}
        </div>
      )}
    </Card>
  );
}
