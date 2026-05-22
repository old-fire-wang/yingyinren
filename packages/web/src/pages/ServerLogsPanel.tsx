import { Button, Modal, Select, Space, Table, Tag, Typography, message } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api";

type LogRow = {
  id: number;
  phase: string;
  step: string;
  level: string;
  message: string;
  bridgeTaskId: number | null;
  requirementId: number | null;
  projectId: string | null;
  createdAt: string;
  payload: unknown;
};

const PHASE_OPTS = [
  { value: "", label: "全部分区" },
  { value: "tapd_list", label: "TAPD 列表" },
  { value: "bridge", label: "桥调度" },
  { value: "doc_pipeline", label: "文档 / LLM" },
  { value: "dify_upload", label: "Dify 上传" },
];

export function ServerLogsPanel(): React.ReactElement {
  const [phase, setPhase] = useState("");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const nextBeforeRef = useRef<number | null>(null);
  const [detail, setDetail] = useState<LogRow | null>(null);

  useEffect(() => {
    nextBeforeRef.current = nextBefore;
  }, [nextBefore]);

  const loadPage = useCallback(
    async (opts: { reset: boolean }) => {
      const reset = opts.reset;
      setLoading(true);
      try {
        const params: Record<string, string | number> = { limit: 80 };
        if (phase) params.phase = phase;
        if (!reset && nextBeforeRef.current != null) params.before_id = nextBeforeRef.current;
        const { data } = await api.get<{ logs: LogRow[]; next_before_id: number | null }>(
          "/api/server-logs",
          { params }
        );
        setRows((prev) => (reset ? data.logs : [...prev, ...data.logs]));
        setNextBefore(data.next_before_id);
      } catch {
        message.error("加载服务端日志失败");
      } finally {
        setLoading(false);
      }
    },
    [phase]
  );

  useEffect(() => {
    setNextBefore(null);
    nextBeforeRef.current = null;
    setRows([]);
    void loadPage({ reset: true }).catch(() => undefined);
  }, [phase, loadPage]);

  const refresh = (): void => {
    setNextBefore(null);
    nextBeforeRef.current = null;
    setRows([]);
    void loadPage({ reset: true }).catch(() => undefined);
  };

  const levelColor = (lv: string): string => {
    if (lv === "error") return "red";
    if (lv === "warn") return "orange";
    return "default";
  };

  return (
    <div>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        以下为<strong>服务端</strong>流水（数据库持久化）。覆盖：工作台下发 TAPD 拉取 / 生成文档任务、桥拉任务、TAPD
        批次入库、大神正文接收与<strong>截断预览</strong>、LLM 整理耗时与输出预览、Dify 上传进度与错误。原始报文过大时仅保留预览与长度字段。
      </Typography.Paragraph>
      <Typography.Title level={5}>事件步骤一览</Typography.Title>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        <strong>tapd_pull_task_enqueued</strong>：刷新列表创建（或合并）拉取任务；
        <strong>bridge_tasks_dispatched</strong>：桥轮询取到待办；
        <strong>tapd_sync_batch_received</strong>：桥 POST 同步批次及样例行；
        <strong>tapd_pull_task_finished</strong>：拉取任务结果；<strong>doc_generate_task_enqueued</strong>：点「生成」；
        <strong>mcp_raw_document_received</strong>：大神正文到达（含 raw_preview）；<strong>mcp_doc_ingest_failed</strong>
        ：正文空/失败；<strong>mcp_raw_rejected_error_page</strong>：正文像 401/403/404 错误页已跳过 LLM；
        <strong>llm_md_generation_*</strong>：LLM 起止与 md_preview；<strong>dify_upload_*</strong>：上传
        Dify；<strong>bridge_task_result_idempotent</strong>：重复回包忽略。
      </Typography.Paragraph>

      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          style={{ width: 160 }}
          value={phase}
          options={PHASE_OPTS}
          onChange={(v) => setPhase(v)}
        />
        <Button onClick={() => refresh()} loading={loading}>
          刷新
        </Button>
      </Space>

      <Table<LogRow>
        rowKey="id"
        loading={loading && rows.length === 0}
        dataSource={rows}
        pagination={false}
        size="small"
        scroll={{ x: 960 }}
        columns={[
          {
            title: "时间",
            dataIndex: "createdAt",
            width: 168,
            render: (v: string) => dayjs(v).format("MM-DD HH:mm:ss"),
          },
          { title: "分区", dataIndex: "phase", width: 100 },
          { title: "步骤", dataIndex: "step", width: 220, ellipsis: true },
          {
            title: "级别",
            dataIndex: "level",
            width: 72,
            render: (lv: string) => <Tag color={levelColor(lv)}>{lv}</Tag>,
          },
          { title: "摘要", dataIndex: "message", ellipsis: true },
          {
            title: "关联",
            width: 140,
            render: (_: unknown, r: LogRow) => (
              <span style={{ fontSize: 12 }}>
                {r.bridgeTaskId != null ? "T" + r.bridgeTaskId : ""}
                {r.requirementId != null ? " R" + r.requirementId : ""}
              </span>
            ),
          },
          {
            title: "",
            width: 88,
            fixed: "right",
            render: (_: unknown, r: LogRow) => (
              <Button type="link" size="small" onClick={() => setDetail(r)}>
                详情
              </Button>
            ),
          },
        ]}
      />
      {nextBefore != null ? (
        <Button style={{ marginTop: 12 }} loading={loading} onClick={() => void loadPage({ reset: false })}>
          更早记录
        </Button>
      ) : null}

      <Modal
        title={"日志 #" + (detail?.id ?? "")}
        open={detail != null}
        onCancel={() => setDetail(null)}
        footer={null}
        width={720}
      >
        {detail ? (
          <pre
            style={{
              maxHeight: 480,
              overflow: "auto",
              fontSize: 12,
              background: "#111",
              color: "#ddd",
              padding: 12,
            }}
          >
            {JSON.stringify(
              {
                ...detail,
                createdAt: detail.createdAt,
              },
              null,
              2
            )}
          </pre>
        ) : null}
      </Modal>
    </div>
  );
}
