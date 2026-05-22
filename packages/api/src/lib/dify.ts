import fs from "fs/promises";
import path from "path";

/** 配置里若写成 `http://host/v1`，与下方硬编码 `/v1/datasets` 会拼成双 `/v1/v1`；去掉尾部 `/v1` 再拼路径 */
function normalizeDifyBaseUrl(raw: string): string {
  let b = raw.trim().replace(/\/+$/, "");
  if (b.endsWith("/v1")) {
    b = b.slice(0, -3).replace(/\/+$/, "");
  }
  return b;
}

export async function difyCreateDocumentByFile(params: {
  difyBaseUrl: string;
  difyApiKey: string;
  datasetId: string;
  filePath: string;
  originalName: string;
}): Promise<{ documentId: string }> {
  const base = normalizeDifyBaseUrl(params.difyBaseUrl);
  const url =
    base +
    "/v1/datasets/" +
    encodeURIComponent(params.datasetId) +
    "/document/create-by-file";
  const buf = await fs.readFile(params.filePath);
  const fd = new FormData();
  fd.append(
    "file",
    new Blob([buf], { type: "text/markdown" }),
    path.basename(params.originalName)
  );
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + params.difyApiKey,
    },
    body: fd,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error("dify_http_" + res.status + ":" + text.slice(0, 800));
  }
  let json: { document?: { id?: string }; id?: string } = {};
  try {
    json = JSON.parse(text) as { document?: { id?: string }; id?: string };
  } catch {
    throw new Error("dify_bad_json:" + text.slice(0, 200));
  }
  const documentId = json.document?.id ?? json.id;
  if (!documentId) throw new Error("dify_no_document_id:" + text.slice(0, 400));
  return { documentId };
}

export async function difyPing(params: {
  difyBaseUrl: string;
  difyApiKey: string;
  datasetId: string;
}): Promise<void> {
  const base = normalizeDifyBaseUrl(params.difyBaseUrl);
  const url =
    base +
    "/v1/datasets/" +
    encodeURIComponent(params.datasetId);
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: "Bearer " + params.difyApiKey },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("dify_ping_" + res.status + ":" + t.slice(0, 400));
  }
}
