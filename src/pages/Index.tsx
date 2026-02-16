import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Calendar, CheckCircle, MessageSquare, Palette, ArrowRight } from 'lucide-react';

export default function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate('/dashboard');
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
              <Calendar className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold">AgendaFácil</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => navigate('/login')}>Entrar</Button>
            <Button onClick={() => navigate('/login')}>Começar grátis</Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-20 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent text-accent-foreground text-sm font-medium mb-6">
          <span>✨</span> 7 dias grátis · Sem cartão de crédito
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-4">
          Agendamentos online<br />
          <span className="text-primary">simples e profissional</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
          Página de agendamento personalizada, notificações por WhatsApp e painel completo para gerenciar seu negócio.
        </p>
        <div className="flex gap-3 justify-center">
          <Button size="lg" onClick={() => navigate('/login')} className="text-base px-8">
            Criar conta grátis <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: Calendar, title: 'Agendamento Online', desc: 'Link próprio para seus clientes agendarem 24h. Escolhem serviço, data e horário em segundos.' },
            { icon: MessageSquare, title: 'WhatsApp Automático', desc: 'Confirmação, lembretes e avisos direto no WhatsApp do cliente via UAZAPI.' },
            { icon: Palette, title: 'Página Personalizada', desc: 'Cores, logo, textos — tudo configurável para combinar com a identidade do seu negócio.' },
          ].map((f) => (
            <div key={f.title} className="glass-card rounded-2xl p-6">
              <div className="h-12 w-12 rounded-xl bg-accent flex items-center justify-center mb-4">
                <f.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 py-16 text-center">
        <div className="glass-card rounded-2xl p-10">
          <h2 className="text-2xl font-bold mb-2">Pronto para começar?</h2>
          <p className="text-muted-foreground mb-6">Crie sua conta em menos de 1 minuto.</p>
          <Button size="lg" onClick={() => navigate('/login')}>
            Começar grátis <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} AgendaFácil. Todos os direitos reservados.
      </footer>
    </div>
  );
}
