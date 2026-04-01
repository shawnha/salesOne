export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-[var(--skeleton-bg)] rounded-xl ${className}`} />;
}
