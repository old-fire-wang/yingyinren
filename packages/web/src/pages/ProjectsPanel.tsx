import { Button, Form, Input, Space, Table, Typography, message } from "antd";
import { useEffect, useState } from "react";
import api from "../api";

type Project = {
  id: number;
  projectId: string;
  projectName: string;
  difyBaseUrl: string;
  difyDatasetId: string;
};

export function ProjectsPanel(): React.ReactElement {
  const [rows, setRows] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const { data } = await api.get("/api/projects");
      setRows(data.projects);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => message.error("加载失败"));
  }, []);

  return (
    <div>
      <Typography.Paragraph type="secondary">
        每个 TAPD 项目绑定一套 Dify 知识库参数。
      </Typography.Paragraph>
      <Form
        layout="inline"
        onFinish={async (v) => {
          await api.post("/api/projects", {
            project_id: v.project_id,
            project_name: v.project_name,
            dify_base_url: v.dify_base_url,
            dify_api_key: v.dify_api_key,
            dify_dataset_id: v.dify_dataset_id,
          });
          message.success("已添加");
          load();
        }}
        style={{ marginBottom: 16 }}
      >
        <Form.Item name="project_id" rules={[{ required: true }]}>
          <Input placeholder="TAPD project_id" />
        </Form.Item>
        <Form.Item name="project_name" rules={[{ required: true }]}>
          <Input placeholder="项目名称" />
        </Form.Item>
        <Form.Item name="dify_base_url" rules={[{ required: true }]}>
          <Input style={{ width: 260 }} placeholder="Dify Base URL" />
        </Form.Item>
        <Form.Item name="dify_api_key" rules={[{ required: true }]}>
          <Input style={{ width: 220 }} placeholder="Dify API Key" />
        </Form.Item>
        <Form.Item name="dify_dataset_id" rules={[{ required: true }]}>
          <Input style={{ width: 260 }} placeholder="Dataset ID" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit">
            添加订阅
          </Button>
        </Form.Item>
      </Form>

      <Space style={{ marginBottom: 12 }}>
        <Button onClick={() => load()} loading={loading}>
          刷新
        </Button>
      </Space>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={[
          { title: "项目ID", dataIndex: "projectId", width: 140 },
          { title: "名称", dataIndex: "projectName" },
          { title: "Dify URL", dataIndex: "difyBaseUrl" },
          { title: "Dataset", dataIndex: "difyDatasetId", width: 220 },
          {
            title: "操作",
            width: 120,
            render: (_: unknown, r: Project) => (
              <Button
                danger
                size="small"
                onClick={async () => {
                  await api.delete("/api/projects/" + r.id);
                  message.success("已删除");
                  load();
                }}
              >
                删除
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}
