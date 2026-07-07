import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MobileShellApp } from "./shell/MobileShellApp";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MobileShellApp />
  </StrictMode>,
);
