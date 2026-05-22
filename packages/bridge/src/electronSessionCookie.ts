import { getDashenElectronSession } from "./dashenSession";
import { invalidateDashenHttpCookieMemo } from "./dashenCookieLoader";

/** 桥 C 内嵌大神 webview 会话中的 SSO Cookie（与 partition persist:dashen 一致） */
let cachedHeader = "";

/** 跟链会经过 zzsso，须一并带上该域 Cookie */
const DASHEN_COOKIE_DOMAINS = [
  "zhuanspirit.com",
  ".zhuanspirit.com",
  "dashen.zhuanspirit.com",
  "zzsso.zhuanspirit.com",
  ".zzsso.zhuanspirit.com",
];

export function getElectronSessionCookieHeader(): string {
  return cachedHeader;
}

export type DashenLoginCookieStatus = {
  cookieChars: number;
  hasSso: boolean;
  cookieCount: number;
};

export async function refreshElectronSessionCookieHeader(): Promise<string> {
  const ses = getDashenElectronSession();
  const seen = new Set<string>();
  const parts: string[] = [];

  const mergeList = (list: Electron.Cookie[]): void => {
    for (const c of list) {
      const name = String(c.name ?? "").trim();
      const value = String(c.value ?? "").trim();
      if (!name || !value) continue;
      const pair = `${name}=${value}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      parts.push(pair);
    }
  };

  try {
    mergeList(await ses.cookies.get({}));
  } catch {
    /* fallback: per-domain */
    for (const domain of DASHEN_COOKIE_DOMAINS) {
      try {
        mergeList(await ses.cookies.get({ domain }));
      } catch {
        /* ignore */
      }
    }
  }

  cachedHeader = parts.join("; ");
  invalidateDashenHttpCookieMemo();
  return cachedHeader;
}

export async function getDashenLoginCookieStatus(): Promise<DashenLoginCookieStatus> {
  const header = await refreshElectronSessionCookieHeader();
  const ses = getDashenElectronSession();
  let cookieCount = 0;
  try {
    cookieCount = (await ses.cookies.get({})).length;
  } catch {
    for (const domain of DASHEN_COOKIE_DOMAINS) {
      try {
        cookieCount += (await ses.cookies.get({ domain })).length;
      } catch {
        /* ignore */
      }
    }
  }
  return {
    cookieChars: header.length,
    hasSso: /sso_/i.test(header),
    cookieCount,
  };
}
