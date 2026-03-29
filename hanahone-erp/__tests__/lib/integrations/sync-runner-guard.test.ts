import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanupStaleJobs } from "@/lib/integrations/sync-runner";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    syncJob: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

describe("cleanupStaleJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls updateMany with correct stale threshold", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    await cleanupStaleJobs("company-1", "CGETC");

    expect(prisma.syncJob.updateMany).toHaveBeenCalledWith({
      where: {
        companyId: "company-1",
        platform: "CGETC",
        status: "RUNNING",
        startedAt: { lt: new Date(now - 10 * 60 * 1000) },
      },
      data: {
        status: "FAILED",
        completedAt: expect.any(Date),
        errorMessage: "Timed out — marked stale by cleanup",
      },
    });
  });

  it("does not throw when no stale jobs exist", async () => {
    await expect(cleanupStaleJobs("company-1", "CGETC")).resolves.not.toThrow();
  });
});
