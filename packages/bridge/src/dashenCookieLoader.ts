import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { tryChromeSsoCookie, cookieHeaderFromChromeSsoJson } from "./chromeSsoCookie";
import { getElectronSessionCookieHeader } from "./electronSessionCookie";

export type DashenCookieSource =
  | "inline"
  | "file"
  | "script"
  | "chrome_sso"
  | "electron_session"
  | "browser_env"
  | "demand_script"
  | "demand_config"
  | "none";

/** 解析结果（不打印 cookie 正文，仅用于日志） */
export type ResolvedDashenCookie = {
  value: string;
  source: DashenCookieSource;
};

let memo: (ResolvedDashenCookie & { at: number }) | null = null;
const MEMO_MS = 25_000;

/** 内嵌登录刷新 Cookie 后须调用，避免 25s 内仍用旧的空 Cookie */
export function invalidateDashenHttpCookieMemo(): void {
  memo = null;
}

function resolvePath(p: string): string {
  const t = p.trim();
  if (!t) return t;
  if (path.isAbsolute(t)) return t;
  return path.join(process.cwd(), t);
}

function demandSkillDisabled(): boolean {
  return process.env.BRIDGE_DASHEN_DISABLE_DEMAND_SKILL === "1";
}

function demandSkillConfigPath(): string {
  const custom = process.env.BRIDGE_DASHEN_DEMAND_CONFIG?.trim();
  if (custom) return resolvePath(custom);
  return path.join(os.homedir(), ".config", "demand-skill", "config.json");
}

function demandSkillScriptsDir(): string {
  const custom = process.env.BRIDGE_DASHEN_DEMAND_SCRIPTS_DIR?.trim();
  if (custom) return resolvePath(custom);
  return path.join(os.homedir(), ".claude", "skills", "demand-skill", "scripts");
}

function readDemandSkillConfigCookie(): string {
  const cfgPath = demandSkillConfigPath();
  try {
    if (!fs.existsSync(cfgPath)) return "";
    const raw = fs.readFileSync(cfgPath, "utf8");
    const cfg = JSON.parse(raw) as { cookie?: string };
    return String(cfg.cookie ?? "").trim();
  } catch {
    return "";
  }
}

function firstNonEmptyStdoutLine(stdout: string): string {
  return (
    stdout
      .split(/\r?\n/)
      .map((x) => x.trim())
      .find((x) => x.length > 0) ?? ""
  );
}

function runCookieScriptFile(absScript: string): string {
  if (!fs.existsSync(absScript)) return "";
  const ext = path.extname(absScript).toLowerCase();
  const explicitPy = process.env.BRIDGE_DASHEN_HTTP_COOKIE_PYTHON?.trim();

  let cmd: string;
  let args: string[];

  if (ext === ".py") {
    if (explicitPy) {
      cmd = explicitPy;
      args = ["-u", absScript];
    } else if (process.platform === "win32") {
      cmd = "py";
      args = ["-3", "-u", absScript];
    } else {
      cmd = "python3";
      args = ["-u", absScript];
    }
  } else if (ext === ".ps1") {
    cmd =
      process.env.SystemRoot && process.platform === "win32"
        ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
        : "powershell.exe";
    args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", absScript];
  } else if (ext === ".cmd" || ext === ".bat") {
    cmd = process.env.ComSpec || "cmd.exe";
    args = ["/c", absScript];
  } else if (ext === ".sh") {
    const bash =
      process.env.BRIDGE_GIT_BASH?.trim() ||
      (process.platform === "win32"
        ? ["C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files (x86)\\Git\\bin\\bash.exe"].find((p) =>
            fs.existsSync(p)
          )
        : "/bin/bash");
    if (!bash || !fs.existsSync(bash)) return "";
    cmd = bash;
    args = [absScript];
  } else {
    cmd = absScript;
    args = [];
  }

  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    timeout: Number(process.env.BRIDGE_DASHEN_HTTP_COOKIE_SCRIPT_TIMEOUT_MS ?? 30_000),
    maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env },
    windowsHide: true,
  });
  if (r.error || (r.status !== 0 && r.status != null)) {
    if (r.stderr?.trim() && process.env.BRIDGE_DASHEN_COOKIE_SCRIPT_LOG === "1") {
      console.warn("[dashenCookieLoader] script stderr:", String(r.stderr).trim().slice(0, 500));
    }
    return "";
  }
  const stdout = String(r.stdout ?? "");
  const fromJson = cookieHeaderFromChromeSsoJson(stdout);
  if (fromJson) return fromJson;
  return firstNonEmptyStdoutLine(stdout);
}

