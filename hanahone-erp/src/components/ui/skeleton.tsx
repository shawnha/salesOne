export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-black/[0.06] dark:bg-white/[0.06] rounded-xl ${className}`} />;
}
