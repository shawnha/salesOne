import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface SyncJobRow {
  id: string;
  platform: string;
  status: string;
  recordsProcessed: number;
  recordsFailed: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
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

const statusMap: Record<string, string> = {
  RUNNING: "Processing",
  SUCCESS: "Completed",
  FAILED: "Cancelled",
};

export function SyncHistory({ jobs }: { jobs: SyncJobRow[] }) {
  if (jobs.length === 0) return null;

  return (
    <Card>
      <h2 className="text-sm font-bold tracking-tight mb-4">Sync History</h2>
      <div className="space-y-0">
        <div className="grid grid-cols-6 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] pb-3 border-b border-[var(--border)]">
          <span>Platform</span>
          <span>Status</span>
          <span>Records</span>
          <span>Failed</span>
          <span>Time</span>
          <span>Error</span>
        </div>
        {jobs.map((job) => (
          <div
            key={job.id}
            className="grid grid-cols-6 py-3 border-b border-[var(--border)] last:border-b-0 text-[13px] items-center"
          >
            <span className="font-semibold">{job.platform}</span>
            <span>
              <Badge status={statusMap[job.status] || job.status} />
            </span>
            <span className="text-[var(--text-secondary)]">{job.recordsProcessed}</span>
            <span className="text-[var(--text-secondary)]">{job.recordsFailed}</span>
            <span className="text-[var(--text-secondary)]">{timeAgo(job.startedAt)}</span>
            <span className="text-[var(--text-tertiary)] text-[11px] truncate" title={job.errorMessage || ""}>
              {job.errorMessage || "—"}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
