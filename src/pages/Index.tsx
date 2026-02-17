import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Calendar, MessageSquare, Palette, ArrowRight, CheckCircle,
  Sparkles, Shield, Zap, Users, Star, Clock, Play,
  BarChart3, Globe, Smartphone, ChevronRight
} from 'lucide-react';
import sloteraLogo from '@/assets/slotera-logo.png';

const features = [
  {
    icon: Calendar,
    title: 'Agendamento Online 24h',
    desc: 'Seus clientes agendam a qualquer momento pelo link exclusivo. Escolhem serviço, profissional, data e horário em segundos.',
    highlight: 'Disponível 24/7',
  },
  {
    icon: MessageSquare,
    title: 'WhatsApp Automático',
    desc: 'Confirmação instantânea, lembretes inteligentes e avisos de cancelamento direto no WhatsApp do cliente.',
    highlight: 'Reduz faltas em 70%',
  },
  {
    icon: Palette,
    title: 'Página Personalizada',
    desc: 'Cores, logo, fontes e textos — tudo configurável para refletir a identidade visual do seu negócio.',
    highlight: 'Sua marca, seu estilo',
  },
  {
    icon: BarChart3,
    title: 'Painel Inteligente',
    desc: 'Dashboard completo com métricas em tempo real, histórico de agendamentos e relatórios de desempenho.',
    highlight: 'Dados em tempo real',
  },
  {
    icon: Users,
    title: 'Multi-Profissionais',
    desc: 'Gerencie equipes, defina serviços por profissional e convide colaboradores com permissões personalizadas.',
    highlight: 'Gerencie sua equipe',
  },
  {
    icon: Globe,
    title: 'Google Calendar & Meet',
    desc: 'Sincronize agendamentos com Google Agenda e gere links de reunião automaticamente para atendimentos online.',
    highlight: 'Integração nativa',
  },
];

const benefits = [
  { icon: Zap, text: 'Pronto em menos de 2 minutos' },
  { icon: Shield, text: 'Dados seguros e criptografados' },
  { icon: Smartphone, text: '100% responsivo e mobile' },
  { icon: Clock, text: 'Lembretes automáticos' },
];

const steps = [
  { step: '01', title: 'Crie sua conta', desc: 'Cadastre-se gratuitamente em menos de 1 minuto.' },
  { step: '02', title: 'Configure seus serviços', desc: 'Adicione serviços, profissionais e horários de funcionamento.' },
  { step: '03', title: 'Compartilhe seu link', desc: 'Envie o link da sua página e comece a receber agendamentos.' },
];

