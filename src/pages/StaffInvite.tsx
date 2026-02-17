import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function StaffInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invite, setInvite] = useState<{ staffName: string; companyName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    const checkInvite = async () => {
      if (!token) { setError('Token inválido'); setLoading(false); return; }

      // Find staff with this invite token
      const { data: staffData, error: staffErr } = await supabase
        .from('staff')
        .select('name, company_id, invite_status')
        .eq('invite_token', token)
        .single();

      if (staffErr || !staffData) {
        setError('Convite não encontrado ou já utilizado.');
        setLoading(false);
        return;
      }

      if (staffData.invite_status === 'accepted') {
        setError('Este convite já foi utilizado.');
        setLoading(false);
        return;
      }

      // Get company name
      const { data: company } = await supabase
        .from('companies')
        .select('name')
        .eq('id', staffData.company_id)
        .single();

      setInvite({
        staffName: staffData.name,
        companyName: company?.name || 'Empresa',
      });
      setLoading(false);
    };

    checkInvite();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { invite_token: token },
        },
      });
      if (error) throw error;
      toast.success('Conta criada! Verifique seu e-mail para confirmar.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar conta');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-bold mb-2">Convite inválido</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button className="mt-6" onClick={() => navigate('/login')}>
              Ir para login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-[420px]">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center">
            <Calendar className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-extrabold tracking-tight">AgendaFácil</span>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl font-extrabold">
              Olá, {invite?.staffName}!
            </CardTitle>
            <CardDescription className="text-sm">
              Você foi convidado para fazer parte de <strong>{invite?.companyName}</strong>.
              Crie sua conta para acessar o sistema.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="seu@email.com"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  className="h-11"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-11 gradient-primary border-0 font-semibold"
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" />
                )}
                Criar minha conta
              </Button>
            </form>
            <div className="mt-4 text-center">
              <button
                onClick={() => navigate('/login')}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Já tem conta? <span className="text-primary font-semibold">Entrar</span>
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
