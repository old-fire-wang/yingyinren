import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const SKILL_MARKET_MAX_BYTES = 5 * 1024 * 1024;

export type SkillMarketFileNode = {
  path: string;
  name: string;
  isMd: boolean;
  children?: SkillMarketFileNode[];
};

export function getSkillMarketRoot(): string {
  const env = process.env.SKILL_MARKET_STORAGE_DIR?.trim();
  if (env) return path.resolve(env);
  return path.resolve(process.cwd(), "storage", "skill_market");
}

export function assetAbsDir(storageRelPath: string): string {
  const root = getSkillMarketRoot();
  const rel = storageRelPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new Error("invalid_storage_path");
  }
  return abs;
}

export function sanitizeRelativePath(p: string): string {
  const norm = p.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!norm || norm.includes("..")) throw new Error("invalid_path");
  return norm;
}

async function findSkillMdFile(dir: string): Promise<string | null> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isFile() && /^skill\.md$/i.test(e.name)) return full;
    if (e.isDirectory()) {
      const nested = await findSkillMdFile(full);
      if (nested) return nested;
    }
  }
  return null;
}

/** 解压 zip（优先 unzip 命令，Linux 服务器常见） */
export async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  try {
    await execFileAsync("unzip", ["-o", zipPath, "-d", destDir], { maxBuffer: 20 * 1024 * 1024 });
    return;
  } catch {
    /* fallback powershell on Windows dev */
  }
  if (process.platform === "win32") {
    await execFileAsync("powershell", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ]);
    return;
  }
  throw new Error("zip_extract_failed");
}

export async function zipDirectory(srcDir: string, outZip: string): Promise<void> {
  if (process.platform === "win32") {
    await execFileAsync("powershell", [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${srcDir.replace(/'/g, "''")}\\*' -DestinationPath '${outZip.replace(/'/g, "''")}' -Force`,
    ]);
    return;
  }
  await execFileAsync("zip", ["-r", outZip, "."], { cwd: srcDir });
}

export async function walkSkillTree(absDir: string, relBase = ""): Promise<SkillMarketFileNode[]> {
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  const nodes: SkillMarketFileNode[] = [];
  for (const e of entries) {
    if (e.name === "_upload.zip") continue;
    const rel = relBase ? `${relBase}/${e.name}` : e.name;
    const full = path.join(absDir, e.name);
    if (e.isDirectory()) {
      const children = await walkSkillTree(full, rel);
      nodes.push({ path: rel, name: e.name, isMd: false, children });
    } else {
      const isMd = /\.md$/i.test(e.name);
      nodes.push({ path: rel, name: e.name, isMd });
    }
  }
  nodes.sort((a, b) => {
    const ad = a.children ? 0 : 1;
    const bd = b.children ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return a.name.localeCompare(b.name, "zh-CN");
  });
  return nodes;
}

export async function readMdUnderAsset(absDir: string, relPath: string): Promise<string> {
  const safe = sanitizeRelativePath(relPath);
  if (!/\.md$/i.test(safe)) throw new Error("not_markdown");
  const full = path.join(absDir, safe.split("/").join(path.sep));
  if (!full.startsWith(absDir + path.sep)) throw new Error("invalid_path");
  return await fs.readFile(full, "utf8");
}

export async function removeAssetDir(storageRelPath: string): Promise<void> {
  const abs = assetAbsDir(storageRelPath);
  await fs.rm(abs, { recursive: true, force: true });
}

function isSkillBundleFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".zip") || lower.endsWith(".skill");
}

export async function ingestUploadedFile(
  tempPath: string,
  originalName: string,
  assetDir: string
): Promise<{ fileType: "md" | "skill"; displayName: string; size: number }> {
  await fs.mkdir(assetDir, { recursive: true });
  const lower = originalName.toLowerCase();
  if (isSkillBundleFilename(originalName)) {
    const zipDest = path.join(assetDir, "_upload.zip");
    await fs.copyFile(tempPath, zipDest);
    const extractDir = path.join(assetDir, "bundle");
    await extractZip(zipDest, extractDir);
    const skillMd = await findSkillMdFile(extractDir);
    if (!skillMd) {
      await fs.rm(assetDir, { recursive: true, force: true });
      throw new Error("skill_md_missing");
    }
    const stat = await fs.stat(zipDest);
    const baseName = originalName.replace(/\.(zip|skill)$/i, "");
    return { fileType: "skill", displayName: baseName || originalName, size: stat.size };
  }
  if (!lower.endsWith(".md")) {
    throw new Error("invalid_extension");
  }
  const destName = originalName;
  const dest = path.join(assetDir, destName);
  await fs.copyFile(tempPath, dest);
  const stat = await fs.stat(dest);
  const displayName = destName.replace(/\.md$/i, "");
  return { fileType: "md", displayName, size: stat.size };
}

export function defaultMdPathForAsset(fileType: string, originalFilename: string): string {
  if (fileType === "md") return originalFilename;
  return "SKILL.md";
}
