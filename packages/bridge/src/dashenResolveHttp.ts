import http from "http";
import https from "https";
import { URL } from "url";
import { resolveDashenHttpCookie } from "./dashenCookieLoader";

const MAX_BODY_CHARS = 350_000;
const MAX_REDIRECTS = 24;

function looksLikeSsoOrLogin(url: string): boolean {
  try {
    const u = new URL(url);
    return /zzsso\.zhuanspirit\.com$/i.test(u.hostname) || /\/login\b/i.test(u.pathname);
  } catch {
    return false;
  }
}

/** 从 Location、当前 URL 或 HTML 片段中抠大神 pageId（数字） */
export function extractPageIdFromDashenHttpPayload(url: string, body: string): string | null {
  const hay = `${url}\n${body}`;
  const patterns: RegExp[] = [
    /[?&]pageId=(\d+)/i,
    /pageId%3D(\d+)/i,
    /viewpage\.action[^"'#?]*[?&]pageId=(\d+)/i,
    /\/wiki\/spaces\/[^/]+\/pages\/(\d+)/i,
    /\/spaces\/[^/]+\/pages\/(\d+)/i,
    /\/pages\/(\d+)\b/i,
    /"pageId"\s*:\s*"?(\d+)"?/,
    /"id"\s*:\s*"(\d{6,})"/,
    /data-page-id\s*=\s*["']?(\d+)/i,
    /ajs-page-id[^>]*?(\d{6,})/i,
  ];
  for (const re of patterns) {
    const m = hay.match(re);
    if (m?.[1] && /^\d+$/.test(m[1])) return m[1];
  }
  return null;
}

function tryDecodeURIComponent(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

/**
 * SSO 302 的 Location 里常带 return_url / service / redirect 等，其中嵌套真实 dashen URL（含 pageId）。
 */
export function extractPageIdFromRedirectQueryParams(redirectUrl: string): string | null {
  const chunks: string[] = [redirectUrl];
  try {
    const u = new URL(redirectUrl);
    const names = [
      "return_url",
      "returnUrl",
      "redirect",
      "redirect_uri",
      "redirectUri",
      "service",
      "goto",
      "target",
      "url",
      "callback",
      "RelayState",
      "next",
      "dest",
      "destination",
    ];
    for (const k of u.searchParams.keys()) {
      const raw = u.searchParams.get(k);
      if (!raw) continue;
      chunks.push(raw);
      const once = tryDecodeURIComponent(raw);
      chunks.push(once);
      if (once !== raw) {
        let d = once;
        for (let j = 0; j < 3; j += 1) {
          const next = tryDecodeURIComponent(d);
          if (next === d) break;
          chunks.push(next);
          d = next;
        }
      }
    }
    for (const [, v] of u.searchParams) {
      if (names.some((n) => v.includes(n + "=") || v.includes(n + "%3D"))) {
        chunks.push(v);
        chunks.push(tryDecodeURIComponent(v));
      }
    }
  } catch {
    /* ignore */
  }
  const uniq = [...new Set(chunks.map((c) => c.trim()).filter(Boolean))];
  for (const c of uniq) {
    const pid = extractPageIdFromDashenHttpPayload(c, "");
    if (pid) return pid;
  }
  return null;
}

export function requestOnce(
  targetUrl: string,
  headers: Record<string, string>,
  rejectUnauthorized: boolean
): Promise<{ status: number; location?: string; body: string }> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(targetUrl);
    } catch {
      reject(new Error("invalid_url"));
      return;
    }
    const isHttps = u.protocol === "https:";
    const lib = isHttps ? https : http;
    const defaultPort = isHttps ? 443 : 80;
    const port = u.port ? Number(u.port) : defaultPort;
    const opts: https.RequestOptions = {
      hostname: u.hostname,
      port,
      path: u.pathname + u.search,
      method: "GET",
      headers: {
        "User-Agent": "yingyinren-bridge/1.0",
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        ...headers,
        Host: u.host,
      },
      rejectUnauthorized: isHttps ? rejectUnauthorized : undefined,
    };
    const req = lib.request(opts, (res) => {
      const loc = res.headers.location;
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        if (body.length < MAX_BODY_CHARS) body += chunk;
      });
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          location: typeof loc === "string" ? loc : Array.isArray(loc) ? loc[0] : undefined,
          body,
        });
      });
    });
    req.on("error", reject);
    req.setTimeout(25_000, () => {
      req.destroy(new Error("http_timeout"));
    });
    req.end();
  });
}