/**
 * demand-skill 约定：平台 isZagentWeb / BROWSER_COOKIES → get_browser_cookies.py；
 * 本地 ~/.zzcli → get_chrome_cookie.py；最后 ~/.config/demand-skill/config.json 的 cookie。
 */
function tryDemandSkillCookieChain(): ResolvedDashenCookie {
  if (demandSkillDisabled()) {
    return { value: "", source: "none" };
  }

  const browserCookies = process.env.BROWSER_COOKIES?.trim();
  if (browserCookies) {
    return { value: browserCookies, source: "browser_env" };
  }

  const scriptsDir = demandSkillScriptsDir();
  const browserScript = path.join(scriptsDir, "get_browser_cookies.py");
  const chromeScript = path.join(scriptsDir, "get_chrome_cookie.py");
  const isPlatform =
    process.env.isZagentWeb === "true" || process.env.IS_ZAGENT_WEB === "true";
  const zzcliDir = path.join(os.homedir(), ".zzcli");

  if (isPlatform) {
    const fromBrowserScript = runCookieScriptFile(browserScript);
    if (fromBrowserScript) {
      return { value: fromBrowserScript, source: "demand_script" };
    }
  } else if (fs.existsSync(zzcliDir)) {
    const fromChromeScript = runCookieScriptFile(chromeScript);
    if (fromChromeScript) {
      return { value: fromChromeScript, source: "demand_script" };
    }
  } else {
    // 非平台且无 zzcli：仍尝试 browser 脚本（部分环境只装了 demand-skill）
    const fromBrowserScript = runCookieScriptFile(browserScript);
    if (fromBrowserScript) {
      return { value: fromBrowserScript, source: "demand_script" };
    }
    const fromChromeScript = runCookieScriptFile(chromeScript);
    if (fromChromeScript) {
      return { value: fromChromeScript, source: "demand_script" };
    }
  }

  const fromConfig = readDemandSkillConfigCookie();
  if (fromConfig) {
    return { value: fromConfig, source: "demand_config" };
  }

  return { value: "", source: "none" };
}

/**
 * 大神短链 HTTP 跟链用的 Cookie，优先级：
 * 1. BRIDGE_DASHEN_HTTP_COOKIE（桥 C 设置 / 整段 Cookie 串）
 * 2. BRIDGE_DASHEN_HTTP_COOKIE_FILE
 * 3. BRIDGE_DASHEN_HTTP_COOKIE_SCRIPT（用户指定脚本）
 * 4. 桥 C 内嵌大神登录 webview（partition persist:dashen，优先推荐）
 * 5. 桥 C 内置 Chrome SSO（Windows 读 Chrome / macOS 调 chrome-sso-cookie skill）
 * 6. demand-skill：BROWSER_COOKIES → get_browser_cookies.py / get_chrome_cookie.py → ~/.config/demand-skill/config.json
 *
 * 约 25s 内重复调用会复用结果。
 */
export function resolveDashenHttpCookie(): ResolvedDashenCookie {
  if (memo && Date.now() - memo.at < MEMO_MS) {
    return { value: memo.value, source: memo.source };
  }
  const r = resolveDashenHttpCookieUncached();
  memo = { ...r, at: Date.now() };
  return r;
}

function resolveDashenHttpCookieUncached(): ResolvedDashenCookie {
  const inline = process.env.BRIDGE_DASHEN_HTTP_COOKIE?.trim();
  if (inline) {
    return { value: inline, source: "inline" };
  }

  const filePath = process.env.BRIDGE_DASHEN_HTTP_COOKIE_FILE?.trim();
  if (filePath) {
    try {
      const abs = resolvePath(filePath);
      const raw = fs.readFileSync(abs, "utf8");
      const line = firstNonEmptyStdoutLine(raw);
      if (line) return { value: line, source: "file" };
    } catch {
      /* ignore */
    }
  }

  const scriptPath = process.env.BRIDGE_DASHEN_HTTP_COOKIE_SCRIPT?.trim();
  if (scriptPath) {
    const line = runCookieScriptFile(resolvePath(scriptPath));
    if (line) {
      return { value: line, source: "script" };
    }
  }

  const electronSession = getElectronSessionCookieHeader().trim();
  if (electronSession) {
    return { value: electronSession, source: "electron_session" };
  }

  const chromeSso = tryChromeSsoCookie();
  if (chromeSso.value) {
    return { value: chromeSso.value, source: "chrome_sso" };
  }

  const demand = tryDemandSkillCookieChain();
  if (demand.value) {
    return demand;
  }

  return { value: "", source: "none" };
}
