import { session, type Session } from "electron";

/** 内嵌大神登录 webview 与 Cookie 读取共用同一持久分区 */
export const DASHEN_ELECTRON_PARTITION = "persist:dashen";

export const DEFAULT_DASHEN_LOGIN_URL =
  "https://dashen.zhuanspirit.com/spaces/bangmaipm/pages/44431429";

export function getDashenElectronSession(): Session {
  return session.fromPartition(DASHEN_ELECTRON_PARTITION);
}
