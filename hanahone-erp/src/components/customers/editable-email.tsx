"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function EditableEmail({ customerId, currentEmail }: { customerId: string; currentEmail: string | null }) {
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(currentEmail || "");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: customerId, email: email || null }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[var(--text-secondary)]">{currentEmail || "—"}</span>
        <button
          onClick={() => setEditing(true)}
          className="text-[10px] text-accent hover:underline"
        >
          {currentEmail ? "edit" : "add"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email@example.com"
        className="px-2 py-1 text-[13px] rounded-lg bg-[var(--surface)] border border-[var(--border)] focus:outline-none focus:border-accent w-48"
        autoFocus
      />
      <button
        onClick={handleSave}
        disabled={saving}
        className="text-[10px] font-semibold text-accent hover:underline disabled:opacity-50"
      >
        {saving ? "..." : "save"}
      </button>
      <button
        onClick={() => { setEditing(false); setEmail(currentEmail || ""); }}
        className="text-[10px] text-[var(--text-tertiary)] hover:underline"
      >
        cancel
      </button>
    </div>
  );
}
