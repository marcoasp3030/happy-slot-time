import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { supabase } from "@/integrations/supabase/client";
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
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminCompanies from "./pages/admin/AdminCompanies";
import AdminSubscriptions from "./pages/admin/AdminSubscriptions";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminNotifications from "./pages/admin/AdminNotifications";
import AdminGoogleCalendar from "./pages/admin/AdminGoogleCalendar";
import GoogleCalendarSettings from "./pages/GoogleCalendarSettings";
import AdminPlatformSettings from "./pages/admin/AdminPlatformSettings";
import AdminAuditLogs from "./pages/admin/AdminAuditLogs";
import StaffInvite from "./pages/StaffInvite";
import StaffDashboard from "./pages/StaffDashboard";
import AnamnesisTemplates from "./pages/AnamnesisTemplates";
import ClientRecords from "./pages/ClientRecords";
import PrivacyPolicySettings from "./pages/PrivacyPolicySettings";
import PrivacyPolicyPublic from "./pages/PrivacyPolicyPublic";
import AuditLogs from "./pages/AuditLogs";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, companyId, profileRole } = useAuth();
  const { isSuperAdmin } = useRole();
  const [blocked, setBlocked] = useState(false);
  const [checkingBlock, setCheckingBlock] = useState(true);

  useEffect(() => {
    if (!companyId) { setCheckingBlock(false); return; }
    supabase.from('companies').select('blocked').eq('id', companyId).single().then(({ data }) => {
      setBlocked(data?.blocked || false);
      setCheckingBlock(false);
    });
  }, [companyId]);

  if (loading || checkingBlock) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Carregando...</div></div>;
  if (!user) return <Navigate to="/login" replace />;
  
  // Staff users get redirected to their own dashboard
  if (profileRole === 'staff') return <Navigate to="/staff-dashboard" replace />;
  
  if (blocked && !isSuperAdmin) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🚫</span>
        </div>
        <h1 className="text-xl font-bold mb-2">Conta Bloqueada</h1>
        <p className="text-muted-foreground text-sm">Sua empresa foi bloqueada pelo administrador da plataforma. Entre em contato com o suporte para mais informações.</p>
      </div>
    </div>
  );
  return <>{children}</>;
}

function StaffRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, profileRole } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Carregando...</div></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (profileRole !== 'staff') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useRole();

  if (authLoading || roleLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Carregando...</div></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function SmartLoginRedirect() {
  const { user, loading, profileRole } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Carregando...</div></div>;
  if (!user) return <PageTransition><Auth /></PageTransition>;
  if (profileRole === 'staff') return <Navigate to="/staff-dashboard" replace />;
  return <Navigate to="/dashboard" replace />;
}

function AnimatedRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PageTransition><Index /></PageTransition>} />
      <Route path="/login" element={<SmartLoginRedirect />} />
      <Route path="/convite/:token" element={<PageTransition><StaffInvite /></PageTransition>} />
      <Route path="/agendar/:slug" element={<PageTransition><PublicBooking /></PageTransition>} />
      <Route path="/privacidade/:slug" element={<PageTransition><PrivacyPolicyPublic /></PageTransition>} />
      
      {/* Staff route */}
      <Route path="/staff-dashboard" element={<StaffRoute><PageTransition><StaffDashboard /></PageTransition></StaffRoute>} />
      
      {/* Admin/Owner routes */}
      <Route path="/dashboard" element={<ProtectedRoute><PageTransition><Dashboard /></PageTransition></ProtectedRoute>} />
      <Route path="/servicos" element={<ProtectedRoute><PageTransition><Services /></PageTransition></ProtectedRoute>} />
      <Route path="/profissionais" element={<ProtectedRoute><PageTransition><Staff /></PageTransition></ProtectedRoute>} />
      <Route path="/horarios" element={<ProtectedRoute><PageTransition><BusinessHours /></PageTransition></ProtectedRoute>} />
      <Route path="/agendamentos" element={<ProtectedRoute><PageTransition><Appointments /></PageTransition></ProtectedRoute>} />
      <Route path="/aparencia" element={<ProtectedRoute><PageTransition><Appearance /></PageTransition></ProtectedRoute>} />
      <Route path="/whatsapp" element={<ProtectedRoute><PageTransition><WhatsAppSettings /></PageTransition></ProtectedRoute>} />
      <Route path="/plano" element={<ProtectedRoute><PageTransition><Plan /></PageTransition></ProtectedRoute>} />
      <Route path="/google-calendar" element={<ProtectedRoute><PageTransition><GoogleCalendarSettings /></PageTransition></ProtectedRoute>} />
      <Route path="/anamnese" element={<ProtectedRoute><PageTransition><AnamnesisTemplates /></PageTransition></ProtectedRoute>} />
      <Route path="/fichas" element={<ProtectedRoute><PageTransition><ClientRecords /></PageTransition></ProtectedRoute>} />
      <Route path="/privacidade" element={<ProtectedRoute><PageTransition><PrivacyPolicySettings /></PageTransition></ProtectedRoute>} />
      <Route path="/logs" element={<ProtectedRoute><PageTransition><AuditLogs /></PageTransition></ProtectedRoute>} />
      
      {/* Super admin routes */}
      <Route path="/admin" element={<AdminRoute><PageTransition><AdminDashboard /></PageTransition></AdminRoute>} />
      <Route path="/admin/empresas" element={<AdminRoute><PageTransition><AdminCompanies /></PageTransition></AdminRoute>} />
      <Route path="/admin/assinaturas" element={<AdminRoute><PageTransition><AdminSubscriptions /></PageTransition></AdminRoute>} />
      <Route path="/admin/usuarios" element={<AdminRoute><PageTransition><AdminUsers /></PageTransition></AdminRoute>} />
      <Route path="/admin/notificacoes" element={<AdminRoute><PageTransition><AdminNotifications /></PageTransition></AdminRoute>} />
      <Route path="/admin/google-calendar" element={<AdminRoute><PageTransition><AdminGoogleCalendar /></PageTransition></AdminRoute>} />
      <Route path="/admin/plataforma" element={<AdminRoute><PageTransition><AdminPlatformSettings /></PageTransition></AdminRoute>} />
      <Route path="/admin/logs" element={<AdminRoute><PageTransition><AdminAuditLogs /></PageTransition></AdminRoute>} />
      
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
