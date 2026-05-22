import bcrypt from "bcrypt";
import { Router } from "express";
import { prisma } from "../prisma";
import { authJwt, signUserToken, type AuthedRequest } from "../middleware/authJwt";
import { setConfigKey } from "../lib/configStore";

const HASH_KEY = "client_password_hash";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const password = String(req.body?.password ?? "");
  if (!password) {
    res.status(400).json({ error: "password_required" });
    return;
  }
  const row = await prisma.systemConfig.findUnique({ where: { configKey: HASH_KEY } });
  if (!row?.configValue) {
    res.status(400).json({ error: "not_bootstrapped" });
    return;
  }
  const ok = await bcrypt.compare(password, row.configValue);
  if (!ok) {
    res.status(401).json({ error: "invalid_password" });
    return;
  }
  res.json({ token: signUserToken() });
});

authRouter.post("/bootstrap", async (req, res) => {
  const password = String(req.body?.password ?? "");
  if (!password || password.length < 6) {
    res.status(400).json({ error: "password_min_6" });
    return;
  }
  const existing = await prisma.systemConfig.findUnique({ where: { configKey: HASH_KEY } });
  if (existing) {
    res.status(400).json({ error: "already_bootstrapped" });
    return;
  }
  const hash = await bcrypt.hash(password, 12);
  await setConfigKey(HASH_KEY, hash);
  res.json({ ok: true, token: signUserToken() });
});

authRouter.post("/change-password", authJwt, async (req: AuthedRequest, res) => {
  const oldPassword = String(req.body?.old_password ?? "");
  const newPassword = String(req.body?.new_password ?? "");
  if (!oldPassword || !newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const row = await prisma.systemConfig.findUnique({ where: { configKey: HASH_KEY } });
  if (!row?.configValue) {
    res.status(400).json({ error: "not_bootstrapped" });
    return;
  }
  const ok = await bcrypt.compare(oldPassword, row.configValue);
  if (!ok) {
    res.status(400).json({ error: "old_password_wrong" });
    return;
  }
  await setConfigKey(HASH_KEY, await bcrypt.hash(newPassword, 12));
  res.json({ ok: true });
});
