import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, ArrowRight, Sparkles, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const trialBenefits = [
  'Página de agendamento personalizada',
  'Notificações por WhatsApp',
  'Painel completo de gestão',
  'Suporte por e-mail',
];

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate('/dashboard');
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName, company_name: companyName },
          },
        });
        if (error) throw error;
        toast.success('Conta criada! Verifique seu e-mail para confirmar.');
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro ao processar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 gradient-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-black/5 to-transparent" />
        <div className="absolute -bottom-20 -left-20 w-96 h-96 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/10 blur-3xl" />

        <div className="relative flex flex-col justify-center px-12 xl:px-16 text-white w-full">
          <div className="flex items-center gap-2.5 mb-10">
            <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <Calendar className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-extrabold tracking-tight">AgendaFácil</span>
          </div>

          <h2 className="text-3xl xl:text-4xl font-extrabold leading-tight mb-4">
            A forma mais fácil de<br />
            gerenciar agendamentos
          </h2>
          <p className="text-white/70 text-lg mb-10 max-w-md leading-relaxed">
            Simplifique sua rotina, reduza faltas e ofereça uma experiência moderna aos seus clientes.
          </p>

          <div className="space-y-4">
            {trialBenefits.map((b) => (
              <div key={b} className="flex items-center gap-3">
                <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-white/90 font-medium">{b}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-[420px] page-transition">
          {/* Mobile logo */}
          <div className="flex items-center justify-center gap-2.5 mb-8 lg:hidden">
            <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center animate-pulse-glow">
              <Calendar className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-extrabold tracking-tight">AgendaFácil</span>
          </div>

          <Card className="border-0 shadow-none bg-transparent">
            <CardHeader className="text-center px-0 pb-6">
              <CardTitle className="text-2xl font-extrabold tracking-tight">
                {isLogin ? 'Bem-vindo de volta' : 'Crie sua conta grátis'}
              </CardTitle>
              <CardDescription className="text-base">
                {isLogin
                  ? 'Acesse o painel do seu negócio'
                  : (
                    <span className="flex items-center justify-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-primary" />
                      7 dias de teste grátis
                    </span>
                  )}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <form onSubmit={handleSubmit} className="space-y-4">
                {!isLogin && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="fullName" className="text-sm font-semibold">
                        Nome completo
                      </Label>
                      <Input
                        id="fullName"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        placeholder="Seu nome"
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="companyName" className="text-sm font-semibold">
                        Nome do negócio
                      </Label>
                      <Input
                        id="companyName"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        required
                        placeholder="Ex: Salão da Ana"
                        className="h-11"
                      />
                    </div>
                  </>
                )}
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
                  className="w-full h-11 gradient-primary border-0 font-semibold text-base shadow-sm hover:shadow-md transition-all"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processando...
                    </span>
                  ) : isLogin ? (
                    <span className="flex items-center gap-2">
                      Entrar <ArrowRight className="h-4 w-4" />
                    </span>
                  ) : (
                    'Criar conta'
                  )}
                </Button>
              </form>
              <div className="mt-6 text-center">
                <button
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-sm text-muted-foreground hover:text-foreground font-medium transition-colors"
                >
                  {isLogin ? (
                    <>Não tem conta? <span className="text-primary font-semibold">Criar grátis</span></>
                  ) : (
                    <>Já tem conta? <span className="text-primary font-semibold">Entrar</span></>
                  )}
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
