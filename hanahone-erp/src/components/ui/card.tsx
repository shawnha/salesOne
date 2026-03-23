interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div className={`bg-black/[0.02] dark:bg-white/[0.02] border border-[var(--border)] rounded-3xl p-1.5 transition-all duration-300 hover:shadow-[var(--shadow-card-hover)] hover:border-[var(--border-strong)] ${className}`}>
      <div className="bg-[var(--surface)] rounded-[calc(1.5rem-6px)] p-7 h-full shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] relative overflow-hidden">
        {children}
      </div>
    </div>
  );
}
