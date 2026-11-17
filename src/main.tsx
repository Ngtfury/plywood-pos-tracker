import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

document.documentElement.classList.add("dark");

// Emergency window-level error handler to prevent permanent blank screens
function renderEmergencyError(message: string) {
  const root = document.getElementById("root");
  if (root && (!root.innerHTML || root.innerHTML.trim() === "")) {
    root.innerHTML = `
      <div style="min-height:100vh;background:#09090b;color:#f43f5e;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;padding:24px;text-align:center;">
        <div style="max-width:480px;background:#18181b;border:1px solid #27272a;border-radius:16px;padding:32px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">
          <div style="width:48px;height:48px;margin:0 auto 16px;border-radius:12px;background:rgba(244,63,94,0.1);display:flex;align-items:center;justify-content:center;color:#f43f5e;font-size:24px;">⚠️</div>
          <h1 style="color:#ffffff;font-size:18px;font-weight:700;margin:0 0 8px;">Application Startup Issue</h1>
          <p style="color:#a1a1aa;font-size:13px;line-height:1.5;margin:0 0 24px;">${message}</p>
          <div style="display:flex;gap:12px;justify-content:center;">
            <button onclick="window.location.reload()" style="background:#10b981;color:#ffffff;border:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">Reload App</button>
            <button onclick="localStorage.clear();window.location.reload()" style="background:#27272a;color:#d4d4d8;border:1px solid #3f3f46;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;">Reset App Data</button>
          </div>
        </div>
      </div>
    `;
  }
}

window.addEventListener("error", (event) => {
  console.error("[Window Error]", event.error || event.message);
  renderEmergencyError(event.error?.message || event.message || "An unexpected error occurred during startup.");
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[Unhandled Promise Rejection]", event.reason);
  // Only surface if root failed to mount
  const msg = typeof event.reason === "string" ? event.reason : event.reason?.message;
  if (msg) {
    renderEmergencyError(msg);
  }
});

const rootElement = document.getElementById("root");
if (rootElement) {
  try {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>,
    );
  } catch (err: any) {
    console.error("Fatal React mounting error:", err);
    renderEmergencyError(err?.message || "Failed to mount user interface.");
  }
}
