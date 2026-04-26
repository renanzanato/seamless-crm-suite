import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import Login from "./pages/Login.tsx";
import Index from "./pages/Index.tsx";
import PlaceholderPage from "./pages/PlaceholderPage.tsx";
import NotFound from "./pages/NotFound.tsx";
import SequenciasPage from "./pages/SequenciasPage.tsx";
import Contacts from "./pages/crm/Contacts.tsx";
import Companies from "./pages/crm/Companies.tsx";
import PipelinePage from "./pages/crm/PipelinePage.tsx";
import Integrations from "./pages/dados/Integrations.tsx";
import HojePage from "./pages/HojePage.tsx";
import CompanyDetail from "./pages/crm/CompanyDetail.tsx";
import ContactDetail from "./pages/crm/ContactDetail.tsx";
import DealDetail from "./pages/crm/DealDetail.tsx";
import MensagensPage from "./pages/MensagensPage.tsx";
import Reports from "./pages/Reports.tsx";
import Settings from "./pages/Settings.tsx";
import SequenceBuilderV2 from "./pages/SequenceBuilderV2.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Index />} />
              <Route path="/hoje" element={<HojePage />} />
              <Route path="/mensagens" element={<MensagensPage />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/help" element={<PlaceholderPage />} />
              <Route path="/reports" element={<Reports />} />

              {/* CRM */}
              <Route path="/crm/contatos" element={<Contacts />} />
              <Route path="/crm/contatos/:id" element={<ContactDetail />} />
              <Route path="/crm/empresas" element={<Companies />} />
              <Route path="/crm/empresas/:id" element={<CompanyDetail />} />
              <Route path="/crm/negocios" element={<PipelinePage />} />
              <Route path="/crm/negocios/:id" element={<DealDetail />} />

              {/* Admin-only */}
              <Route element={<AdminRoute />}>
                <Route path="/integracoes" element={<Integrations />} />
                <Route path="/sequencias" element={<SequenciasPage />} />
                <Route path="/sequencias-v2/nova" element={<SequenceBuilderV2 />} />
                <Route path="/sequencias-v2/:id" element={<SequenceBuilderV2 />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
