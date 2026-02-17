import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  LayoutDashboard, Building2, Users, CreditCard, BarChart3, Bell, Calendar,
  Menu, X, LogOut, ChevronRight, Shield, ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const adminNavItems = [
  { title: 'Visão Geral', icon: BarChart3, path: '/admin' },
  { title: 'Empresas', icon: Building2, path: '/admin/empresas' },
  { title: 'Assinaturas', icon: CreditCard, path: '/admin/assinaturas' },
  { title: 'Usuários', icon: Users, path: '/admin/usuarios' },
  { title: 'Notificações', icon: Bell, path: '/admin/notificacoes' },
  { title: 'Google Calendar', icon: Calendar, path: '/admin/google-calendar' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();

  const userInitial = user?.email?.charAt(0)?.toUpperCase() || 'A';

  const NavItem = ({ item }: { item: typeof adminNavItems[0] }) => {
    const isActive = location.pathname === item.path;
    return (
      <Link
        to={item.path}
        onClick={() => setSidebarOpen(false)}
        className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
          isActive
            ? 'bg-destructive/15 text-destructive shadow-sm'
            : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
        }`}
      >
        <item.icon className={`h-[18px] w-[18px] flex-shrink-0 transition-colors ${isActive ? 'text-destructive' : 'text-sidebar-foreground/60 group-hover:text-sidebar-accent-foreground'}`} />
        <span className="flex-1">{item.title}</span>
        {isActive && <ChevronRight className="h-3.5 w-3.5 text-destructive/60" />}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-[hsl(0,47%,11%)] text-sidebar-foreground transform transition-transform duration-300 ease-out lg:translate-x-0 lg:static lg:z-auto flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 h-16 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-destructive flex items-center justify-center shadow-sm">
              <Shield className="h-4 w-4 text-destructive-foreground" />
            </div>
            <span className="text-base font-extrabold text-sidebar-accent-foreground tracking-tight">Slotera Admin</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-2 overflow-y-auto space-y-1">
          <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">Administração</p>
          {adminNavItems.map((item) => (
            <NavItem key={item.path} item={item} />
          ))}
          <Separator className="my-3 bg-sidebar-border" />
          <Link
            to="/dashboard"
            className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-all"
          >
            <ArrowLeft className="h-[18px] w-[18px] text-sidebar-foreground/60 group-hover:text-sidebar-accent-foreground" />
            <span>Voltar ao Dashboard</span>
          </Link>
        </nav>

        <div className="px-3 py-3 border-t border-sidebar-border flex-shrink-0">
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar className="h-8 w-8 bg-destructive/20">
              <AvatarFallback className="bg-destructive/20 text-destructive text-sm font-bold">{userInitial}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-sidebar-foreground/60 truncate">{user?.email}</p>
              <p className="text-[10px] text-destructive font-semibold">SUPER ADMIN</p>
            </div>
          </div>
          <button
            onClick={async () => { await signOut(); navigate('/login'); }}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-sidebar-foreground/60 hover:text-destructive hover:bg-destructive/10 w-full transition-all mt-1"
          >
            <LogOut className="h-4 w-4" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/60 bg-background/80 backdrop-blur-xl px-4 lg:px-8">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-destructive" />
            <span className="text-sm font-bold text-destructive">Painel Administrativo</span>
          </div>
          <div className="flex-1" />
        </header>

        <main className="flex-1 p-4 lg:p-8 page-transition">{children}</main>
      </div>
    </div>
  );
}
