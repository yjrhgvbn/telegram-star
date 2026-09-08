import { StrictMode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import "./index.css";
import { queryClient } from "./shared/query/queryClient";
import { WorkspaceHistoryGuardProvider } from "./components/WorkspaceHistoryGuard";

// A data router supplies the supported history blocker; existing page URLs and
// route elements remain in App so this does not change list/detail navigation.
const router = createBrowserRouter([
  { path: "*", element: <WorkspaceHistoryGuardProvider><App /></WorkspaceHistoryGuardProvider> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
