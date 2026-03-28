import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import PlaceholderPage from "./pages/PlaceholderPage.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/payment" element={<PlaceholderPage />} />
          <Route path="/customers" element={<PlaceholderPage />} />
          <Route path="/message" element={<PlaceholderPage />} />
          <Route path="/product" element={<PlaceholderPage />} />
          <Route path="/invoice" element={<PlaceholderPage />} />
          <Route path="/analytics" element={<PlaceholderPage />} />
          <Route path="/automation" element={<PlaceholderPage />} />
          <Route path="/settings" element={<PlaceholderPage />} />
          <Route path="/security" element={<PlaceholderPage />} />
          <Route path="/help" element={<PlaceholderPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
