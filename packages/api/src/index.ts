import "dotenv/config";
import fs from "fs/promises";
import { createApp } from "./app";
import { startCloudMdCleanup } from "./jobs/cleanupCloudMd";

async function main(): Promise<void> {
  const dir = process.env.CLOUD_MD_STORAGE_DIR ?? "./storage/cloud_md";
  await fs.mkdir(dir, { recursive: true });
  startCloudMdCleanup();
  const port = Number(process.env.PORT ?? 3000);
  createApp().listen(port, () => {
    console.log("yingyinren api listening on " + port);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
