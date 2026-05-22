import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? "",
});

api.interceptors.request.use((config) => {
  const t = localStorage.getItem("yy_token");
  if (t) config.headers.Authorization = "Bearer " + t;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !window.location.pathname.startsWith("/login")) {
      localStorage.removeItem("yy_token");
      window.location.assign("/login");
    }
    return Promise.reject(err);
  }
);

export default api;