/**
 * 跟随 dashen 短链重定向，用与 MCP 相同的 access_token（及可选 Cookie）解析出 pageId。
 * 短链在 CQL 里常搜不到；与内网排障文档一致：先 HTTP 跟链再 getPageContent。
 */
export async function resolveDashenPageIdByHttpRedirects(
  startUrl: string,
  mcpHeaders: Record<string, string>
): Promise<{ pageId: string; finalUrl?: string } | null> {
  const u0 = String(startUrl ?? "").trim();
  if (!u0 || !/^https?:\/\//i.test(u0)) return null;

  const insecureTls = process.env.BRIDGE_DASHEN_HTTP_INSECURE_TLS === "1";
  const extraCookie = resolveDashenHttpCookie().value;

  const headers: Record<string, string> = { ...mcpHeaders };
  if (extraCookie) {
    headers.Cookie = headers.Cookie ? `${headers.Cookie}; ${extraCookie}` : extraCookie;
  }
  const bearerTok = headers.access_token ?? headers["access_token"];
  if (
    process.env.BRIDGE_DASHEN_HTTP_BEARER === "1" &&
    typeof bearerTok === "string" &&
    bearerTok.trim() &&
    !headers.Authorization &&
    !headers.authorization
  ) {
    headers.Authorization = `Bearer ${bearerTok.trim()}`;
  }

  let current = u0;
  const seen = new Set<string>();

  for (let i = 0; i < MAX_REDIRECTS; i += 1) {
    if (seen.has(current)) break;
    seen.add(current);

    let res: { status: number; location?: string; body: string };
    try {
      res = await requestOnce(current, headers, !insecureTls);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        !insecureTls &&
        /CERT|SSL|TLS|UNABLE_TO_VERIFY|unable to verify|self signed|hostname/i.test(msg)
      ) {
        try {
          res = await requestOnce(current, headers, false);
        } catch {
          break;
        }
      } else {
        break;
      }
    }

    const fromLoc = res.location ? extractPageIdFromDashenHttpPayload(res.location, "") : null;
    if (fromLoc) {
      try {
        const abs = new URL(res.location!, current).href;
        return { pageId: fromLoc, finalUrl: abs };
      } catch {
        return { pageId: fromLoc, finalUrl: res.location };
      }
    }
    if (res.location) {
      try {
        const absLoc = new URL(res.location, current).href;
        const fromNest = extractPageIdFromRedirectQueryParams(absLoc);
        if (fromNest) return { pageId: fromNest, finalUrl: absLoc };
      } catch {
        /* ignore */
      }
    }

    const fromBody = extractPageIdFromDashenHttpPayload(current, res.body);
    if (fromBody && res.status >= 200 && res.status < 500) {
      return { pageId: fromBody, finalUrl: current };
    }

    if ([301, 302, 303, 307, 308].includes(res.status) && res.location) {
      let next: string;
      try {
        next = new URL(res.location, current).href;
      } catch {
        break;
      }
      const fromSsoQuery = looksLikeSsoOrLogin(next)
        ? extractPageIdFromRedirectQueryParams(next)
        : null;
      if (fromSsoQuery) {
        return { pageId: fromSsoQuery, finalUrl: next };
      }
      if (looksLikeSsoOrLogin(next) && !extraCookie) {
        if (process.env.BRIDGE_DASHEN_HTTP_DEBUG === "1") {
          console.warn("[dashenResolveHttp] stopped at SSO without cookie:", next);
        }
        break;
      }
      current = next;
      continue;
    }
    break;
  }
  return null;
}
