import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, Search, Building2, MailCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  role: string;
  company_id: string | null;
  created_at: string;
  company_name?: string;
  email_confirmed?: boolean;
}

export default function AdminUsers() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmingUserId, setConfirmingUserId] = useState<string | null>(null);

  const fetchProfiles = async () => {
    setLoading(true);
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (profilesData) {
      const companyIds = profilesData.filter(p => p.company_id).map(p => p.company_id!);
      const { data: companies } = await supabase
        .from('companies')
        .select('id, name')
        .in('id', companyIds);

      const companyMap = new Map((companies || []).map(c => [c.id, c.name]));
      setProfiles(profilesData.map(p => ({
        ...p,
        company_name: p.company_id ? companyMap.get(p.company_id) || 'N/A' : 'Sem empresa',
      })));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const confirmUserEmail = async (userId: string) => {
    setConfirmingUserId(userId);
    try {
      const { data, error } = await supabase.functions.invoke('admin-confirm-user', {
        body: { user_id: userId },
      });

      if (error) throw error;
      if (data?.success) {
        toast.success('Email confirmado com sucesso! O usuário já pode acessar a plataforma.');
        // Update local state
        setProfiles(prev => prev.map(p => 
          p.user_id === userId ? { ...p, email_confirmed: true } : p
        ));
      } else {
        toast.error(data?.error || 'Erro ao confirmar email');
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao confirmar email do usuário');
    } finally {
      setConfirmingUserId(null);
    }
  };

  const filtered = profiles.filter(p =>
    (p.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.company_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="section-header">
          <h1 className="section-title">Usuários</h1>
          <p className="section-subtitle">Todos os usuários registrados na plataforma</p>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((profile) => (
              <Card key={profile.id} className="glass-card rounded-2xl">
                <CardContent className="flex items-center justify-between p-5">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <span className="text-primary font-bold text-sm">
                        {(profile.full_name || 'U').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{profile.full_name || 'Sem nome'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{profile.company_name}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1 text-primary hover:text-primary"
                      onClick={() => confirmUserEmail(profile.user_id)}
                      disabled={confirmingUserId === profile.user_id || profile.email_confirmed === true}
                    >
                      {confirmingUserId === profile.user_id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <MailCheck className="h-3 w-3" />
                      )}
                      {profile.email_confirmed ? 'Confirmado' : 'Confirmar Email'}
                    </Button>
                    <Badge variant="secondary" className="text-xs">{profile.role}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(profile.created_at)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhum usuário encontrado</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
