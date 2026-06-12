import {
  Button,
  Drawer,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Tree,
  Typography,
  Upload,
  message,
} from "antd";
import type { DataNode } from "antd/es/tree";
import type { UploadProps } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import MDEditor from "@uiw/react-md-editor";
import api from "../api";

type AssetRow = {
  id: number;
  displayName: string;
  summary: string;
  fileType: string;
  originalFilename: string;
  fileSize: number;
  downloadCount: number;
  uploader: string;
  createdAt: string;
};

type FileNode = {
  path: string;
  name: string;
  isMd: boolean;
  children?: FileNode[];
};

type AssetDetail = AssetRow & {
  tree: FileNode[];
  defaultPath: string;
};

const MAX_BYTES = 5 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function nodesToTreeData(nodes: FileNode[]): DataNode[] {
  return nodes.map((n) => {
    if (n.children?.length) {
      return {
        key: n.path,
        title: n.name,
        selectable: false,
        children: nodesToTreeData(n.children),
      };
    }
    return {
      key: n.path,
      title: n.name,
      selectable: n.isMd,
      disabled: !n.isMd,
    };
  });
}

export function SuperGhostMarketPanel(): React.ReactElement {
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchApplied, setSearchApplied] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [previewPath, setPreviewPath] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AssetRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [editingSummaryId, setEditingSummaryId] = useState<number | null>(null);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [summarySaving, setSummarySaving] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ items: AssetRow[] }>("/api/skill-market", {
        params: searchApplied ? { q: searchApplied } : undefined,
      });
      setRows(data.items);
    } finally {
      setLoading(false);
    }
  }, [searchApplied]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadPreview = useCallback(async (id: number, path: string) => {
    setPreviewLoading(true);
    try {
      const { data } = await api.get<{ path: string; content: string }>(
        `/api/skill-market/${id}/content`,
        { params: { path } }
      );
      setPreviewPath(data.path);
      setPreviewText(data.content);
    } catch {
      message.error("预览加载失败");
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const openDetail = useCallback(
    async (row: AssetRow) => {
      try {
        const { data } = await api.get<AssetDetail>(`/api/skill-market/${row.id}`);
        setDetail(data);
        setDrawerOpen(true);
        const path = data.defaultPath || data.originalFilename;
        setPreviewPath(path);
        setPreviewText("");
        if (path) await loadPreview(data.id, path);
      } catch {
        message.error("无法打开详情");
      }
    },
    [loadPreview]
  );

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setDetail(null);
    setPreviewPath("");
    setPreviewText("");
  }, []);

  async function downloadAsset(row: AssetRow): Promise<void> {
    try {
      const { data } = await api.get(`/api/skill-market/${row.id}/download`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = row.originalFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, downloadCount: (r.downloadCount ?? 0) + 1 } : r
        )
      );
    } catch {
      message.error("下载失败");
    }
  }

  async function saveSummary(id: number): Promise<void> {
    const text = summaryDraft.trim();
    setSummarySaving(true);
    try {
      const { data } = await api.patch<AssetRow>(`/api/skill-market/${id}/summary`, {
        summary: text,
      });
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, summary: data.summary ?? text } : r))
      );
      setEditingSummaryId(null);
      setSummaryDraft("");
    } catch {
      message.error("描述保存失败");
    } finally {
      setSummarySaving(false);
    }
  }

  function startEditSummary(row: AssetRow): void {
    setEditingSummaryId(row.id);
    setSummaryDraft(row.summary ?? "");
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/skill-market/${deleteTarget.id}`);
      message.success("已删除");
      setDeleteTarget(null);
      if (detail?.id === deleteTarget.id) closeDrawer();
      await loadList();
    } catch {
      message.error("删除失败");
    } finally {
      setDeleting(false);
    }
  }

  const uploadProps: UploadProps = {
    name: "file",
    multiple: false,
    showUploadList: false,
    accept: ".md,.zip,.skill",
    beforeUpload: (file) => {
      if (file.size > MAX_BYTES) {
        message.error("文件不能超过 5MB");
        return Upload.LIST_IGNORE;
      }
      const lower = file.name.toLowerCase();
      if (
        !lower.endsWith(".md") &&
        !lower.endsWith(".zip") &&
        !lower.endsWith(".skill")
      ) {
        message.error("仅支持 .md、.zip 或 .skill");
        return Upload.LIST_IGNORE;
      }
      return true;
    },
    customRequest: async (options) => {
      const file = options.file as File;
      const fd = new FormData();
      fd.append("file", file);
      try {
        await api.post("/api/skill-market/upload", fd);
        message.success("上传成功");
        options.onSuccess?.({});
        await loadList();
      } catch (err: unknown) {
        const body = (err as { response?: { data?: { error?: string; message?: string } } })
          .response?.data;
        const hint =
          body?.message ??
          (body?.error === "skill_md_missing"
            ? "技能包内须包含 SKILL.md"
            : body?.error === "file_too_large"
              ? "文件不能超过 5MB"
              : "上传失败");
        message.error(hint);
        options.onError?.(err as Error);
      }
    },
  };

  const treeData = useMemo(
    () => (detail?.fileType === "skill" ? nodesToTreeData(detail.tree) : []),
    [detail]
  );

  const columns = [
    {
      title: "名称",
      dataIndex: "displayName",
      key: "displayName",
      width: 180,
      render: (_: string, r: AssetRow) => r.displayName || r.originalFilename,
    },
    {
      title: "简要描述",
      dataIndex: "summary",
      key: "summary",
      render: (_: string, r: AssetRow) => {
        if (editingSummaryId === r.id) {
          return (
            <Input.TextArea
              className="yy-ghost-summary-input"
              autoSize={{ minRows: 1, maxRows: 4 }}
              autoFocus
              maxLength={500}
              disabled={summarySaving}
              value={summaryDraft}
              placeholder="填写用途、适用场景等…"
              onChange={(e) => setSummaryDraft(e.target.value)}
              onBlur={() => void saveSummary(r.id)}
              onPressEnter={(e) => {
                if (e.shiftKey) return;
                e.preventDefault();
                void saveSummary(r.id);
              }}
            />
          );
        }
        return (
          <button
            type="button"
            className="yy-ghost-summary-cell"
            onClick={() => startEditSummary(r)}
          >
            {r.summary ? (
              <span className="yy-ghost-summary-text">{r.summary}</span>
            ) : (
              <span className="yy-ghost-summary-placeholder">点击填写…</span>
            )}
          </button>
        );
      },
    },
    {
      title: "类型",
      dataIndex: "fileType",
      key: "fileType",
      width: 88,
      render: (t: string) => (
        <Tag color={t === "skill" ? "gold" : "default"}>{t}</Tag>
      ),
    },
    {
      title: "大小",
      dataIndex: "fileSize",
      key: "fileSize",
      width: 96,
      render: (n: number) => formatSize(n),
    },
    {
      title: "下载次数",
      dataIndex: "downloadCount",
      key: "downloadCount",
      width: 88,
      render: (n: number) => n ?? 0,
    },
    {
      title: "上传人",
      dataIndex: "uploader",
      key: "uploader",
      width: 120,
    },
    {
      title: "上传时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 168,
      render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm"),
    },
    {
      title: "操作",
      key: "actions",
      width: 220,
      render: (_: unknown, r: AssetRow) => (
        <Space size="small">
          <Button size="small" onClick={() => void openDetail(r)}>详情</Button>
          <Button size="small" onClick={() => void downloadAsset(r)}>下载</Button>
          <Button size="small" danger onClick={() => setDeleteTarget(r)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="yy-ghost-market">
      <Typography.Title level={4}>超级鬼市 · Skill / Markdown 资产</Typography.Title>

      <Upload.Dragger className="yy-ghost-upload" {...uploadProps}>
        <p className="ant-upload-text">拖拽文件到此处上传，或点击选择文件</p>
        <p className="ant-upload-hint">单文件 ≤ 5MB · 支持 .md、.zip、.skill（技能包须含 SKILL.md）</p>
      </Upload.Dragger>

      <div className="yy-ghost-toolbar">
        <Input.Search
          allowClear
          placeholder="搜索文件名…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onSearch={(v) => setSearchApplied(v.trim())}
          style={{ maxWidth: 280 }}
        />
        <Tag className="yy-ghost-count">{rows.length} 项资产</Tag>
      </div>

      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 20, showSizeChanger: false }}
      />

      <Drawer
        className="yy-ghost-drawer"
        title={detail?.displayName ?? "资产详情"}
        width={Math.min(720, window.innerWidth * 0.92)}
        open={drawerOpen}
        onClose={closeDrawer}
        destroyOnClose
      >
        {detail?.fileType === "skill" && treeData.length > 0 ? (
          <div className="yy-ghost-drawer-body">
            <div className="yy-ghost-tree">
              <Tree
                showLine
                defaultExpandAll
                selectedKeys={previewPath ? [previewPath] : []}
                treeData={treeData}
                onSelect={(keys) => {
                  const k = String(keys[0] ?? "");
                  if (!k || !detail) return;
                  void loadPreview(detail.id, k);
                }}
              />
            </div>
            <div className="yy-ghost-preview" data-color-mode="dark">
              {previewLoading ? (
                <Typography.Text type="secondary">加载中…</Typography.Text>
              ) : (
                <MDEditor.Markdown source={previewText} />
              )}
            </div>
          </div>
        ) : (
          <div className="yy-ghost-preview yy-ghost-preview-full" data-color-mode="dark">
            {previewLoading ? (
              <Typography.Text type="secondary">加载中…</Typography.Text>
            ) : (
              <MDEditor.Markdown source={previewText} />
            )}
          </div>
        )}
      </Drawer>

      <Modal
        title="确认物理删除？"
        open={deleteTarget != null}
        okText="确认删除"
        okType="danger"
        confirmLoading={deleting}
        onOk={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      >
        <Typography.Paragraph type="secondary">
          将永久删除「{deleteTarget?.displayName}」的文件与记录，不可恢复。
        </Typography.Paragraph>
      </Modal>
    </div>
  );
}
