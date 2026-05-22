/**
 * 桥 C 回传的「大神正文」有时实为鉴权失败 / 错误页（仍非空字符串），
 * 若直接送入「需求文档整理」LLM，会产出与 TAPD 无关的假需求 MD。
 */
export function rawMarkdownLooksLikeAccessOrErrorPage(raw: string): { reject: boolean; reason?: string } {
  const s = String(raw ?? "").trim();
  if (!s) return { reject: false };

  const lower = s.toLowerCase();
  const compact = s.replace(/\s+/g, " ");

  // 常见 Confluence/REST 鉴权 XML（含换行缩进：<status-code>\n  401\n  </status-code>）
  if (/<status-code>[\s\r\n]*401[\s\r\n]*<\/status-code>/i.test(s)) {
    return { reject: true, reason: "xml_status_401" };
  }
  if (/<status-code>[\s\r\n]*403[\s\r\n]*<\/status-code>/i.test(s)) {
    return { reject: true, reason: "xml_status_403" };
  }
  // HTML 实体编码（页面或中间层转义）
  if (/&lt;status-code&gt;[\s\r\n]*401[\s\r\n]*&lt;\/status-code&gt;/i.test(s)) {
    return { reject: true, reason: "entity_xml_status_401" };
  }

  if (/client must be authenticated/i.test(s)) {
    return { reject: true, reason: "client_must_be_authenticated" };
  }
  if (/authenticated to access this resource/i.test(lower)) {
    return { reject: true, reason: "atlassian_auth_resource_message" };
  }

  if (/\b401\s+unauthorized\b/i.test(s) || /\b401\s*:\s*unauthorized\b/i.test(lower)) {
    return { reject: true, reason: "401_unauthorized_text" };
  }
  if (/<title>[^<]*401[^<]*<\/title>/i.test(s) && s.length < 8000) {
    return { reject: true, reason: "html_title_401" };
  }
  if (/<h1[^>]*>\s*401\b/i.test(s) && s.length < 8000) {
    return { reject: true, reason: "html_h1_401" };
  }
  if (/<title>[^<]*403[^<]*forbidden/i.test(s) && s.length < 8000) {
    return { reject: true, reason: "html_403" };
  }
  if (/<title>[^<]*404[^<]*not found/i.test(s) && s.length < 4000) {
    return { reject: true, reason: "html_404_short" };
  }

  // MCP / JSON 包装里的状态码（无尖括号）
  if (/"status-code"\s*:\s*"401"/i.test(s) || /'status-code'\s*:\s*'401'/i.test(s)) {
    return { reject: true, reason: "json_status_401" };
  }
  if (/"status_code"\s*:\s*401\b/i.test(s)) {
    return { reject: true, reason: "json_status_code_401" };
  }

  // 单行压扁后仍含典型鉴权块（防非常规空白）
  if (/<status-code>\s*401\s*<\/status-code>/i.test(compact)) {
    return { reject: true, reason: "xml_status_401_compact" };
  }

  return { reject: false };
}
