import { rawMarkdownLooksLikeAccessOrErrorPage } from "./dashenContentGuard";
import { resolveDashenHttpCookie } from "./dashenCookieLoader";
import { requestOnce } from "./dashenResolveHttp";

const DASHEN_REST_BASE = "https://dashen.zhuanspirit.com/rest/api/content";

export type DashenHttpPageResult = {
  body: string;
  title?: string;
  pageId: string;
};

/**
 * 用桥 C 内嵌登录 Cookie（及可选 MCP access_token）直连 Confluence REST，绕过 MCP getPageContent 401。
 */
export async function fetchDashenPageStorageViaHttp(
  pageId: string,
  mcpHeaders?: Record<string, string>
): Promise<DashenHttpPageResult | null> {
  const pid = String(pageId ?? "").trim();
  if (!pid || !/^\d+$/.test(pid)) return null;

  const cookie = resolveDashenHttpCookie().value;
  if (!cookie) return null;

  const url = `${DASHEN_REST_BASE}/${pid}?expand=body.storage,title`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    Cookie: cookie,
  };
  const bearerTok = mcpHeaders?.access_token ?? mcpHeaders?.["access_token"];
  if (typeof bearerTok === "string" && bearerTok.trim()) {
    headers.Authorization = `Bearer ${bearerTok.trim()}`;
  }

  const insecureTls = process.env.BRIDGE_DASHEN_HTTP_INSECURE_TLS === "1";
  let res: { status: number; body: string };
  try {
    res = await requestOnce(url, headers, !insecureTls);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      !insecureTls &&
      /CERT|SSL|TLS|UNABLE_TO_VERIFY|unable to verify|self signed|hostname/i.test(msg)
    ) {
      try {
        res = await requestOnce(url, headers, false);
      } catch {
        return null;
      }
    } else {
      return null;
    }
  }

  if (res.status < 200 || res.status >= 300) return null;

  const guard = rawMarkdownLooksLikeAccessOrErrorPage(res.body);
  if (guard.reject) return null;

  let j: Record<string, unknown>;
  try {
    j = JSON.parse(res.body) as Record<string, unknown>;
  } catch {
    return null;
  }

  const bodyObj = j.body as { storage?: { value?: string } } | undefined;
  const storage = typeof bodyObj?.storage?.value === "string" ? bodyObj.storage.value.trim() : "";
  if (!storage) return null;

  const title = typeof j.title === "string" ? j.title.trim() : undefined;
  const id = typeof j.id === "string" ? j.id.trim() : pid;
  return { body: storage, title, pageId: id };
}

export function dashenMcpErrorLooksLikeAuthFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /鉴权|xml_status_401|xml_status_403|401_unauthorized|client_must_be_authenticated|atlassian_auth/i.test(
    msg
  );
}
