export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center mb-4">
        <span className="text-accent text-lg">+</span>
      </div>
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      <p className="text-xs text-[var(--text-tertiary)] max-w-[300px] mb-4">{description}</p>
      {action}
    </div>
  );
}
