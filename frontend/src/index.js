import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// react-query is wired up inside AppDataProvider (src/context/AppDataContext.jsx),
// which owns the QueryClient for the whole app.
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// PWA: register the service worker (production only — avoids caching churn
// during dev/HMR). Makes RoutePulse installable with an offline app shell.
if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${process.env.PUBLIC_URL}/service-worker.js`)
      .catch(() => {
        /* SW registration is a progressive enhancement — never block the app. */
      });
  });
}
