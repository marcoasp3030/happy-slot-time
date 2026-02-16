import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import PageTransition from "@/components/PageTransition";
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

function AnimatedRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PageTransition><Index /></PageTransition>} />
      <Route path="/login" element={<PageTransition><Auth /></PageTransition>} />
      <Route path="/agendar/:slug" element={<PageTransition><PublicBooking /></PageTransition>} />
      <Route path="/dashboard" element={<ProtectedRoute><PageTransition><Dashboard /></PageTransition></ProtectedRoute>} />
      <Route path="/servicos" element={<ProtectedRoute><PageTransition><Services /></PageTransition></ProtectedRoute>} />
      <Route path="/profissionais" element={<ProtectedRoute><PageTransition><Staff /></PageTransition></ProtectedRoute>} />
      <Route path="/horarios" element={<ProtectedRoute><PageTransition><BusinessHours /></PageTransition></ProtectedRoute>} />
      <Route path="/agendamentos" element={<ProtectedRoute><PageTransition><Appointments /></PageTransition></ProtectedRoute>} />
      <Route path="/aparencia" element={<ProtectedRoute><PageTransition><Appearance /></PageTransition></ProtectedRoute>} />
      <Route path="/whatsapp" element={<ProtectedRoute><PageTransition><WhatsAppSettings /></PageTransition></ProtectedRoute>} />
      <Route path="/plano" element={<ProtectedRoute><PageTransition><Plan /></PageTransition></ProtectedRoute>} />
      <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AnimatedRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
