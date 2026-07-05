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
