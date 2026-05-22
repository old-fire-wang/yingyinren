import { Router } from "express";
import { prisma } from "../prisma";
import { authJwt, type AuthedRequest } from "../middleware/authJwt";
import { difyPing } from "../lib/dify";

export const projectsRouter = Router();
projectsRouter.use(authJwt);

projectsRouter.get("/", async (_req: AuthedRequest, res) => {
  const projects = await prisma.subscribedProject.findMany({ orderBy: { id: "asc" } });
  res.json({ projects });
});

projectsRouter.post("/", async (req: AuthedRequest, res) => {
  const projectId = String(req.body?.project_id ?? "").trim();
  const projectName = String(req.body?.project_name ?? "").trim();
  const difyBaseUrl = String(req.body?.dify_base_url ?? "").trim();
  const difyApiKey = String(req.body?.dify_api_key ?? "").trim();
  const difyDatasetId = String(req.body?.dify_dataset_id ?? "").trim();
  if (!projectId || !projectName || !difyBaseUrl || !difyApiKey || !difyDatasetId) {
    res.status(400).json({ error: "missing_fields" });
    return;
  }
  const p = await prisma.subscribedProject.create({
    data: { projectId, projectName, difyBaseUrl, difyApiKey, difyDatasetId },
  });
  res.status(201).json({ id: p.id, ok: true });
});

projectsRouter.put("/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "bad_id" });
    return;
  }
  const data: {
    projectName?: string;
    difyBaseUrl?: string;
    difyApiKey?: string;
    difyDatasetId?: string;
  } = {};
  if (req.body?.project_name != null) data.projectName = String(req.body.project_name);
  if (req.body?.dify_base_url != null) data.difyBaseUrl = String(req.body.dify_base_url);
  if (req.body?.dify_api_key != null) data.difyApiKey = String(req.body.dify_api_key);
  if (req.body?.dify_dataset_id != null) data.difyDatasetId = String(req.body.dify_dataset_id);
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: "no_fields" });
    return;
  }
  await prisma.subscribedProject.update({ where: { id }, data });
  res.json({ ok: true });
});

projectsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  await prisma.subscribedProject.delete({ where: { id } });
  res.json({ ok: true });
});

projectsRouter.post("/test-dify", async (req: AuthedRequest, res) => {
  const difyBaseUrl = String(req.body?.dify_base_url ?? "").trim();
  const difyApiKey = String(req.body?.dify_api_key ?? "").trim();
  const difyDatasetId = String(req.body?.dify_dataset_id ?? "").trim();
  try {
    await difyPing({ difyBaseUrl, difyApiKey, datasetId: difyDatasetId });
    res.json({ success: true, message: "ok" });
  } catch (e) {
    res.json({ success: false, message: e instanceof Error ? e.message : String(e) });
  }
});
