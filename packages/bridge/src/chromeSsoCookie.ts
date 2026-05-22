import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

/** chrome-sso-cookie / 桥 C 内置：从本机 Chrome 读取 SSO Cookie 串 */
export type ChromeSsoCookieResult = {
  value: string;
  /** 供日志，不含 cookie 正文 */
  via: "windows_chrome" | "chrome_sso_skill" | "none";
  detail?: string;
};

const SKILL_REL = path.join(".cursor", "skills", "chrome-sso-cookie", "scripts", "get-chrome-cookie.sh");

export function chromeSsoDisabled(): boolean {
  return process.env.BRIDGE_DASHEN_DISABLE_CHROME_SSO === "1";
}

export function defaultChromeSsoDomain(): string {
  const d = (process.env.BRIDGE_CHROME_SSO_DOMAIN ?? ".zhuanspirit.com").trim();
  return d || ".zhuanspirit.com";
}

/** 解析 chrome-sso-cookie 脚本 JSON 输出为 Cookie 头 */
export function cookieHeaderFromChromeSsoJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const line =
    trimmed
      .split(/\r?\n/)
      .map((x) => x.trim())
      .find((x) => x.startsWith("{")) ?? trimmed;
  try {
    const parsed = JSON.parse(line) as {
      error?: string;
      cookies?: { name?: string; value?: string }[];
    };
    if (parsed.error) return "";
    const parts: string[] = [];
    for (const c of parsed.cookies ?? []) {
      const name = String(c.name ?? "").trim();
      const value = String(c.value ?? "").trim();
      if (name && value) parts.push(`${name}=${value}`);
    }
    return parts.join("; ");
  } catch {
    return "";
  }
}

function findGitBash(): string {
  const env = process.env.BRIDGE_GIT_BASH?.trim();
  if (env && fs.existsSync(env)) return env;
  for (const c of [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ]) {
    if (fs.existsSync(c)) return c;
  }
  return "";
}

function chromeSsoSkillScriptPath(): string {
  const custom = process.env.BRIDGE_CHROME_SSO_SKILL_SCRIPT?.trim();
  if (custom && fs.existsSync(custom)) return custom;
  return path.join(os.homedir(), SKILL_REL);
}

function tryChromeSsoSkillScript(domain: string): ChromeSsoCookieResult {
  const script = chromeSsoSkillScriptPath();
  if (!fs.existsSync(script)) {
    return { value: "", via: "none", detail: "skill_script_missing" };
  }
  const bash = findGitBash();
  if (!bash) {
    return { value: "", via: "none", detail: "git_bash_missing" };
  }
  const dir = path.dirname(script).replace(/\\/g, "/");
  const domainArg = domain.replace(/"/g, '\\"');
  const cmd = `cd "${dir}" && bash "${path.basename(script)}" -d "${domainArg}"`;
  const r = spawnSync(bash, ["-lc", cmd], {
    encoding: "utf8",
    timeout: Number(process.env.BRIDGE_CHROME_SSO_TIMEOUT_MS ?? 90_000),
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env },
  });
  const header = cookieHeaderFromChromeSsoJson(String(r.stdout ?? ""));
  if (header) {
    return { value: header, via: "chrome_sso_skill" };
  }
  return {
    value: "",
    via: "none",
    detail: String(r.stderr ?? "")
      .trim()
      .slice(0, 200) || `skill_exit_${r.status ?? "?"}`,
  };
}

function chromeUserDataDir(): string {
  const custom = process.env.BRIDGE_CHROME_USER_DATA?.trim();
  if (custom && fs.existsSync(custom)) return custom;
  const local = process.env.LOCALAPPDATA;
  if (!local) return "";
  return path.join(local, "Google", "Chrome", "User Data");
}

function copyToTemp(src: string): string | null {
  try {
    const tmp = path.join(os.tmpdir(), `yy-chrome-cookies-${process.pid}-${Date.now()}.db`);
    fs.copyFileSync(src, tmp);
    return tmp;
  } catch {
    return null;
  }
}

function getWindowsChromeAesKey(userDataDir: string): Buffer | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Dpapi } = require("@primno/dpapi") as {
      Dpapi: { unprotectData: (data: Buffer, entropy: Buffer | null, scope: string) => Uint8Array };
    };
    const localStatePath = path.join(userDataDir, "Local State");
    const raw = JSON.parse(fs.readFileSync(localStatePath, "utf8")) as {
      os_crypt?: { encrypted_key?: string };
    };
    const b64 = raw.os_crypt?.encrypted_key;
    if (!b64) return null;
    const encKey = Buffer.from(b64, "base64");
    if (encKey.slice(0, 5).toString() !== "DPAPI") return null;
    return Buffer.from(Dpapi.unprotectData(encKey.slice(5), null, "CurrentUser"));
  } catch {
    return null;
  }
}

