import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../components/AppLayout.jsx';
import Login from '../pages/Login.jsx';
import Register from '../pages/Register.jsx';
import VerifyEmail from '../pages/VerifyEmail.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import Projects from '../pages/Projects.jsx';
import Quotes from '../pages/Quotes.jsx';
import Invoices from '../pages/Invoices.jsx';
import ProjectRequest from '../pages/ProjectRequest.jsx';
import Chat from '../pages/Chat.jsx';
import NotFound from '../pages/NotFound.jsx';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify" element={<VerifyEmail />} />

      <Route element={<ProtectedRoute />}>
        <Route index element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<Projects />} />
        <Route path="/quotes" element={<Quotes />} />
        <Route path="/quotes/:id" element={<Quotes />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/request" element={<ProjectRequest />} />
        <Route path="/chat" element={<Chat />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
