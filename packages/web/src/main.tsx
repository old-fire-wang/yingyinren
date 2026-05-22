import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./routes";
import "./sancao-theme.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#8B1E1E",
          colorInfo: "#B8860B",
          colorLink: "#DAA520",
          colorBgLayout: "#0D0D0D",
          colorBgContainer: "#2D2820",
          colorBgElevated: "#3A342C",
          colorBorder: "#4A433A",
          colorBorderSecondary: "#3A342C",
          colorText: "#EDE6DC",
          colorTextSecondary: "#B8AEA0",
          colorTextTertiary: "#8A8074",
          borderRadius: 4,
          fontFamily:
            '"Noto Sans SC","Source Han Sans CN","Microsoft YaHei","PingFang SC",sans-serif',
        },
        components: {
          Layout: {
            headerBg: "#1A1512",
            bodyBg: "#0D0D0D",
            siderBg: "#1A1512",
            triggerBg: "#252019",
          },
          Menu: {
            darkItemBg: "transparent",
            darkItemSelectedBg: "rgba(139,30,30,0.55)",
            darkItemHoverBg: "#3A342C",
            itemSelectedColor: "#F5ECD8",
            darkSubMenuItemBg: "#1A1512",
          },
          Tabs: {
            itemColor: "#B8AEA0",
            itemActiveColor: "#DAA520",
            itemSelectedColor: "#DAA520",
            inkBarColor: "#DAA520",
            horizontalMargin: "0 0 0 0",
          },
          Card: {
            colorBgContainer: "#2D2820",
          },
          Table: {
            colorBgContainer: "#2D2820",
            headerBg: "#252019",
            headerColor: "#DAA520",
            rowHoverBg: "#3A342C",
          },
          Input: {
            colorBgContainer: "#1A1512",
            activeBorderColor: "#B8860B",
            hoverBorderColor: "#DAA520",
          },
          Button: {
            primaryShadow: "0 2px 0 rgba(0,0,0,0.35)",
          },
        },
      }}
    >
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
);
