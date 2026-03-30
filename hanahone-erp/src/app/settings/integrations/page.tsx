import { prisma } from "@/lib/prisma";
import { IntegrationCard } from "@/components/integrations/integration-card";
import { CsvUpload } from "@/components/integrations/csv-upload";
import { SyncHistory } from "@/components/integrations/sync-history";
import type { Platform } from "@prisma/client";

const companyPlatforms: Record<string, Platform[]> = {
  HOI: ["SHOPIFY", "AMAZON", "TIKTOK", "CGETC", "ORDERDESK"],
  HOK: ["NAVER", "PHARMACY"],
};

export default async function IntegrationsPage() {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const configs = await prisma.integrationConfig.findMany({
    include: { company: { select: { name: true } } },
  });

  const recentJobs = await prisma.syncJob.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
  });

  // Get latest job per company+platform for status display
  const latestJobMap = new Map<string, (typeof recentJobs)[0]>();
  for (const job of recentJobs) {
    const key = `${job.companyId}:${job.platform}`;
    if (!latestJobMap.has(key)) {
      latestJobMap.set(key, job);
    }
  }

  // Build config lookup
  const configMap = new Map<string, (typeof configs)[0]>();
  for (const config of configs) {
    configMap.set(`${config.companyId}:${config.platform}`, config);
  }

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-tertiary)] mb-2">
          <a href="/settings" className="hover:text-[var(--text-secondary)] transition-colors">Settings</a>
          <span>/</span>
          <span>Integrations</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tighter">Integrations</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Manage external platform connections and sync settings
        </p>
      </div>

      <div className="space-y-8">
        {companies.map((company) => {
          const shortName = company.name.includes("HOI") || company.name.includes("International")
            ? "HOI"
            : company.name.includes("HOK") || company.name.includes("Korea")
              ? "HOK"
              : null;

          const platforms = shortName ? companyPlatforms[shortName] : [];
          if (platforms.length === 0) return null;

          return (
            <div key={company.id}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-3">
                {company.name}
              </h2>
              <div className="space-y-3">
                {platforms.map((platform) => {
                  const key = `${company.id}:${platform}`;
                  const config = configMap.get(key);
                  const latestJob = latestJobMap.get(key);

                  if (platform === "TIKTOK") {
                    return (
                      <CsvUpload key={platform} />
                    );
                  }

                  return (
                    <IntegrationCard
                      key={platform}
                      platform={platform as any}
                      companyId={company.id}
                      isActive={config?.isActive ?? false}
                      hasCreds={!!config?.credentials}
                      lastSyncAt={config?.lastSyncAt?.toISOString() ?? null}
                      lastJobStatus={latestJob?.status ?? null}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}

        <SyncHistory
          jobs={recentJobs.map((j) => ({
            id: j.id,
            platform: j.platform,
            status: j.status,
            recordsProcessed: j.recordsProcessed,
            recordsFailed: j.recordsFailed,
            startedAt: j.startedAt.toISOString(),
            completedAt: j.completedAt?.toISOString() ?? null,
            errorMessage: j.errorMessage,
          }))}
        />
      </div>
    </div>
  );
}
