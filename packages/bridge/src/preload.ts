import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("yyBridge", {
  getSettings: (): Promise<Record<string, unknown>> => ipcRenderer.invoke("yy:getSettings"),
  setSettings: (s: Record<string, unknown>): Promise<void> => ipcRenderer.invoke("yy:setSettings", s),
  pullProjects: (): Promise<unknown> => ipcRenderer.invoke("yy:pullProjects"),
  pollTasksOnce: (): Promise<string> => ipcRenderer.invoke("yy:pollTasksOnce"),
  refreshDashenCookies: (): Promise<{ cookieChars: number; hasSso: boolean; cookieCount: number }> =>
    ipcRenderer.invoke("yy:refreshDashenCookies"),
  getDashenLoginUrl: (): Promise<{ url: string }> => ipcRenderer.invoke("yy:getDashenLoginUrl"),
  testDashenShortLink: (payload: {
    url?: string;
  }): Promise<{
    ok: boolean;
    pageId?: string | null;
    finalUrl?: string | null;
    cookieSource: string;
    error?: string;
    detail?: string;
  }> => ipcRenderer.invoke("yy:testDashenShortLink", payload),
  onLog: (cb: (line: string) => void): (() => void) => {
    const fn = (_e: unknown, line: string): void => cb(line);
    ipcRenderer.on("yy:log", fn);
    return () => ipcRenderer.removeListener("yy:log", fn);
  },
});