function sqlJsDistDir(): string {
  const candidates = [
    path.join(__dirname, "..", "node_modules", "sql.js", "dist"),
    path.join(__dirname, "..", "..", "node_modules", "sql.js", "dist"),
    path.join(process.cwd(), "node_modules", "sql.js", "dist"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "sql-wasm.wasm"))) return c;
  }
  return candidates[0];
}

function readWindowsCookiesWithSpawn(
  tmpDb: string,
  domain: string,
  aesKey: Buffer
): ChromeSsoCookieResult {
  const wasmDir = sqlJsDistDir().replace(/\\/g, "/");
  const inline = `
const fs=require('fs');const crypto=require('crypto');const path=require('path');
const initSqlJs=require('sql.js');
const tmp=${JSON.stringify(tmpDb.replace(/\\/g, "/"))};
const domain=${JSON.stringify(domain)};
const aesKey=Buffer.from(${JSON.stringify(Array.from(aesKey))});
const wasmDir=${JSON.stringify(wasmDir)};
(async()=>{
  const SQL=await initSqlJs({locateFile:f=>path.join(wasmDir,f)});
  const db=new SQL.Database(new Uint8Array(fs.readFileSync(tmp)));
  const hostLike=domain.startsWith('.')?'%'+domain.slice(1)+'%':'%'+domain+'%';
  const stmt=db.prepare('SELECT name,value,encrypted_value FROM cookies WHERE host_key LIKE ?');
  stmt.bind([hostLike]);
  const parts=[];
  while(stmt.step()){
    const row=stmt.getAsObject();
    const name=String(row.name||'').trim();
    if(!name) continue;
    let val=String(row.value||'').trim();
    const enc=row.encrypted_value;
    if(enc&&enc.length){
      const buf=Buffer.from(enc);
      const pre=buf.slice(0,3).toString();
      if(pre==='v10'||pre==='v11'){
        const iv=buf.slice(3,15);
        const data=buf.slice(15,buf.length-16);
        const tag=buf.slice(buf.length-16);
        const d=crypto.createDecipheriv('aes-256-gcm',aesKey,iv);
        d.setAuthTag(tag);
        val=Buffer.concat([d.update(data),d.final()]).toString('utf8');
      }
    }
    if(val) parts.push(name+'='+val);
  }
  stmt.free();
  db.close();
  process.stdout.write(JSON.stringify({ok:!!parts.length,header:parts.join('; ')}));
})().catch(e=>{process.stdout.write(JSON.stringify({ok:false,detail:String(e).slice(0,200)}));process.exit(1);});
`;
  const r = spawnSync(process.execPath, ["-e", inline], {
    encoding: "utf8",
    timeout: Number(process.env.BRIDGE_CHROME_SSO_TIMEOUT_MS ?? 45_000),
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    cwd: path.join(__dirname, ".."),
  });
  try {
    const out = JSON.parse(String(r.stdout ?? "").trim() || "{}") as {
      ok?: boolean;
      header?: string;
      detail?: string;
    };
    if (out.ok && out.header) {
      return { value: out.header, via: "windows_chrome" };
    }
    return { value: "", via: "none", detail: out.detail ?? `spawn_exit_${r.status}` };
  } catch {
    return { value: "", via: "none", detail: "spawn_parse_fail" };
  }
}

function tryWindowsChromeCookies(domain: string): ChromeSsoCookieResult {
  const userData = chromeUserDataDir();
  if (!userData) {
    return { value: "", via: "none", detail: "no_chrome_user_data" };
  }
  const aesKey = getWindowsChromeAesKey(userData);
  if (!aesKey?.length) {
    return { value: "", via: "none", detail: "no_aes_key" };
  }
  const cookiePath = [
    path.join(userData, "Default", "Network", "Cookies"),
    path.join(userData, "Default", "Cookies"),
  ].find((p) => fs.existsSync(p));
  if (!cookiePath) {
    return { value: "", via: "none", detail: "cookies_db_missing" };
  }
  const tmp = copyToTemp(cookiePath);
  if (!tmp) {
    return { value: "", via: "none", detail: "cookies_db_locked" };
  }
  try {
    return readWindowsCookiesWithSpawn(tmp, domain, aesKey);
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

let ssoMemo: { at: number; result: ChromeSsoCookieResult } | null = null;
const SSO_MEMO_MS = 25_000;

/**
 * 桥 C 内置：从本机 Chrome 读取 SSO Cookie（Windows 内置 / macOS 调 chrome-sso-cookie skill）
 */
export function tryChromeSsoCookie(): ChromeSsoCookieResult {
  if (chromeSsoDisabled()) {
    return { value: "", via: "none", detail: "disabled" };
  }
  if (ssoMemo && Date.now() - ssoMemo.at < SSO_MEMO_MS) {
    return ssoMemo.result;
  }
  const domain = defaultChromeSsoDomain();
  let result: ChromeSsoCookieResult = { value: "", via: "none" };

  if (process.platform === "win32") {
    result = tryWindowsChromeCookies(domain);
  } else if (process.platform === "darwin") {
    result = tryChromeSsoSkillScript(domain);
  }

  ssoMemo = { at: Date.now(), result };
  return result;
}
