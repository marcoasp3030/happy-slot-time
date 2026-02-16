import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Services from "./pages/Services";
import Staff from "./pages/Staff";
import BusinessHours from "./pages/BusinessHours";
import Appointments from "./pages/Appointments";
import Appearance from "./pages/Appearance";
import WhatsAppSettings from "./pages/WhatsAppSettings";
import Plan from "./pages/Plan";
import PublicBooking from "./pages/PublicBooking";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Carregando...</div></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/agendar/:slug" element={<PublicBooking />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/servicos" element={<ProtectedRoute><Services /></ProtectedRoute>} />
            <Route path="/profissionais" element={<ProtectedRoute><Staff /></ProtectedRoute>} />
            <Route path="/horarios" element={<ProtectedRoute><BusinessHours /></ProtectedRoute>} />
            <Route path="/agendamentos" element={<ProtectedRoute><Appointments /></ProtectedRoute>} />
            <Route path="/aparencia" element={<ProtectedRoute><Appearance /></ProtectedRoute>} />
            <Route path="/whatsapp" element={<ProtectedRoute><WhatsAppSettings /></ProtectedRoute>} />
            <Route path="/plano" element={<ProtectedRoute><Plan /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
