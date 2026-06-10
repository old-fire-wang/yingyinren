import { Router, type Response } from "express";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { authJwt, type AuthedRequest } from "../middleware/authJwt";
import { prisma } from "../prisma";
import {
  assetAbsDir,
  ingestUploadedFile,
  readMdUnderAsset,
  removeAssetDir,
  sanitizeRelativePath,
  SKILL_MARKET_MAX_BYTES,
  walkSkillTree,
} from "../lib/skillMarketFs";
import { decodeUploadedFilename } from "../lib/uploadFilename";

export const skillMarketRouter = Router();
skillMarketRouter.use(authJwt);

const upload = multer({
  dest: path.join(os.tmpdir(), "yingyinren-skill-market"),
  limits: { fileSize: SKILL_MARKET_MAX_BYTES },
});

type SkillMarketRow = NonNullable<
  Awaited<ReturnType<typeof prisma.skillMarketAsset.findUnique>>
>;

/** 修复历史上按 Latin-1 误存的中文文件名（DB + 磁盘） */
async function repairMojibakeFilename(row: SkillMarketRow): Promise<SkillMarketRow> {
  const fixedFilename = decodeUploadedFilename(row.originalFilename);
  if (fixedFilename === row.originalFilename) return row;

  const absDir = assetAbsDir(row.storageRelPath);
  if (row.fileType === "md") {
    const oldPath = path.join(absDir, row.originalFilename);
    const newPath = path.join(absDir, fixedFilename);
    try {
      await fs.access(oldPath);
      await fs.rename(oldPath, newPath);
    } catch {
      /* 已修复或文件缺失 */
    }
  }

  const fixedDisplay = decodeUploadedFilename(row.displayName);
  const displayName =
    fixedDisplay !== row.displayName
      ? fixedDisplay
      : fixedFilename.replace(/\.(md|zip|skill)$/i, "");

  return await prisma.skillMarketAsset.update({
    where: { id: row.id },
    data: { originalFilename: fixedFilename, displayName },
  });
}

function mapAssetJson(row: SkillMarketRow) {
  return {
    id: row.id,
    displayName: row.displayName,
    fileType: row.fileType,
    originalFilename: row.originalFilename,
    fileSize: row.fileSize,
    downloadCount: row.downloadCount,
    uploader: row.uploader,
    createdAt: row.createdAt.toISOString(),
  };
}

function sendDownloadFile(res: Response, id: number, filePath: string, downloadName: string): void {
  res.download(filePath, downloadName, (err) => {
    if (!err) {
      prisma.skillMarketAsset
        .update({
          where: { id },
          data: { downloadCount: { increment: 1 } },
        })
        .catch(() => undefined);
    }
  });
}

async function contentRootForAsset(absDir: string, fileType: string): Promise<string> {
  if (fileType === "skill") {
    const bundle = path.join(absDir, "bundle");
    try {
      await fs.access(bundle);
      return bundle;
    } catch {
      /* fallback */
    }
  }
  return absDir;
}

