import { Button, Form, Input, Space, Typography, message } from "antd";
import { useEffect, useState } from "react";
import api from "../api";

type ConfigGet = {
  llm_json: string;
  llm_md_generation_prompt: string;
  llm_md_modification_prompt: string;
  mcp_tapd_url: string;
  mcp_tapd_token: string;
  mcp_dashen_url: string;
  mcp_dashen_token: string;
  mcp_defaults?: { tapd_url: string; dashen_url: string };
};

export function ConfigPanel(): React.ReactElement {
  const [form] = Form.useForm();
  const [defaults, setDefaults] = useState<{ tapd_url: string; dashen_url: string } | null>(null);

  useEffect(() => {
    api
      .get<ConfigGet>("/api/config")
      .then(({ data }) => {
        setDefaults(data.mcp_defaults ?? null);
        form.setFieldsValue({
          llm_json: data.llm_json,
          llm_md_generation_prompt: data.llm_md_generation_prompt,
          llm_md_modification_prompt: data.llm_md_modification_prompt,
          mcp_tapd_url: data.mcp_tapd_url,
          mcp_tapd_token: data.mcp_tapd_token,
          mcp_dashen_url: data.mcp_dashen_url,
          mcp_dashen_token: data.mcp_dashen_token,
        });
      })
      .catch(() => message.error("读取配置失败"));
  }, [form]);

  const tapdPh = defaults?.tapd_url ?? "https://mcp.zhuanspirit.com/mcp-servers/tapd";
  const dashenPh = defaults?.dashen_url ?? "https://mcp.zhuanspirit.com/mcp/dashen2";

  return (
    <div>
      <Typography.Paragraph type="secondary">
        llm_json 示例：DeepSeek{" "}
        {`{"apiKey":"sk-...","model":"deepseek-chat","baseUrl":"https://api.deepseek.com"}`}
        ；智谱 GLM（base 含 open.bigmodel.cn/v4 时会自动走 /chat/completions）{" "}
        {`{"apiKey":"...","model":"glm-5v-turbo","baseUrl":"https://open.bigmodel.cn/api/paas/v4"}`}
      </Typography.Paragraph>
      <Typography.Paragraph type="secondary">
        MCP：填写 URL 与 <code>access_token</code> 即可；保存后会自动生成桥 C 使用的 streamableHttp JSON（留空 URL 则用默认入口）。
      </Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        onFinish={async (v) => {
          await api.put("/api/config", v);
          message.success("已保存");
        }}
      >
        <Form.Item name="llm_json" label="LLM JSON">
          <Input.TextArea rows={4} />
        </Form.Item>
        <Form.Item name="mcp_tapd_url" label="TAPD MCP URL">
          <Input placeholder={tapdPh} />
        </Form.Item>
        <Form.Item name="mcp_tapd_token" label="TAPD access_token">
          <Input.Password placeholder="必填（桥拉 TAPD 列表）" autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="mcp_dashen_url" label="大神 MCP URL">
          <Input placeholder={dashenPh} />
        </Form.Item>
        <Form.Item
          name="mcp_dashen_token"
          label="大神 token（保存为 Authorization Bearer）"
        >
          <Input.Password placeholder="必填（桥拉大神文档）" autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="llm_md_generation_prompt" label="生成 md Prompt（含 {content}）">
          <Input.TextArea rows={8} />
        </Form.Item>
        <Form.Item name="llm_md_modification_prompt" label="修改 md Prompt（含占位符）">
          <Input.TextArea rows={6} />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit">
            保存
          </Button>
        </Space>
      </Form>
    </div>
  );
}
