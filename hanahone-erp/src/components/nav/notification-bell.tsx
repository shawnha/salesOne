"use client";

import { useState, useEffect, useRef } from "react";

type Notification = {
  id: string;
  type: string;
  priority: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

const TYPE_COLORS: Record<string, string> = {
  SYNC_FAILED: "bg-red-500",
  LOW_STOCK: "bg-amber-500",
  NEW_ORDERS: "bg-blue-500",
};

export function NotificationBell({ initialCount }: { initialCount: number }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleOpen() {
    setOpen(!open);
    if (!open) {
      setLoading(true);
      try {
        const res = await fetch("/api/notifications");
        const data = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      } catch {}
      setLoading(false);
    }
  }

  async function handleMarkAllRead() {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
  }

  async function handleMarkRead(id: string) {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setUnreadCount((c) => Math.max(0, c - 1));
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
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

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleOpen}
        className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-all duration-200 text-sm relative"
        aria-label="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-10 right-0 w-[360px] bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <h3 className="text-[13px] font-bold">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-[11px] text-accent hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-[var(--text-tertiary)] text-xs">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-[var(--text-tertiary)] text-xs">No notifications</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => !n.readAt && handleMarkRead(n.id)}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-[var(--border)] cursor-pointer hover:bg-[var(--hover-bg-subtle)] ${!n.readAt ? "bg-accent/[0.03]" : ""}`}
                >
                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${!n.readAt ? TYPE_COLORS[n.type] || "bg-gray-400" : "bg-transparent"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold truncate">{n.title}</div>
                    <div className="text-[11px] text-[var(--text-secondary)] truncate">{n.message}</div>
                    <div className="text-[10px] text-[var(--text-tertiary)] mt-1">{timeAgo(n.createdAt)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
