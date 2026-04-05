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
import MarketingPage from "./pages/MarketingPage.tsx";
import VendasPage from "./pages/VendasPage.tsx";
import IAPage from "./pages/IAPage.tsx";
import PlaceholderPage from "./pages/PlaceholderPage.tsx";
import NotFound from "./pages/NotFound.tsx";
import SequenciasPage from "./pages/SequenciasPage.tsx";
import SequenciaBuilderPage from "./pages/SequenciaBuilderPage.tsx";
import Kanban from "./pages/funil/Kanban.tsx";
import FunnelConfig from "./pages/funil/FunnelConfig.tsx";
import Contacts from "./pages/crm/Contacts.tsx";
import Companies from "./pages/crm/Companies.tsx";
import Deals from "./pages/crm/Deals.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Pública */}
            <Route path="/login" element={<Login />} />

            {/* Protegidas */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Index />} />
              <Route path="/marketing" element={<MarketingPage />} />
              <Route path="/vendas" element={<VendasPage />} />
              <Route path="/ia" element={<IAPage />} />
              <Route path="/settings" element={<PlaceholderPage />} />
              <Route path="/help" element={<PlaceholderPage />} />

              {/* CRM */}
              <Route path="/crm/contatos" element={<Contacts />} />
              <Route path="/crm/empresas" element={<Companies />} />
              <Route path="/crm/negocios" element={<Deals />} />

              {/* Funil — Kanban acessível a todos */}
              <Route path="/funil" element={<Kanban />} />

              {/* Admin-only */}
              <Route element={<AdminRoute />}>
                <Route path="/funis" element={<FunnelConfig />} />
                <Route path="/sequencias" element={<SequenciasPage />} />
                <Route path="/sequencias/nova" element={<SequenciaBuilderPage />} />
                <Route path="/sequencias/:id" element={<SequenciaBuilderPage />} />
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
