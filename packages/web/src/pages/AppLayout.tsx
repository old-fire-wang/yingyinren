import { Layout, Menu, Tabs, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { RequirementsPanel } from "./RequirementsPanel";
import { ProjectsPanel } from "./ProjectsPanel";
import { ConfigPanel } from "./ConfigPanel";
import { ServerLogsPanel } from "./ServerLogsPanel";
import baiyiDetailBg from "../assets/baiyi-detail-bg.png";

const { Header, Sider, Content } = Layout;

const baiyiDetailSurfaceStyle: CSSProperties = {
  minHeight: "100%",
  boxSizing: "border-box",
  padding: "20px 24px",
  borderLeft: "1px solid rgba(74, 67, 58, 0.5)",
  backgroundColor: "var(--bg-dark)",
  backgroundImage: `linear-gradient(
      165deg,
      rgba(10, 9, 8, 0.62) 0%,
      rgba(18, 15, 12, 0.55) 42%,
      rgba(8, 7, 6, 0.68) 100%
    ),
    url(${baiyiDetailBg})`,
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
};

const PROTOTYPE_GENIUS_URL = "http://43.156.247.3:3000/#/";

type MainTab = "baiyi" | "prototype" | "coming";
type SideMenu = "req" | "proj" | "cfg" | "logs";

export function AppLayout(): React.ReactElement {
  const nav = useNavigate();
  const [mainTab, setMainTab] = useState<MainTab>("baiyi");
  const [menu, setMenu] = useState<SideMenu>("req");

  useEffect(() => {
    if (!localStorage.getItem("yy_token")) nav("/login");
  }, [nav]);

  const title = useMemo(() => {
    if (menu === "req") return "已上线需求上传";
    if (menu === "proj") return "监控项目注册";
    if (menu === "cfg") return "系统配置";
    return "服务端日志";
  }, [menu]);

  const baiyiPanel = (
    <Layout className="yy-baiyi-layout">
      <Sider className="yy-sider" width={220} theme="dark">
        <Menu
          mode="inline"
          theme="dark"
          selectedKeys={[menu]}
          onClick={(e) => setMenu(e.key as SideMenu)}
          items={[
            { key: "req", label: "已上线需求上传" },
            { key: "proj", label: "监控项目注册" },
            { key: "cfg", label: "系统配置" },
            { key: "logs", label: "服务端日志" },
          ]}
        />
      </Sider>
      <Content className="yy-content">
        <div className="yy-content-bg-surface" style={baiyiDetailSurfaceStyle}>
          <Typography.Title level={4}>{title}</Typography.Title>
          {menu === "req" ? <RequirementsPanel /> : null}
          {menu === "proj" ? <ProjectsPanel /> : null}
          {menu === "cfg" ? <ConfigPanel /> : null}
          {menu === "logs" ? <ServerLogsPanel /> : null}
        </div>
      </Content>
    </Layout>
  );

  return (
    <Layout className="yy-app">
      <Header className="yy-header">
        <Typography.Text className="yy-header-title">影印人工作台</Typography.Text>
      </Header>
      <Tabs
        className="yy-main-tabs"
        activeKey={mainTab}
        onChange={(k) => setMainTab(k as MainTab)}
        destroyInactiveTabPane={false}
        items={[
          {
            key: "baiyi",
            label: "白衣渡江",
            children: baiyiPanel,
          },
          {
            key: "prototype",
            label: "原型大天才",
            children: (
              <iframe
                className="yy-prototype-iframe"
                src={PROTOTYPE_GENIUS_URL}
                title="原型大天才"
              />
            ),
          },
          {
            key: "coming",
            label: "敬请期待",
            children: <div className="yy-coming-placeholder">敬请期待</div>,
          },
        ]}
      />
    </Layout>
  );
}
