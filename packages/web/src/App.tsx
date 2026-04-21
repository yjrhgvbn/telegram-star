 import { Navigate, Route, Routes } from "react-router-dom";
 import { GroupsPage } from "./pages/GroupsPage";
 import { MessagesPage } from "./pages/MessagesPage";
 import { NotFoundPage } from "./pages/NotFoundPage";
 
 function App() {
   return (
     <Routes>
       <Route path="/" element={<Navigate to="/messages" replace />} />
       <Route path="/messages" element={<MessagesPage />} />
       <Route path="/groups" element={<GroupsPage />} />
       <Route path="*" element={<NotFoundPage />} />
     </Routes>
   );
 }
 
 export default App;
