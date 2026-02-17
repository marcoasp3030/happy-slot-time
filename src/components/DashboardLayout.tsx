import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import {
  LayoutDashboard, Users, Clock, Calendar,
  Palette, MessageSquare, CreditCard, Menu, X, LogOut,
  ChevronRight, Bell, Shield, Search, ClipboardList, Layers, ScrollText, Bot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import sloteraLogo from '@/assets/slotera-logo.png';

const navItems = [
  { title: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { title: 'Agendamentos', icon: Calendar, path: '/agendamentos' },
  { title: 'Serviços', icon: Clock, path: '/servicos' },
  { title: 'Profissionais', icon: Users, path: '/profissionais' },
  { title: 'Horários', icon: Clock, path: '/horarios' },
  { title: 'Fichas de Clientes', icon: ClipboardList, path: '/fichas' },
  { title: 'Anamnese (Config)', icon: Layers, path: '/anamnese' },
];

const settingsItems = [
  { title: 'Aparência', icon: Palette, path: '/aparencia' },
  { title: 'WhatsApp', icon: MessageSquare, path: '/whatsapp' },
  { title: 'Agente IA', icon: Bot, path: '/agente-ia' },
  { title: 'Google Agenda', icon: Calendar, path: '/google-calendar' },
  { title: 'LGPD & Privacidade', icon: Shield, path: '/privacidade' },
  { title: 'Logs & Auditoria', icon: ScrollText, path: '/logs' },
  { title: 'Plano', icon: CreditCard, path: '/plano' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { isSuperAdmin } = useRole();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const userInitial = user?.email?.charAt(0)?.toUpperCase() || 'U';
  const userName = user?.email?.split('@')[0] || 'Usuário';

  const NavItem = ({ item }: { item: typeof navItems[0] }) => {
    const isActive = location.pathname === item.path;
    return (
      <Link
        to={item.path}
        onClick={() => setSidebarOpen(false)}
        className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
          isActive
            ? 'bg-sidebar-accent text-sidebar-primary shadow-sm'
            : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
        }`}
      >
        <item.icon className={`h-[18px] w-[18px] flex-shrink-0 transition-colors ${isActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/60 group-hover:text-sidebar-accent-foreground'}`} />
        <span className="flex-1">{item.title}</span>
        {isActive && <ChevronRight className="h-3.5 w-3.5 text-sidebar-primary/60" />}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] gradient-sidebar text-sidebar-foreground transform transition-transform duration-300 ease-out lg:translate-x-0 lg:static lg:z-auto flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 h-16 flex-shrink-0">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <img src={sloteraLogo} alt="Slotera" className="h-8 w-auto" />
            <span className="text-base font-extrabold text-sidebar-accent-foreground tracking-tight">
              Slotera
            </span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 overflow-y-auto space-y-1">
          <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
            Principal
          </p>
          {navItems.map((item) => (
            <NavItem key={item.path} item={item} />
          ))}

          <Separator className="my-3 bg-sidebar-border" />

          <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
            Configurações
          </p>
          {settingsItems.map((item) => (
            <NavItem key={item.path} item={item} />
          ))}

          {isSuperAdmin && (
            <>
              <Separator className="my-3 bg-sidebar-border" />
              <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                Super Admin
              </p>
              <Link
                to="/admin"
                onClick={() => setSidebarOpen(false)}
                className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-all duration-200"
              >
                <Shield className="h-[18px] w-[18px] flex-shrink-0" />
                <span className="flex-1">Painel Admin</span>
                <ChevronRight className="h-3.5 w-3.5 text-destructive/60" />
              </Link>
            </>
          )}
        </nav>

        {/* User */}
        <div className="px-3 py-3 border-t border-sidebar-border flex-shrink-0">
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar className="h-9 w-9 bg-sidebar-accent">
              <AvatarFallback className="bg-gradient-to-br from-primary to-primary-glow text-primary-foreground text-sm font-bold">
                {userInitial}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-sidebar-accent-foreground truncate capitalize">{userName}</p>
              <p className="text-[11px] text-sidebar-foreground/50 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-sidebar-foreground/60 hover:text-destructive hover:bg-destructive/10 w-full transition-all mt-1"
          >
            <LogOut className="h-4 w-4" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/60 bg-background/80 backdrop-blur-xl px-4 lg:px-8">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground transition-colors">
            <Menu className="h-5 w-5" />
          </button>

          {/* Search bar */}
          <div className="hidden md:flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Pesquisar..."
                className="w-full h-9 pl-9 pr-4 rounded-lg bg-muted/60 border-0 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all"
              />
            </div>
          </div>

          <div className="flex-1 md:hidden" />

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground relative">
              <Bell className="h-4.5 w-4.5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
            </Button>
            <Avatar className="h-8 w-8 cursor-pointer">
              <AvatarFallback className="bg-gradient-to-br from-primary to-primary-glow text-primary-foreground text-sm font-bold">
                {userInitial}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-8 page-transition">
          {children}
        </main>
      </div>
    </div>
  );
}
