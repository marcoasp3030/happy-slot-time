import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Calendar, ArrowRight, Sparkles, CheckCircle, MessageSquare,
  BarChart3, Globe, Users, Smartphone, Zap, Shield, Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';
import { motion, AnimatePresence } from 'framer-motion';
import sloteraLogo from '@/assets/slotera-logo.png';

const features = [
  { icon: Calendar, text: 'Agendamento online 24h' },
  { icon: MessageSquare, text: 'WhatsApp automático' },
  { icon: BarChart3, text: 'Painel inteligente' },
  { icon: Globe, text: 'Google Calendar & Meet' },
  { icon: Users, text: 'Multi-profissionais' },
  { icon: Smartphone, text: 'Página personalizada' },
  { icon: Zap, text: 'Pronto em 2 minutos' },
  { icon: Shield, text: 'Dados criptografados' },
];

const testimonials = [
  { name: 'Ana C.', role: 'Studio de Beleza', text: 'Reduzi 80% das faltas com os lembretes automáticos!' },
  { name: 'Carlos M.', role: 'Barbearia', text: 'Meus clientes adoram agendar pelo link, muito prático.' },
  { name: 'Julia S.', role: 'Clínica Estética', text: 'O painel é incrível, tenho controle total do meu negócio.' },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
};

const featureItemVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

const formVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.3 } },
};

const fieldVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: 'easeOut' as const },
  }),
};

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
        const { data: loginData, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          logAudit({ action: 'Login falhou', category: 'auth', details: { email, error: error.message } });
          throw error;
        }
        // Log successful login
        const profile = await supabase.from('profiles').select('company_id').eq('user_id', loginData.user.id).single();
        logAudit({ companyId: profile.data?.company_id, action: 'Login realizado', category: 'auth', details: { email } });
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
        logAudit({ action: 'Cadastro realizado', category: 'auth', details: { email, company_name: companyName } });
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
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(222,47%,11%)] via-[hsl(217,91%,20%)] to-[hsl(222,47%,8%)]" />
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute -bottom-32 -left-32 w-[500px] h-[500px] rounded-full bg-primary/15 blur-3xl"
            animate={{ scale: [1, 1.1, 1], opacity: [0.15, 0.25, 0.15] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-primary-glow/10 blur-3xl"
            animate={{ scale: [1, 1.15, 1], opacity: [0.1, 0.2, 0.1] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          />
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-info/5 blur-3xl"
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          />
        </div>

        <motion.div
          className="relative flex flex-col justify-between px-12 xl:px-16 py-10 w-full"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Logo */}
          <motion.div className="flex items-center gap-2.5" variants={itemVariants}>
            <img src={sloteraLogo} alt="Slotera" className="h-10 w-auto brightness-0 invert" />
            <span className="text-xl font-extrabold tracking-tight text-white">Slotera</span>
          </motion.div>

          {/* Hero text */}
          <div className="flex-1 flex flex-col justify-center max-w-lg">
            <motion.div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm text-white/80 text-xs font-semibold mb-6 w-fit"
              variants={itemVariants}
            >
              <motion.div
                animate={{ rotate: [0, 15, -15, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              >
                <Sparkles className="h-3.5 w-3.5 text-primary-glow" />
              </motion.div>
              Plataforma #1 de agendamentos
            </motion.div>

            <motion.h2
              className="text-3xl xl:text-4xl font-extrabold leading-tight mb-4 text-white"
              variants={itemVariants}
            >
              Transforme seu negócio com
              <span className="block bg-gradient-to-r from-primary-glow to-info bg-clip-text text-transparent mt-1">
                agendamentos inteligentes
              </span>
            </motion.h2>

            <motion.p
              className="text-white/60 text-base mb-10 leading-relaxed"
              variants={itemVariants}
            >
              Tudo que você precisa para gerenciar seus atendimentos em um só lugar. Simples, rápido e profissional.
            </motion.p>

            {/* Feature grid */}
            <motion.div
              className="grid grid-cols-2 gap-3 mb-10"
              variants={containerVariants}
            >
              {features.map((f, i) => (
                <motion.div
                  key={f.text}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-sm border border-white/5 hover:bg-white/10 transition-colors cursor-default"
                  variants={featureItemVariants}
                  whileHover={{ scale: 1.03, backgroundColor: 'rgba(255,255,255,0.1)' }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                  <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <f.icon className="h-4 w-4 text-primary-glow" />
                  </div>
                  <span className="text-white/80 text-sm font-medium">{f.text}</span>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Testimonials */}
          <motion.div className="space-y-3" variants={itemVariants}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/30 mb-2">O que dizem nossos clientes</p>
            <div className="flex gap-3">
              {testimonials.map((t, i) => (
                <motion.div
                  key={t.name}
                  className="flex-1 p-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/5"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.2 + i * 0.15, duration: 0.5 }}
                  whileHover={{ y: -2, backgroundColor: 'rgba(255,255,255,0.08)' }}
                >
                  <p className="text-white/70 text-xs leading-relaxed mb-2">"{t.text}"</p>
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary-glow">
                      {t.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-white/90 text-[11px] font-semibold">{t.name}</p>
                      <p className="text-white/40 text-[10px]">{t.role}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <motion.div
            className="flex items-center justify-center gap-2.5 mb-8 lg:hidden"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <img src={sloteraLogo} alt="Slotera" className="h-10 w-auto" />
            <span className="text-xl font-extrabold tracking-tight">Slotera</span>
          </motion.div>

          <Card className="border-0 shadow-none bg-transparent">
            <AnimatePresence mode="wait">
              <motion.div
                key={isLogin ? 'login' : 'signup'}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
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
                          7 dias de teste grátis · Sem cartão
                        </span>
                      )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  <motion.form
                    onSubmit={handleSubmit}
                    className="space-y-4"
                    initial="hidden"
                    animate="visible"
                    variants={containerVariants}
                  >
                    <AnimatePresence>
                      {!isLogin && (
                        <>
                          <motion.div
                            className="space-y-2"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3 }}
                          >
                            <Label htmlFor="fullName" className="text-sm font-semibold">
                              Nome completo
                            </Label>
                            <Input
                              id="fullName"
                              value={fullName}
                              onChange={(e) => setFullName(e.target.value)}
                              required
                              placeholder="Seu nome"
                              className="h-11 rounded-xl"
                            />
                          </motion.div>
                          <motion.div
                            className="space-y-2"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3, delay: 0.05 }}
                          >
                            <Label htmlFor="companyName" className="text-sm font-semibold">
                              Nome do negócio
                            </Label>
                            <Input
                              id="companyName"
                              value={companyName}
                              onChange={(e) => setCompanyName(e.target.value)}
                              required
                              placeholder="Ex: Studio da Ana"
                              className="h-11 rounded-xl"
                            />
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>

                    <motion.div className="space-y-2" custom={0} variants={fieldVariants}>
                      <Label htmlFor="email" className="text-sm font-semibold">E-mail</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder="seu@email.com"
                        className="h-11 rounded-xl"
                      />
                    </motion.div>

                    <motion.div className="space-y-2" custom={1} variants={fieldVariants}>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password" className="text-sm font-semibold">Senha</Label>
                        {isLogin && (
                          <button type="button" className="text-xs text-primary font-semibold hover:underline">
                            Esqueceu a senha?
                          </button>
                        )}
                      </div>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        placeholder="Mínimo 6 caracteres"
                        className="h-11 rounded-xl"
                      />
                    </motion.div>

                    <motion.div custom={2} variants={fieldVariants}>
                      <Button
                        type="submit"
                        className="w-full h-12 gradient-primary border-0 font-semibold text-base shadow-sm hover:shadow-lg transition-all rounded-xl"
                        disabled={loading}
                      >
                        {loading ? (
                          <span className="flex items-center gap-2">
                            <motion.span
                              className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full"
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            />
                            Processando...
                          </span>
                        ) : isLogin ? (
                          <motion.span
                            className="flex items-center gap-2"
                            whileHover={{ x: 2 }}
                          >
                            Entrar <ArrowRight className="h-4 w-4" />
                          </motion.span>
                        ) : (
                          <motion.span
                            className="flex items-center gap-2"
                            whileHover={{ x: 2 }}
                          >
                            Criar conta grátis <ArrowRight className="h-4 w-4" />
                          </motion.span>
                        )}
                      </Button>
                    </motion.div>
                  </motion.form>

                  <motion.div
                    className="mt-6 text-center"
                    custom={3}
                    variants={fieldVariants}
                    initial="hidden"
                    animate="visible"
                  >
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
                  </motion.div>

                  {/* Mobile features */}
                  <motion.div
                    className="mt-8 pt-6 border-t border-border/60 lg:hidden"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                  >
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 text-center">Incluído no seu plano</p>
                    <div className="grid grid-cols-2 gap-2">
                      {features.slice(0, 4).map((f) => (
                        <div key={f.text} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <f.icon className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                          <span>{f.text}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </CardContent>
              </motion.div>
            </AnimatePresence>
          </Card>
        </div>
      </div>
    </div>
  );
}
