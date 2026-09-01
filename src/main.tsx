import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@algorisys/zen-ui-react/preflight";
import "@algorisys/zen-ui-react/styles";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
