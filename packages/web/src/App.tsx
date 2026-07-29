import { Navigate, Route, Routes } from "react-router-dom";
import { PwaUpdatePrompt } from "./components/PwaUpdatePrompt";
import { FiltersPage } from "./pages/FiltersPage";
import { MessagesPage } from "./pages/MessagesPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ClientShellBridgeProvider } from "./shared/runtime/ClientShellBridgeProvider";
import { useClientDeviceRegistration } from "./shared/runtime/useClientDeviceRegistration";

function App() {
  useClientDeviceRegistration();

  return (
    <ClientShellBridgeProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/messages" replace />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/messages/:filterId" element={<MessagesPage />} />
        <Route path="/filters" element={<FiltersPage />} />
        <Route path="/filters/:filterId" element={<FiltersPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/notifications/:targetId" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/:sectionId" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <PwaUpdatePrompt />
    </ClientShellBridgeProvider>
  );
}

export default App;