export default function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [platform, setPlatform] = useState<any>(null);

  useEffect(() => {
    if (!loading && user) navigate('/dashboard');
  }, [user, loading, navigate]);

  useEffect(() => {
    supabase
      .from('platform_settings')
      .select('*')
      .limit(1)
      .single()
      .then(({ data }) => { if (data) setPlatform(data); });
  }, []);

  const heroTitle = platform?.hero_title || 'Sua agenda online,';
  const heroHighlight = platform?.hero_title_highlight || 'sempre organizada';
  const heroSubtitle = platform?.hero_subtitle || 'Plataforma completa de agendamentos com página personalizada, notificações automáticas por WhatsApp e painel inteligente para qualquer tipo de negócio.';
  const ctaText = platform?.cta_text || 'Pronto para transformar seu negócio?';
  const ctaSubtitle = platform?.cta_subtitle || 'Comece agora e tenha sua página de agendamentos online em menos de 2 minutos. Sem complicação.';
  const footerText = platform?.footer_text || `© ${new Date().getFullYear()} Slotera. Todos os direitos reservados.`;
  const platformLogo = platform?.logo_url || sloteraLogo;

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Nav */}
      <nav className="border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-2.5">
            <img src={platformLogo} alt="Slotera" className="h-9 w-auto" />
            <span className="text-lg font-extrabold tracking-tight">Slotera</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => navigate('/login')} className="font-semibold">
              Entrar
            </Button>
            <Button onClick={() => navigate('/login')} className="gradient-primary border-0 font-semibold shadow-sm hover:shadow-md transition-shadow">
              Começar grátis
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-primary/8 blur-3xl" />
          <div className="absolute top-20 -left-20 w-80 h-80 rounded-full bg-info/6 blur-3xl" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-primary-glow/5 blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pt-28 md:pb-32 text-center relative">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent border border-primary/20 text-accent-foreground text-sm font-semibold mb-8 animate-fade-in">
            <Sparkles className="h-4 w-4 text-primary" />
            7 dias grátis · Sem cartão de crédito
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 animate-fade-in leading-[1.08]">
            {heroTitle}
            <br />
            <span className="bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              {heroHighlight}
            </span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-fade-in leading-relaxed">
            {heroSubtitle}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center animate-fade-in">
            <Button
              size="lg"
              onClick={() => navigate('/login')}
              className="gradient-primary border-0 text-base px-8 h-13 font-semibold shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] rounded-xl"
            >
              Criar conta grátis
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-base px-8 h-13 font-semibold rounded-xl"
            >
              <Play className="h-4 w-4 mr-2" />
              Ver como funciona
            </Button>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 mt-16 animate-fade-in">
            {benefits.map((b) => (
              <div key={b.text} className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <b.icon className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="font-medium">{b.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-muted/40 border-y border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Como funciona</p>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              Comece em 3 passos simples
            </h2>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.step} className="relative text-center md:text-left">
                <div className="text-5xl font-extrabold text-primary/10 mb-3">{s.step}</div>
                <h3 className="text-lg font-bold mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 -right-4 text-primary/20">
                    <ChevronRight className="h-8 w-8" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Recursos</p>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3">
            Tudo que você precisa em um só lugar
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Ferramentas poderosas para simplificar sua rotina e encantar seus clientes.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="group glass-card rounded-2xl p-6 hover:translate-y-[-4px] transition-all duration-300 border-0 shadow-sm hover:shadow-lg"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <span className="text-[11px] font-semibold text-primary bg-primary/8 px-2.5 py-1 rounded-full">
                  {f.highlight}
                </span>
              </div>
              <h3 className="text-base font-bold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Social proof */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="rounded-2xl p-8 md:p-12 bg-gradient-to-br from-muted/60 to-background border border-border/60">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            {[
              { value: '500+', label: 'Negócios ativos', icon: Users },
              { value: '50k+', label: 'Agendamentos/mês', icon: Calendar },
              { value: '4.9', label: 'Avaliação média', icon: Star },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                  <s.icon className={`h-5 w-5 text-primary ${s.icon === Star ? 'fill-primary' : ''}`} />
                </div>
                <p className="text-3xl md:text-4xl font-extrabold text-foreground mb-1">
                  {s.value}
                </p>
                <p className="text-muted-foreground font-medium text-sm">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="relative rounded-2xl overflow-hidden gradient-primary p-10 md:p-16 text-center text-primary-foreground">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-96 h-96 rounded-full bg-white/5 blur-3xl" />
          </div>
          <div className="relative">
            <h2 className="text-2xl md:text-4xl font-extrabold mb-4">
              {ctaText}
            </h2>
            <p className="text-primary-foreground/80 mb-8 text-lg max-w-lg mx-auto leading-relaxed">
              {ctaSubtitle}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                size="lg"
                onClick={() => navigate('/login')}
                className="bg-white text-foreground hover:bg-white/90 font-semibold px-8 h-13 text-base shadow-lg rounded-xl"
              >
                Começar grátis agora
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
            <p className="text-primary-foreground/60 text-sm mt-4 font-medium">
              ✓ 7 dias grátis &nbsp; ✓ Sem cartão de crédito &nbsp; ✓ Cancele quando quiser
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <img src={platformLogo} alt="Slotera" className="h-7 w-auto" />
              <span className="font-bold text-foreground">Slotera</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {footerText}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
