import { Navigate, Route, Routes } from "react-router-dom";
import { FiltersPage } from "./pages/FiltersPage";
import { GroupsPage } from "./pages/GroupsPage";
import { MessagesPage } from "./pages/MessagesPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
 
 function App() {
   return (
     <Routes>
       <Route path="/" element={<Navigate to="/messages" replace />} />
       <Route path="/messages" element={<MessagesPage />} />
      <Route path="/messages/:filterId" element={<MessagesPage />} />
      <Route path="/filters" element={<FiltersPage />} />
      <Route path="/filters/:filterId" element={<FiltersPage />} />
       <Route path="/groups" element={<GroupsPage />} />
       <Route path="/notifications" element={<NotificationsPage />} />
       <Route path="*" element={<NotFoundPage />} />
     </Routes>
   );
 }
 
 export default App;
