const badgeStyles: Record<string, string> = {
  shipped: "text-[var(--badge-teal)] bg-[var(--badge-teal-bg)]",
  delivered: "text-[var(--badge-teal)] bg-[var(--badge-teal-bg)]",
  received: "text-[var(--badge-teal)] bg-[var(--badge-teal-bg)]",
  pending: "text-[var(--badge-amber)] bg-[var(--badge-amber-bg)]",
  processing: "text-[var(--badge-indigo)] bg-[var(--badge-indigo-bg)]",
  cancelled: "text-[var(--badge-red)] bg-[var(--badge-red-bg)]",
  active: "text-[var(--badge-teal)] bg-[var(--badge-teal-bg)]",
  planned: "text-[var(--badge-slate)] bg-[var(--badge-slate-bg)]",
  in_progress: "text-[var(--badge-blue)] bg-[var(--badge-blue-bg)]",
  completed: "text-[var(--badge-teal)] bg-[var(--badge-teal-bg)]",
  paused: "text-[var(--badge-amber)] bg-[var(--badge-amber-bg)]",
};

export function Badge({ status }: { status: string }) {
  const key = status.toLowerCase().replace(/ /g, "_");
  const style = badgeStyles[key] || badgeStyles.pending;
  return (
    <span className={`inline-flex px-2.5 py-0.5 text-[11px] font-semibold rounded-full ${style}`}>
      {status}
    </span>
  );
}
