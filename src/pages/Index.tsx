import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  Calendar, MessageSquare, Palette, ArrowRight, CheckCircle,
  Sparkles, Shield, Zap, Users, Star, Clock
} from 'lucide-react';

const features = [
  {
    icon: Calendar,
    title: 'Agendamento Online 24h',
    desc: 'Seus clientes agendam a qualquer momento pelo link exclusivo. Escolhem serviço, profissional, data e horário em segundos.',
    gradient: 'from-primary to-primary-glow',
  },
  {
    icon: MessageSquare,
    title: 'WhatsApp Automático',
    desc: 'Confirmação instantânea, lembretes inteligentes e avisos de cancelamento direto no WhatsApp do cliente.',
    gradient: 'from-info to-blue-400',
  },
  {
    icon: Palette,
    title: 'Página Personalizada',
    desc: 'Cores, logo, fontes e textos — tudo configurável para refletir a identidade visual do seu negócio.',
    gradient: 'from-purple-500 to-pink-500',
  },
];

const benefits = [
  { icon: Zap, text: 'Pronto em menos de 2 minutos' },
  { icon: Shield, text: 'Dados seguros e criptografados' },
  { icon: Users, text: 'Multi-profissionais e serviços' },
  { icon: Clock, text: 'Lembretes automáticos' },
];

export default function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate('/dashboard');
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Nav */}
      <nav className="border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl gradient-primary flex items-center justify-center shadow-sm animate-pulse-glow">
              <Calendar className="h-4.5 w-4.5 text-primary-foreground" />
            </div>
            <span className="text-lg font-extrabold tracking-tight">AgendaFácil</span>
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
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute top-20 -left-20 w-72 h-72 rounded-full bg-info/5 blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-20 md:pt-24 md:pb-28 text-center relative">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent border border-primary/20 text-accent-foreground text-sm font-semibold mb-8 animate-fade-in">
            <Sparkles className="h-4 w-4 text-primary" />
            7 dias grátis · Sem cartão de crédito
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 animate-fade-in leading-[1.1]">
            Agendamentos online
            <br />
            <span className="bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              simples e profissional
            </span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-fade-in leading-relaxed">
            Página de agendamento personalizada, notificações automáticas por WhatsApp e painel completo para gerenciar seu negócio de beleza.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center animate-fade-in">
            <Button
              size="lg"
              onClick={() => navigate('/login')}
              className="gradient-primary border-0 text-base px-8 h-12 font-semibold shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"
            >
              Criar conta grátis
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-base px-8 h-12 font-semibold"
            >
              Conheça os recursos
            </Button>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-6 mt-14 animate-fade-in">
            {benefits.map((b) => (
              <div key={b.text} className="flex items-center gap-2 text-sm text-muted-foreground">
                <b.icon className="h-4 w-4 text-primary" />
                <span>{b.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3">
            Tudo que você precisa
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Ferramentas poderosas para simplificar sua rotina e encantar seus clientes.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="group glass-card rounded-2xl p-7 hover:translate-y-[-4px] transition-all duration-300"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className={`stat-icon-box bg-gradient-to-br ${f.gradient} mb-5 shadow-sm`}>
                <f.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-lg font-bold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Social proof */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="glass-card-static rounded-2xl p-8 md:p-12 bg-gradient-to-br from-accent/50 to-background border-primary/10">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            {[
              { value: '500+', label: 'Negócios ativos' },
              { value: '50k+', label: 'Agendamentos/mês' },
              { value: '4.9', label: 'Avaliação média', icon: Star },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-3xl md:text-4xl font-extrabold text-primary mb-1 flex items-center justify-center gap-1">
                  {s.value}
                  {s.icon && <s.icon className="h-6 w-6 fill-primary" />}
                </p>
                <p className="text-muted-foreground font-medium">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="relative rounded-2xl overflow-hidden gradient-primary p-10 md:p-14 text-center text-white">
          <div className="absolute inset-0 bg-gradient-to-r from-black/10 to-transparent pointer-events-none" />
          <div className="relative">
            <h2 className="text-2xl md:text-3xl font-extrabold mb-3">
              Pronto para transformar seu negócio?
            </h2>
            <p className="text-white/80 mb-8 text-lg max-w-lg mx-auto">
              Comece agora e tenha sua página de agendamentos online em menos de 2 minutos.
            </p>
            <Button
              size="lg"
              onClick={() => navigate('/login')}
              className="bg-white text-foreground hover:bg-white/90 font-semibold px-8 h-12 text-base shadow-lg"
            >
              Começar grátis agora
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/50 py-8 text-center text-sm text-muted-foreground">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="h-6 w-6 rounded-lg gradient-primary flex items-center justify-center">
            <Calendar className="h-3 w-3 text-primary-foreground" />
          </div>
          <span className="font-bold text-foreground">AgendaFácil</span>
        </div>
        © {new Date().getFullYear()} AgendaFácil. Todos os direitos reservados.
      </footer>
    </div>
  );
}
