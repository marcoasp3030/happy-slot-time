import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Calendar, ExternalLink, Key, Shield, Users, ArrowRight, 
  CheckCircle2, AlertTriangle, Info 
} from 'lucide-react';

export default function AdminGoogleCalendar() {
  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Integração Google Calendar</h1>
              <p className="text-sm text-muted-foreground">
                Guia de configuração para sincronizar agendamentos com o Google Agenda
              </p>
            </div>
          </div>
        </div>

        {/* Architecture Overview */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              Como funciona
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-background border">
                <Shield className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Super Admin</p>
                  <p>Configura o projeto no Google Cloud e adiciona as credenciais (Client ID e Secret)</p>
                </div>
              </div>
              <div className="flex items-center justify-center">
                <ArrowRight className="h-5 w-5 text-muted-foreground hidden sm:block" />
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-background border">
                <Users className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Lojistas</p>
                  <p>Conectam suas próprias contas Google para sincronizar seus calendários pessoais</p>
                </div>
              </div>
            </div>
            <p>
              Cada lojista terá um botão "Conectar Google Agenda" nas configurações. 
              Ao clicar, será redirecionado para autorizar o acesso ao seu próprio Google Calendar. 
              Os agendamentos serão criados automaticamente no calendário do lojista.
            </p>
          </CardContent>
        </Card>

        {/* Step 1 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="h-7 w-7 rounded-full flex items-center justify-center p-0 text-xs font-bold">1</Badge>
              <div>
                <CardTitle className="text-base">Criar Projeto no Google Cloud Console</CardTitle>
                <CardDescription>Acesse o console do Google Cloud para criar o projeto</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>
                Acesse o{' '}
                <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                  Google Cloud Console <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>Clique em <strong className="text-foreground">"Select a project"</strong> → <strong className="text-foreground">"New Project"</strong></li>
              <li>Dê um nome ao projeto (ex: "AgendaFácil") e clique em <strong className="text-foreground">"Create"</strong></li>
              <li>Selecione o projeto recém-criado</li>
            </ol>
          </CardContent>
        </Card>

        {/* Step 2 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="h-7 w-7 rounded-full flex items-center justify-center p-0 text-xs font-bold">2</Badge>
              <div>
                <CardTitle className="text-base">Ativar a Google Calendar API</CardTitle>
                <CardDescription>Habilite a API do Google Calendar no projeto</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>
                No menu lateral, vá em <strong className="text-foreground">"APIs & Services"</strong> → <strong className="text-foreground">"Library"</strong>
              </li>
              <li>Pesquise por <strong className="text-foreground">"Google Calendar API"</strong></li>
              <li>Clique no resultado e depois em <strong className="text-foreground">"Enable"</strong></li>
            </ol>
          </CardContent>
        </Card>

        {/* Step 3 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="h-7 w-7 rounded-full flex items-center justify-center p-0 text-xs font-bold">3</Badge>
              <div>
                <CardTitle className="text-base">Configurar Tela de Consentimento OAuth</CardTitle>
                <CardDescription>Configure o que os lojistas verão ao autorizar o acesso</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>Vá em <strong className="text-foreground">"APIs & Services"</strong> → <strong className="text-foreground">"OAuth consent screen"</strong></li>
              <li>Selecione <strong className="text-foreground">"External"</strong> como tipo de usuário</li>
              <li>Preencha os campos obrigatórios:
                <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                  <li><strong className="text-foreground">App name:</strong> AgendaFácil</li>
                  <li><strong className="text-foreground">User support email:</strong> seu email</li>
                  <li><strong className="text-foreground">Developer contact:</strong> seu email</li>
                </ul>
              </li>
              <li>Na etapa <strong className="text-foreground">"Scopes"</strong>, adicione:
                <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                  <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs">.../auth/calendar.events</code></li>
                  <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs">.../auth/calendar.readonly</code></li>
                </ul>
              </li>
              <li>Salve e continue</li>
            </ol>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mt-3">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                <strong>Importante:</strong> Enquanto o app estiver em modo "Testing", apenas os emails adicionados como "Test users" poderão se conectar. Para produção, publique o app.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Step 4 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="h-7 w-7 rounded-full flex items-center justify-center p-0 text-xs font-bold">4</Badge>
              <div>
                <CardTitle className="text-base">Criar Credenciais OAuth Client ID</CardTitle>
                <CardDescription>Gere o Client ID e Client Secret</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>Vá em <strong className="text-foreground">"APIs & Services"</strong> → <strong className="text-foreground">"Credentials"</strong></li>
              <li>Clique em <strong className="text-foreground">"+ Create Credentials"</strong> → <strong className="text-foreground">"OAuth Client ID"</strong></li>
              <li>Selecione <strong className="text-foreground">"Web application"</strong> como tipo</li>
              <li>Em <strong className="text-foreground">"Authorized redirect URIs"</strong>, adicione:
                <div className="mt-2 p-2.5 bg-muted rounded-lg font-mono text-xs break-all select-all">
                  https://hqzizllylxkfwowwjwxe.supabase.co/functions/v1/google-calendar/callback
                </div>
              </li>
              <li>Clique em <strong className="text-foreground">"Create"</strong></li>
              <li>Copie o <strong className="text-foreground">Client ID</strong> e o <strong className="text-foreground">Client Secret</strong></li>
            </ol>
          </CardContent>
        </Card>

        {/* Step 5 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="h-7 w-7 rounded-full flex items-center justify-center p-0 text-xs font-bold">5</Badge>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Adicionar Credenciais na Plataforma
                </CardTitle>
                <CardDescription>Salve as credenciais de forma segura no backend</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              As credenciais devem ser adicionadas como secrets seguros no backend da plataforma. 
              Solicite ao desenvolvedor que adicione:
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2.5 bg-muted rounded-lg">
                <code className="text-xs font-mono font-semibold">GOOGLE_CLIENT_ID</code>
                <span className="text-xs text-muted-foreground">→ O Client ID gerado no passo anterior</span>
              </div>
              <div className="flex items-center gap-2 p-2.5 bg-muted rounded-lg">
                <code className="text-xs font-mono font-semibold">GOOGLE_CLIENT_SECRET</code>
                <span className="text-xs text-muted-foreground">→ O Client Secret gerado no passo anterior</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* What happens for tenants */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              O que o lojista precisa fazer?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>Após a configuração acima, cada lojista poderá conectar sua conta Google seguindo estes passos simples:</p>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">1. Acessar Configurações</p>
                  <p>No menu lateral, o lojista acessa a página de configurações do Google Calendar</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">2. Clicar em "Conectar Google Agenda"</p>
                  <p>Será redirecionado para a tela de login do Google para autorizar o acesso</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">3. Autorizar o acesso</p>
                  <p>O lojista permite que a plataforma crie eventos no seu Google Calendar</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">4. Pronto!</p>
                  <p>A partir desse momento, novos agendamentos serão criados automaticamente no Google Agenda do lojista. Cancelamentos também serão refletidos.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
