import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DesktopShellApp } from "./shell/DesktopShellApp";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DesktopShellApp />
  </StrictMode>,
);