skillMarketRouter.get("/", async (req: AuthedRequest, res) => {
  const q = String(req.query.q ?? "").trim();
  const rows = await prisma.skillMarketAsset.findMany({
    where: q
      ? {
          OR: [
            { displayName: { contains: q } },
            { originalFilename: { contains: q } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const fixed = await Promise.all(rows.map((r) => repairMojibakeFilename(r)));
  res.json({ items: fixed.map(mapAssetJson) });
});

skillMarketRouter.post("/upload", upload.single("file"), async (req: AuthedRequest, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "missing_file" });
    return;
  }
  if (file.size > SKILL_MARKET_MAX_BYTES) {
    await fs.unlink(file.path).catch(() => undefined);
    res.status(400).json({ error: "file_too_large", maxBytes: SKILL_MARKET_MAX_BYTES });
    return;
  }
  const uploader = String(req.userId ?? "owner");
  const originalName = decodeUploadedFilename(file.originalname);
  let createdId: number | null = null;
  try {
    const row = await prisma.skillMarketAsset.create({
      data: {
        displayName: originalName,
        fileType: "md",
        originalFilename: originalName,
        storageRelPath: "pending",
        fileSize: file.size,
        uploader,
      },
    });
    createdId = row.id;
    const rel = `${row.id}/`;
    const absDir = assetAbsDir(rel);
    const ingested = await ingestUploadedFile(file.path, originalName, absDir);
    await prisma.skillMarketAsset.update({
      where: { id: row.id },
      data: {
        displayName: ingested.displayName,
        fileType: ingested.fileType,
        fileSize: ingested.size,
        storageRelPath: rel,
      },
    });
    res.json({ ok: true, id: row.id });
  } catch (e) {
    if (createdId != null) {
      await prisma.skillMarketAsset.delete({ where: { id: createdId } }).catch(() => undefined);
      await removeAssetDir(`${createdId}/`).catch(() => undefined);
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "skill_md_missing") {
      res.status(400).json({ error: "skill_md_missing", message: "技能包内须包含 SKILL.md" });
      return;
    }
    if (msg === "invalid_extension") {
      res.status(400).json({ error: "invalid_extension", message: "仅支持 .md、.zip 或 .skill" });
      return;
    }
    if (msg === "zip_extract_failed") {
      res.status(500).json({ error: "zip_extract_failed" });
      return;
    }
    res.status(500).json({ error: "upload_failed", message: msg });
  } finally {
    await fs.unlink(file.path).catch(() => undefined);
  }
});

skillMarketRouter.get("/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  let row = await prisma.skillMarketAsset.findUnique({ where: { id } });
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  row = await repairMojibakeFilename(row);
  const absDir = assetAbsDir(row.storageRelPath);
  const root = await contentRootForAsset(absDir, row.fileType);
  const tree = row.fileType === "skill" ? await walkSkillTree(root) : [];
  let defaultPath = row.originalFilename;
  if (row.fileType === "skill") {
    const flat = flattenMdPaths(tree);
    const skillMd = flat.find((p) => /^skill\.md$/i.test(p.split("/").pop() ?? ""));
    defaultPath = skillMd ?? flat[0] ?? "";
  }
  res.json({
    ...mapAssetJson(row),
    tree,
    defaultPath,
  });
});

function flattenMdPaths(nodes: { path: string; isMd: boolean; children?: typeof nodes }[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.children?.length) out.push(...flattenMdPaths(n.children));
    else if (n.isMd) out.push(n.path);
  }
  return out;
}

skillMarketRouter.get("/:id/content", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const relPath = String(req.query.path ?? "").trim();
  if (!Number.isFinite(id) || !relPath) {
    res.status(400).json({ error: "invalid_params" });
    return;
  }
  const row = await prisma.skillMarketAsset.findUnique({ where: { id } });
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  try {
    const absDir = assetAbsDir(row.storageRelPath);
    const root = await contentRootForAsset(absDir, row.fileType);
    const safe = sanitizeRelativePath(relPath);
    const text = await readMdUnderAsset(root, safe);
    res.json({ path: safe, content: text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: msg });
  }
});

skillMarketRouter.get("/:id/download", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const row = await prisma.skillMarketAsset.findUnique({ where: { id } });
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const absDir = assetAbsDir(row.storageRelPath);
  if (row.fileType === "skill") {
    const zipPath = path.join(absDir, "_upload.zip");
    try {
      await fs.access(zipPath);
      sendDownloadFile(res, id, zipPath, row.originalFilename);
      return;
    } catch {
      res.status(404).json({ error: "zip_missing" });
      return;
    }
  }
  const filePath = path.join(absDir, row.originalFilename);
  try {
    await fs.access(filePath);
    sendDownloadFile(res, id, filePath, row.originalFilename);
  } catch {
    res.status(404).json({ error: "file_missing" });
  }
});

skillMarketRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const row = await prisma.skillMarketAsset.findUnique({ where: { id } });
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  await removeAssetDir(row.storageRelPath);
  await prisma.skillMarketAsset.delete({ where: { id } });
  res.json({ ok: true });
});
