import {
  Alert,
  Badge,
  Button,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import MDEditor from "@uiw/react-md-editor";
import api from "../api";
import {
  REQ_STATUS_ORDER,
  requirementStatusLabel,
  requirementStatusTagColor,
} from "../requirementStatus";

type Project = {
  id: number;
  projectId: string;
  projectName: string;
};

type ReqRow = {
  id: number;
  tapdId: string;
  title: string;
  onlineTime: string;
  status: string;
  mdFileSize: number | null;
  mdContent?: string | null;
};

/** Modal 关闭后恢复 body 滚动（Ant Design + MDEditor 偶发未解锁） */
function unlockPageScroll(): void {
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
  document.body.style.removeProperty("width");
  document.documentElement.style.removeProperty("overflow");
}

export function RequirementsPanel(): React.ReactElement {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activePid, setActivePid] = useState<string>("");
  const [year, setYear] = useState<number>(dayjs().year());
  const [month, setMonth] = useState<number>(dayjs().month() + 1);
  const [rows, setRows] = useState<ReqRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<number[]>([]);
  /** 空字符串 = 全部 */
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [titleSearchInput, setTitleSearchInput] = useState("");
  /** 点击「查询」后生效的标题关键词 */
  const [titleSearchApplied, setTitleSearchApplied] = useState("");

  const [mdOpen, setMdOpen] = useState(false);
  const [mdRow, setMdRow] = useState<ReqRow | null>(null);
  const [mdText, setMdText] = useState("");
  const [bridgeOnline, setBridgeOnline] = useState<boolean | null>(null);

  const closeMdModal = useCallback(() => {
    setMdOpen(false);
    setMdRow(null);
    unlockPageScroll();
  }, []);

  const fetchBridgePresence = useCallback(async () => {
    try {
      const { data } = await api.get<{ online: boolean }>("/api/config/bridge-presence");
      setBridgeOnline(Boolean(data.online));
    } catch {
      setBridgeOnline(null);
    }
  }, []);

  useEffect(() => {
    fetchBridgePresence();
    const t = window.setInterval(() => {
      void fetchBridgePresence();
    }, 10_000);
    return () => window.clearInterval(t);
  }, [fetchBridgePresence]);

  useEffect(() => {
    return () => unlockPageScroll();
  }, []);

  async function loadProjects(): Promise<void> {
    const { data } = await api.get("/api/projects");
    setProjects(data.projects);
    if (data.projects?.length && !activePid) setActivePid(data.projects[0].projectId);
  }

  async function loadList(): Promise<void> {
    if (!activePid) return;
    setLoading(true);
    try {
      const { data } = await api.get("/api/requirements", {
        params: { project_id: activePid, year, month },
      });
      setRows(data.requirements);
    } finally {
      setLoading(false);
    }
  }

  async function requestBridgePull(): Promise<void> {
    if (!activePid) return;
    try {
      const { data } = await api.post("/api/requirements/pull-from-bridge", {
        project_id: activePid,
        year,
        month,
      });
      if (data.deduped) {
        message.info("已有相同拉取任务在排队，桥 C 将自动处理");
      } else {
        message.success("已下发 TAPD 拉取任务：请保持桥 C 运行（自动轮询约每 10 秒）");
      }
    } catch {
      message.error("下发失败（检查是否已订阅该项目、网络与登录）");
    }
  }

  async function refreshList(): Promise<void> {
    await requestBridgePull();
    await loadList();
  }

  useEffect(() => {
    loadProjects().catch(() => message.error("加载项目失败"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadList().catch(() => message.error("加载需求失败"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePid, year, month]);

  useEffect(() => {
    setTitleSearchInput("");
    setTitleSearchApplied("");
  }, [activePid, year, month]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { "": rows.length };
    for (const s of REQ_STATUS_ORDER) {
      counts[s] = 0;
    }
    for (const r of rows) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  const applyTitleSearch = useCallback(() => {
    setTitleSearchApplied(titleSearchInput.trim());
  }, [titleSearchInput]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (statusFilter) list = list.filter((r) => r.status === statusFilter);
    const q = titleSearchApplied.trim().toLowerCase();
    if (q) list = list.filter((r) => r.title.toLowerCase().includes(q));
    return list;
  }, [rows, statusFilter, titleSearchApplied]);

  useEffect(() => {
    setSel((prev) => prev.filter((id) => filteredRows.some((r) => r.id === id)));
  }, [filteredRows]);

  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: String(i + 1) + "月" })),
    []
  );

  const statusFilterItems = useMemo(() => {
    const items: { key: string; label: string }[] = [{ key: "", label: "全部" }];
    for (const s of REQ_STATUS_ORDER) {
      items.push({ key: s, label: requirementStatusLabel(s) });
    }
    return items;
  }, []);

  return (
    <div className="yy-requirements-panel">
      {projects.length === 0 ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="还没有监控项目"
          description="请先到「监控项目注册」添加 TAPD 项目，否则这里不会出现项目 Tab。"
        />
      ) : null}

      {projects.length > 0 && rows.length === 0 && !loading ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="当前年月下列表为空"
          description={
            <>
              请先点「刷新列表」下发拉取任务并保持<strong>桥 C</strong>在线。数秒后仍为空时：① 核对左侧<strong>年月</strong>与 TAPD
              单据的「上线时间」是否同月；② 打开桥 C 窗口看是否出现 <code>tapd_mcp_list_empty</code>（MCP 返回 0 条）或报错；③
              工作台「服务端日志」可看云端是否收到 <code>tapd_sync_batch_received</code>。列表按需求的上线时间落在所选年/月内过滤。
            </>
          }
        />
      ) : null}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0, flex: 1, minWidth: 280 }}>
          流程：<strong>监控项目注册</strong> → 选对<strong>年月</strong> → 点「<strong>刷新列表</strong>」排队拉 TAPD → 保持本机<strong>桥 C</strong>运行（自动轮询）→ 对行点「<strong>生成</strong>」拉大神文档并由云端 LLM 整理。
        </Typography.Paragraph>
        <Space align="center">
          <Typography.Text type="secondary">桥 C</Typography.Text>
          {bridgeOnline === null ? (
            <Tag>未知</Tag>
          ) : bridgeOnline ? (
            <Tag color="success">在线</Tag>
          ) : (
            <Tag color="default">离线</Tag>
          )}
        </Space>
      </div>

      <Tabs
        activeKey={activePid}
        onChange={(k) => setActivePid(k)}
        items={projects.map((p) => ({ key: p.projectId, label: p.projectName }))}
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          style={{ width: 120 }}
          value={year}
          options={Array.from({ length: 5 }, (_, i) => dayjs().year() - 2 + i).map((y) => ({
            value: y,
            label: y + "年",
          }))}
          onChange={(v) => setYear(v)}
        />
        <Select style={{ width: 120 }} value={month} options={monthOptions} onChange={setMonth} />
        <Button type="primary" onClick={() => refreshList()} loading={loading}>
          刷新列表
        </Button>
      </Space>

      {rows.length > 0 ? (
        <div
          className="yy-status-filter-bar"
          style={{
            marginBottom: 14,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <Space size={[8, 8]} wrap>
            {statusFilterItems.map((item) => {
              const count = statusCounts[item.key] ?? 0;
              const active = statusFilter === item.key;
              const disabled = item.key !== "" && count === 0;
              return (
                <Button
                  key={item.key || "__all__"}
                  type={active ? "primary" : "default"}
                  size="small"
                  disabled={disabled}
                  onClick={() => setStatusFilter(item.key)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    opacity: disabled ? 0.45 : 1,
                  }}
                >
                  <span>{item.label}</span>
                  <Badge
                    count={count}
                    showZero
                    overflowCount={9999}
                    style={{
                      backgroundColor: active ? "rgba(0,0,0,0.25)" : "rgba(184, 134, 11, 0.85)",
                    }}
                  />
                </Button>
              );
            })}
          </Space>
          <Space.Compact className="yy-title-search">
            <Input
              allowClear
              placeholder="搜索标题"
              value={titleSearchInput}
              onChange={(e) => {
                const v = e.target.value;
                setTitleSearchInput(v);
                if (!v.trim()) setTitleSearchApplied("");
              }}
              onPressEnter={() => applyTitleSearch()}
              style={{ width: 220 }}
            />
            <Button type="primary" onClick={() => applyTitleSearch()}>
              查询
            </Button>
          </Space.Compact>
        </div>
      ) : null}

      <Table
        rowKey="id"
        loading={loading}
        dataSource={filteredRows}
        rowSelection={{
          selectedRowKeys: sel,
          onChange: (k) => setSel(k as number[]),
        }}
        columns={[
          { title: "TAPD ID", dataIndex: "tapdId", width: 120 },
          { title: "标题", dataIndex: "title" },
          {
            title: "上线时间",
            dataIndex: "onlineTime",
            width: 180,
            render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm"),
          },
          {
            title: "大小",
            dataIndex: "mdFileSize",
            width: 100,
            render: (v: number | null) => (v == null ? "-" : (v / 1024).toFixed(1) + "KB"),
          },
          {
            title: "状态",
            dataIndex: "status",
            width: 120,
            render: (s: string) => (
              <Tag color={requirementStatusTagColor(s)}>{requirementStatusLabel(s)}</Tag>
            ),
          },
          {
            title: "操作",
            width: 260,
            render: (_: unknown, r: ReqRow) => (
              <Space wrap>
                <Button
                  size="small"
                  disabled={!["pending_generate", "generation_failed"].includes(r.status)}
                  onClick={async () => {
                    await api.post("/api/requirements/" + r.id + "/generate");
                    message.success("已创建生成任务：桥 C 将自动拉大神文档");
                    loadList();
                  }}
                >
                  生成
                </Button>
                <Button
                  size="small"
                  disabled={!["pending_review"].includes(r.status)}
                  onClick={() => {
                    setMdRow(r);
                    setMdText("");
                    api.get("/api/requirements/" + r.id).then(({ data }) => {
                      setMdText(String(data.requirement.mdContent ?? ""));
                      setMdOpen(true);
                    });
                  }}
                >
                  查看/编辑
                </Button>
                <Button
                  size="small"
                  danger
                  onClick={async () => {
                    await api.post("/api/requirements/" + r.id + "/ignore");
                    message.success("已忽略");
                    loadList();
                  }}
                >
                  忽略
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Space style={{ marginTop: 12 }}>
        <Button
          type="primary"
          disabled={!sel.length}
          onClick={async () => {
            for (const id of sel) {
              const r = rows.find((x) => x.id === id);
              if (!r || r.status !== "pending_upload") continue;
              const { data } = await api.get("/api/requirements/" + id);
              const content = String(data.requirement.mdContent ?? "");
              const blob = new Blob([content], { type: "text/markdown" });
              const fd = new FormData();
              fd.append("file", blob, r.tapdId + "_" + r.title + ".md");
              try {
                await api.post("/api/requirements/" + id + "/upload", fd);
              } catch (e: unknown) {
                const ax = e as { response?: { data?: { error?: string } }; message?: string };
                const detail = ax.response?.data?.error ?? ax.message ?? String(e);
                message.error("上传失败：" + detail);
              }
            }
            message.success("批量上传已触发（失败请看状态）");
            setSel([]);
            loadList();
          }}
        >
          批量上传到 Dify（仅待上传）
        </Button>
      </Space>

      <Modal
        title="Markdown"
        open={mdOpen}
        onCancel={closeMdModal}
        afterOpenChange={(open) => {
          if (!open) unlockPageScroll();
        }}
        destroyOnClose
        width="90%"
        styles={{ body: { maxHeight: "min(70vh, 640px)", overflow: "auto" } }}
        footer={
          <Space>
            <Button
              onClick={async () => {
                if (!mdRow) return;
                await api.put("/api/requirements/" + mdRow.id + "/md", {
                  md_content: mdText,
                  md_file_size: new Blob([mdText]).size,
                });
                message.success("已保存到云端");
                loadList();
              }}
            >
              保存
            </Button>
            <Button
              type="primary"
              onClick={async () => {
                if (!mdRow) return;
                await api.put("/api/requirements/" + mdRow.id + "/md", {
                  md_content: mdText,
                  md_file_size: new Blob([mdText]).size,
                });
                await api.patch("/api/requirements/" + mdRow.id + "/status", {
                  status: "pending_upload",
                });
                message.success("已通过并发待上传");
                closeMdModal();
                loadList();
              }}
            >
              审核通过（待上传）
            </Button>
          </Space>
        }
      >
        <div data-color-mode="dark">
          <MDEditor value={mdText} onChange={(v) => setMdText(v ?? "")} height={420} preview="edit" />
        </div>
      </Modal>
    </div>
  );
}
