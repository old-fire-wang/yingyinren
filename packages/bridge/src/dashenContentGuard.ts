/** 与 packages/api/src/lib/rawMarkdownGuard.ts 保持同一套规则 */
export function rawMarkdownLooksLikeAccessOrErrorPage(raw: string): { reject: boolean; reason?: string } {
  const s = String(raw ?? "").trim();
  if (!s) return { reject: false };

  const lower = s.toLowerCase();
  const compact = s.replace(/\s+/g, " ");

  if (/<status-code>[\s\r\n]*401[\s\r\n]*<\/status-code>/i.test(s)) {
    return { reject: true, reason: "xml_status_401" };
  }
  if (/<status-code>[\s\r\n]*403[\s\r\n]*<\/status-code>/i.test(s)) {
    return { reject: true, reason: "xml_status_403" };
  }
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
  if (/"status-code"\s*:\s*"401"/i.test(s) || /'status-code'\s*:\s*'401'/i.test(s)) {
    return { reject: true, reason: "json_status_401" };
  }
  if (/<status-code>\s*401\s*<\/status-code>/i.test(compact)) {
    return { reject: true, reason: "xml_status_401_compact" };
  }

  return { reject: false };
}
