const badgeStyles: Record<string, string> = {
  shipped: "text-teal-600 bg-teal-600/[0.08] dark:text-teal-400 dark:bg-teal-400/[0.10]",
  delivered: "text-teal-600 bg-teal-600/[0.08] dark:text-teal-400 dark:bg-teal-400/[0.10]",
  received: "text-teal-600 bg-teal-600/[0.08] dark:text-teal-400 dark:bg-teal-400/[0.10]",
  pending: "text-amber-600 bg-amber-600/[0.08] dark:text-amber-400 dark:bg-amber-400/[0.10]",
  processing: "text-indigo-600 bg-indigo-600/[0.08] dark:text-indigo-400 dark:bg-indigo-400/[0.10]",
  cancelled: "text-red-600 bg-red-600/[0.08] dark:text-red-400 dark:bg-red-400/[0.10]",
  active: "text-teal-600 bg-teal-600/[0.08] dark:text-teal-400 dark:bg-teal-400/[0.10]",
  planned: "text-slate-600 bg-slate-600/[0.08] dark:text-slate-400 dark:bg-slate-400/[0.10]",
  in_progress: "text-blue-600 bg-blue-600/[0.08] dark:text-blue-400 dark:bg-blue-400/[0.10]",
  completed: "text-teal-600 bg-teal-600/[0.08] dark:text-teal-400 dark:bg-teal-400/[0.10]",
  paused: "text-amber-600 bg-amber-600/[0.08] dark:text-amber-400 dark:bg-amber-400/[0.10]",
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
