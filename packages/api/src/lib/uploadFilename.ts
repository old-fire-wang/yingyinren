/**
 * Multer/busboy 常将 multipart 文件名按 Latin-1 解析，中文 UTF-8 会变成 mojibake。
 * 将误读的 Latin-1 字节序列还原为 UTF-8 字符串。
 */
export function decodeUploadedFilename(raw: string): string {
  if (!raw) return raw;
  const looksMojibake = [...raw].some(
    (c) => c.charCodeAt(0) >= 0x80 && c.charCodeAt(0) <= 0xff
  );
  if (!looksMojibake) return raw;
  const decoded = Buffer.from(raw, "latin1").toString("utf8");
  if (/[\u4e00-\u9fff]/.test(decoded)) return decoded;
  if (!decoded.includes("\uFFFD")) return decoded;
  return raw;
}
