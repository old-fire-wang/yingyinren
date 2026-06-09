import { Router } from "express";
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

export const skillMarketRouter = Router();
skillMarketRouter.use(authJwt);

const upload = multer({
  dest: path.join(os.tmpdir(), "yingyinren-skill-market"),
  limits: { fileSize: SKILL_MARKET_MAX_BYTES },
});

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
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      fileType: r.fileType,
      originalFilename: r.originalFilename,
      fileSize: r.fileSize,
      uploader: r.uploader,
      createdAt: r.createdAt.toISOString(),
    })),
  });
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
  let createdId: number | null = null;
  try {
    const row = await prisma.skillMarketAsset.create({
      data: {
        displayName: file.originalname,
        fileType: "md",
        originalFilename: file.originalname,
        storageRelPath: "pending",
        fileSize: file.size,
        uploader,
      },
    });
    createdId = row.id;
    const rel = `${row.id}/`;
    const absDir = assetAbsDir(rel);
    const ingested = await ingestUploadedFile(file.path, file.originalname, absDir);
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
      res.status(400).json({ error: "skill_md_missing", message: "zip 包内须包含 SKILL.md" });
      return;
    }
    if (msg === "invalid_extension") {
      res.status(400).json({ error: "invalid_extension", message: "仅支持 .md 或 .zip" });
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
  const row = await prisma.skillMarketAsset.findUnique({ where: { id } });
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
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
    id: row.id,
    displayName: row.displayName,
    fileType: row.fileType,
    originalFilename: row.originalFilename,
    fileSize: row.fileSize,
    uploader: row.uploader,
    createdAt: row.createdAt.toISOString(),
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
      res.download(zipPath, row.originalFilename);
      return;
    } catch {
      res.status(404).json({ error: "zip_missing" });
      return;
    }
  }
  const filePath = path.join(absDir, row.originalFilename);
  try {
    await fs.access(filePath);
    res.download(filePath, row.originalFilename);
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
