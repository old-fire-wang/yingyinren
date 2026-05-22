import { useState } from "react";
import { Button, Card, Form, Input, Space, Typography, message } from "antd";
import { useNavigate } from "react-router-dom";
import api from "../api";

export function LoginPage(): React.ReactElement {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  async function submit(mode: "login" | "bootstrap"): Promise<void> {
    const password = form.getFieldValue("password") as string;
    if (!password) {
      message.warning("请输入密码");
      return;
    }
    setLoading(true);
    try {
      if (mode === "bootstrap") {
        const { data } = await api.post("/api/auth/bootstrap", { password });
        localStorage.setItem("yy_token", data.token);
        message.success("初始化成功");
      } else {
        const { data } = await api.post("/api/auth/login", { password });
        localStorage.setItem("yy_token", data.token);
        message.success("登录成功");
      }
      nav("/");
    } catch {
      message.error("失败：检查网络或密码");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "80px auto" }}>
      <Card title="影印人工作台">
        <Typography.Paragraph type="secondary">
          首次部署请先「初始化密码」，之后使用「登录」。
        </Typography.Paragraph>
        <Form form={form} layout="vertical">
          <Form.Item name="password" label="密码" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Space>
            <Button type="primary" loading={loading} onClick={() => submit("login")}>
              登录
            </Button>
            <Button loading={loading} onClick={() => submit("bootstrap")}>
              初始化密码（仅首次）
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
