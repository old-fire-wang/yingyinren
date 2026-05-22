import cron from "node-cron";
import fs from "fs/promises";
import { prisma } from "../prisma";

export function startCloudMdCleanup(): void {
  const dir = process.env.CLOUD_MD_STORAGE_DIR;
  if (!dir) return;
  cron.schedule("0 3 * * *", async () => {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = await prisma.requirement.findMany({
      where: {
        mdCloudPath: { not: null },
        cloudFileUploadedAt: { lt: cutoff },
      },
    });
    for (const r of rows) {
      if (!r.mdCloudPath) continue;
      try {
        await fs.unlink(r.mdCloudPath);
      } catch {
        /* ignore */
      }
      await prisma.requirement.update({
        where: { id: r.id },
        data: { mdCloudPath: null },
      });
    }
  });
}
