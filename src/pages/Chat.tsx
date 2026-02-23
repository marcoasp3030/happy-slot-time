import { useState, useEffect, useRef, useCallback, memo } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Search, Send, Paperclip, Smile, Phone, MoreVertical,
  Check, CheckCheck, Clock, X, MessageSquare, ArrowLeft,
  FileText, Download, ExternalLink,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from 'sonner';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ── Types ──────────────────────────────────────────────
interface Conversation {
  id: string;
  phone: string;
  client_name: string | null;
  status: string;
  last_message_at: string | null;
  instance_id: string | null;
  handoff_requested: boolean | null;
}

interface Message {
  id: string;
  conversation_id: string;
  direction: string;
  message_type: string;
  content: string | null;
  media_url: string | null;
  metadata: any;
  created_at: string;
  delivery_status: string | null;
  wa_message_id: string | null;
  company_id: string;
}

// ── Helpers ────────────────────────────────────────────
const EMOJI_LIST = ['😀','😂','❤️','👍','👋','🔥','🎉','😢','😮','🙏','✅','❌','👏','💪','🤔','😎','🥰','😡','💯','⭐'];
const QUICK_REACTIONS = ['👍','❤️','😂','😮','😢','🙏'];

function formatConvDate(dateStr: string | null) {
  if (!dateStr) return '';
  const d = parseISO(dateStr);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Ontem';
  return format(d, 'dd/MM/yy');
}

function formatMsgTime(dateStr: string) {
  return format(parseISO(dateStr), 'HH:mm');
}

function formatPhoneDisplay(phone: string) {
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 13) return `+${clean.slice(0,2)} (${clean.slice(2,4)}) ${clean.slice(4,9)}-${clean.slice(9)}`;
  if (clean.length === 12) return `+${clean.slice(0,2)} (${clean.slice(2,4)}) ${clean.slice(4,8)}-${clean.slice(8)}`;
  return phone;
}

// ── Delivery status icon ──────────────────────────────
const DeliveryIcon = memo(function DeliveryIcon({ status }: { status: string | null }) {
  if (!status || status === 'pending') return <Clock className="h-3 w-3 text-primary-foreground/40" />;
  if (status === 'sent') return <Check className="h-3 w-3 text-primary-foreground/50" />;
  if (status === 'delivered') return <CheckCheck className="h-3 w-3 text-primary-foreground/50" />;
  if (status === 'read') return <CheckCheck className="h-3 w-3 text-info" />;
  if (status === 'error' || status === 'failed') return <X className="h-3 w-3 text-destructive" />;
  return null;
});

// ── Interactive buttons rendering ─────────────────────
function InteractiveButtons({ metadata, onButtonClick }: { metadata: any; onButtonClick?: (text: string) => void }) {
  if (!metadata) return null;

  // Parse metadata if string
  let meta = metadata;
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta); } catch { return null; }
  }

  // Button message
  const buttons = meta?.buttons || meta?.choices;
  if (buttons && Array.isArray(buttons) && buttons.length > 0) {
    return (
      <div className="flex flex-col gap-1 mt-2 border-t border-border/20 pt-2">
        {buttons.map((btn: any, i: number) => {
          const label = typeof btn === 'string'
            ? btn.split('|')[0]
            : btn?.text || btn?.title || btn?.displayText || btn?.buttonText || String(btn);
          return (
            <button
              key={i}
              onClick={() => onButtonClick?.(label)}
              className="w-full text-center py-2 px-3 text-sm font-medium text-accent-foreground bg-accent/30 hover:bg-accent/50 rounded-lg transition-colors border border-border/20"
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  // List message sections
  const sections = meta?.list_sections || meta?.sections;
  if (sections && Array.isArray(sections) && sections.length > 0) {
    return (
      <div className="flex flex-col gap-1 mt-2 border-t border-border/20 pt-2">
        {sections.map((section: any, si: number) => (
          <div key={si}>
            {section.title && (
              <p className="text-[10px] font-semibold uppercase text-muted-foreground/70 px-1 mb-1">{section.title}</p>
            )}
            {section.rows?.map((row: any, ri: number) => (
              <button
                key={ri}
                onClick={() => onButtonClick?.(row.title || row.description)}
                className="w-full text-left py-1.5 px-3 text-sm hover:bg-accent/30 rounded-md transition-colors"
              >
                <span className="font-medium">{row.title}</span>
                {row.description && <span className="text-xs text-muted-foreground ml-1">— {row.description}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return null;
}

// ── Message Bubble ────────────────────────────────────
const MessageBubble = memo(function MessageBubble({
  message, onReact, onButtonClick,
}: {
  message: Message;
  onReact: (emoji: string) => void;
  onButtonClick?: (text: string) => void;
}) {
  const isOutgoing = message.direction === 'outgoing';
  const [showReactions, setShowReactions] = useState(false);

  const renderContent = () => {
    if (message.message_type === 'image' && message.media_url) {
      return (
        <div>
          <img src={message.media_url} alt="" className="max-w-full rounded-lg mb-1 cursor-pointer" loading="lazy"
            onClick={() => window.open(message.media_url!, '_blank')} />
          {message.content && <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{message.content}</p>}
        </div>
      );
    }
    if (message.message_type === 'video' && message.media_url) {
      return (
        <div>
          <video src={message.media_url} controls className="max-w-full rounded-lg mb-1" />
          {message.content && <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{message.content}</p>}
        </div>
      );
    }
    if (message.message_type === 'audio' && message.media_url) {
      return <audio src={message.media_url} controls className="w-full min-w-[200px]" />;
    }
    if (message.message_type === 'sticker' && message.media_url) {
      return <img src={message.media_url} alt="Sticker" className="w-32 h-32 object-contain" loading="lazy" />;
    }
    if (message.message_type === 'document' && message.media_url) {
      return (
        <a href={message.media_url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 rounded-lg bg-background/30 hover:bg-background/50 transition-colors min-w-[200px]">
          <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
            <FileText className="h-5 w-5 text-destructive" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{message.content || 'Documento'}</p>
            <p className="text-[11px] text-muted-foreground">Clique para baixar</p>
          </div>
          <Download className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </a>
      );
    }
    // Default text
    return <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>;
  };

  const bubbleWidth = (message.message_type === 'audio' || message.message_type === 'document') ? 'min-w-[250px]' : '';

  return (
    <div className={cn("flex mb-1 px-[6%] group", isOutgoing ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[60%] px-2.5 py-1.5 shadow-sm",
          bubbleWidth,
          isOutgoing
            ? "bg-wa-outgoing text-white rounded-lg rounded-tr-none"
            : "bg-card text-foreground rounded-lg rounded-tl-none border border-border/20"
        )}
      >
        {renderContent()}

        {/* Interactive buttons */}
        <InteractiveButtons metadata={message.metadata} onButtonClick={onButtonClick} />

        {/* Time + delivery status */}
        <div className={cn(
          "flex items-center justify-end gap-1 mt-0.5 -mb-0.5",
          isOutgoing ? "text-white/60" : "text-muted-foreground"
        )}>
          <span className="text-[10px]">{formatMsgTime(message.created_at)}</span>
          {isOutgoing && <DeliveryIcon status={message.delivery_status} />}
        </div>

        {/* Reaction popover on hover */}
        <div className={cn(
          "absolute -bottom-3 opacity-0 group-hover:opacity-100 transition-all z-10",
          isOutgoing ? "left-0" : "right-0"
        )}>
          <Popover open={showReactions} onOpenChange={setShowReactions}>
            <PopoverTrigger asChild>
              <button className="bg-card border border-border/60 rounded-full p-1 shadow-md hover:shadow-lg transition-shadow">
                <Smile className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-1.5" side="top">
              <div className="flex gap-0.5">
                {QUICK_REACTIONS.map(e => (
                  <button key={e} onClick={() => { onReact(e); setShowReactions(false); }}
                    className="h-8 w-8 flex items-center justify-center hover:bg-muted rounded text-lg hover:scale-125 transition-transform">{e}</button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
});

// ── Main Chat Component ───────────────────────────────
export default function Chat() {
  const { companyId } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [unifiedConversations, setUnifiedConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [instances, setInstances] = useState<any[]>([]);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [rtStatus, setRtStatus] = useState<string>('DISCONNECTED');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedConvRef = useRef<Conversation | null>(null);
  // Track all conversation IDs for the selected phone (unified view)
  const selectedPhoneConvIdsRef = useRef<string[]>([]);

  const addDebugLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('pt-BR');
    setDebugLogs(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 100));
  }, []);

  // Keep ref in sync
  useEffect(() => { selectedConvRef.current = selectedConv; }, [selectedConv]);

  // Unify conversations by phone number (merge all instance conversations for same phone)
  useEffect(() => {
    const phoneMap = new Map<string, Conversation>();
    for (const conv of conversations) {
      const existing = phoneMap.get(conv.phone);
      if (!existing || (conv.last_message_at && (!existing.last_message_at || conv.last_message_at > existing.last_message_at))) {
        phoneMap.set(conv.phone, { ...conv, client_name: conv.client_name || existing?.client_name || null });
      }
    }
    const unified = Array.from(phoneMap.values()).sort((a, b) => {
      const ta = a.last_message_at || '';
      const tb = b.last_message_at || '';
      return tb.localeCompare(ta);
    });
    setUnifiedConversations(unified);
  }, [conversations]);

  // Load conversations
  const loadConversations = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('company_id', companyId)
      .order('last_message_at', { ascending: false })
      .limit(200);
    if (data) setConversations(data as Conversation[]);
    setLoadingConvs(false);
  }, [companyId]);

  // Load instances
  useEffect(() => {
    if (!companyId) return;
    supabase.from('whatsapp_instances').select('id, label, instance_name, phone_number, status')
      .eq('company_id', companyId).then(({ data }) => { if (data) setInstances(data); });
  }, [companyId]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Load messages for selected conversation (unified: load from ALL conversations with same phone)
  const loadMessages = useCallback(async (phone: string) => {
    if (!companyId) return;
    setLoadingMsgs(true);
    // Find all conversation IDs for this phone
    const convIds = conversations.filter(c => c.phone === phone).map(c => c.id);
    selectedPhoneConvIdsRef.current = convIds;
    
    if (convIds.length === 0) {
      setMessages([]);
      setLoadingMsgs(false);
      return;
    }

    const { data } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .in('conversation_id', convIds)
      .not('delivery_status', 'eq', 'locking')
      .not('delivery_status', 'eq', 'processing')
      .not('content', 'eq', '__DEBOUNCE_LOCK__')
      .not('content', 'eq', '__PROCESSING__')
      .order('created_at', { ascending: true })
      .limit(500);
    if (data) setMessages(data as Message[]);
    setLoadingMsgs(false);
    addDebugLog(`Carregou ${data?.length || 0} msgs de ${convIds.length} conversas (tel: ${phone})`);
  }, [companyId, conversations, addDebugLog]);

  useEffect(() => {
    if (selectedConv) loadMessages(selectedConv.phone);
  }, [selectedConv?.phone, loadMessages]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Realtime - subscribe to ALL changes then filter client-side for reliability
  useEffect(() => {
    if (!companyId) return;

    addDebugLog(`Conectando realtime... companyId: ${companyId}`);

    const channel = supabase
      .channel(`chat-messages-${companyId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'whatsapp_messages',
        filter: `company_id=eq.${companyId}`,
      }, (payload) => {
        const msg = payload.new as Message;
        addDebugLog(`INSERT msg: ${msg?.id?.slice(0,8)} dir=${msg?.direction} tipo=${msg?.message_type} status=${msg?.delivery_status} conv=${msg?.conversation_id?.slice(0,8)} content="${msg?.content?.substring(0, 40)}"`);
        if (!msg || msg.content === '__DEBOUNCE_LOCK__' || msg.content === '__PROCESSING__' || msg.delivery_status === 'locking' || msg.delivery_status === 'processing') {
          addDebugLog(`  → Ignorado (sistema interno)`);
          return;
        }

        // Add to current chat if matches any conversation of selected phone
        const convIds = selectedPhoneConvIdsRef.current;
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          if (convIds.includes(msg.conversation_id)) {
            addDebugLog(`  → Adicionada ao chat ativo ✅`);
            return [...prev, msg];
          }
          addDebugLog(`  → Conv diferente, ignorada no chat (atualiza lista)`);
          return prev;
        });
        // Always refresh conversation list (new message = updated timestamp)
        loadConversations();
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'whatsapp_messages',
        filter: `company_id=eq.${companyId}`,
      }, (payload) => {
        const msg = payload.new as Message;
        if (!msg) return;
        addDebugLog(`UPDATE msg: ${msg.id?.slice(0,8)} status=${msg.delivery_status}`);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...msg } : m));
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'whatsapp_conversations',
        filter: `company_id=eq.${companyId}`,
      }, (payload) => {
        addDebugLog(`Conv ${payload.eventType}: ${(payload.new as any)?.id?.slice(0,8) || '?'}`);
        loadConversations();
      })
      .subscribe((status) => {
        setRtStatus(status);
        addDebugLog(`Subscription: ${status}`);
      });

    return () => { supabase.removeChannel(channel); };
  }, [companyId, loadConversations, addDebugLog]);

  // Send message
  const handleSend = async () => {
    if (!messageText.trim() || !selectedConv || sending) return;
    const text = messageText.trim();
    setMessageText('');
    setSending(true);

    try {
      const { data, error } = await supabase.functions.invoke('chat-send', {
        body: {
          action: 'send-text',
          phone: selectedConv.phone,
          message: text,
          conversation_id: selectedConv.id,
          instance_id: selectedConv.instance_id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    } catch (err: any) {
      toast.error('Erro ao enviar: ' + (err.message || 'Tente novamente'));
      setMessageText(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // Send reaction
  const handleReaction = async (msg: Message, emoji: string) => {
    if (!msg.wa_message_id || !selectedConv) return;
    try {
      await supabase.functions.invoke('chat-send', {
        body: {
          action: 'send-reaction',
          phone: selectedConv.phone,
          emoji,
          wa_message_id: msg.wa_message_id,
          instance_id: selectedConv.instance_id,
        },
      });
    } catch {
      toast.error('Erro ao reagir');
    }
  };

  // Send media
  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConv) return;

    const ext = file.name.split('.').pop();
    const path = `${companyId}/${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('agent-files')
      .upload(path, file, { upsert: true });

    if (uploadErr) { toast.error('Erro no upload'); return; }

    const { data: urlData } = supabase.storage.from('agent-files').getPublicUrl(path);
    const mediaUrl = urlData.publicUrl;

    let mediaType = 'document';
    if (file.type.startsWith('image/')) mediaType = 'image';
    else if (file.type.startsWith('video/')) mediaType = 'video';
    else if (file.type.startsWith('audio/')) mediaType = 'audio';

    setSending(true);
    try {
      await supabase.functions.invoke('chat-send', {
        body: {
          action: 'send-media',
          phone: selectedConv.phone,
          media_url: mediaUrl,
          media_type: mediaType,
          caption: '',
          conversation_id: selectedConv.id,
          instance_id: selectedConv.instance_id,
        },
      });
    } catch {
      toast.error('Erro ao enviar mídia');
    } finally {
      setSending(false);
    }
    e.target.value = '';
  };

  // Handle interactive button click - send as text reply
  const handleButtonClick = (text: string) => {
    setMessageText(text);
    inputRef.current?.focus();
  };

  const selectConversation = (conv: Conversation) => {
    setSelectedConv(conv);
    setShowMobileChat(true);
  };

  // Filter conversations (use unified list)
  const filtered = unifiedConversations.filter(c => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (c.client_name?.toLowerCase().includes(q)) || c.phone.includes(q);
  });

  // Get instance label
  const getInstanceLabel = (instanceId: string | null) => {
    if (!instanceId) return null;
    const inst = instances.find(i => i.id === instanceId);
    return inst?.label || inst?.phone_number || null;
  };

  // Group messages by date
  const groupedMessages = messages.reduce<{ date: string; messages: Message[] }[]>((groups, msg) => {
    const d = parseISO(msg.created_at);
    let label: string;
    if (isToday(d)) label = 'Hoje';
    else if (isYesterday(d)) label = 'Ontem';
    else label = format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

    const last = groups[groups.length - 1];
    if (last && last.date === label) {
      last.messages.push(msg);
    } else {
      groups.push({ date: label, messages: [msg] });
    }
    return groups;
  }, []);

  // Get last message preview for conversation list
  const getLastMessagePreview = (conv: Conversation) => {
    // We don't have last message content in conversation table, just show phone
    return formatPhoneDisplay(conv.phone);
  };

  return (
    <DashboardLayout>
      {/* Full-height container that fills the entire content area */}
      <div className="h-[calc(100vh-4rem)] -m-4 lg:-m-8 flex overflow-hidden bg-background relative pb-8">
        {/* ─── Left Panel: Conversations ─── */}
        <div className={cn(
          "w-full md:w-[420px] lg:w-[380px] flex-shrink-0 flex flex-col border-r border-border/40 bg-card",
          showMobileChat && "hidden md:flex"
        )}>
          {/* Header */}
          <div className="h-[60px] flex items-center justify-between px-4 bg-muted/40 flex-shrink-0">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-muted text-muted-foreground font-bold text-sm">
                  <MessageSquare className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-base font-bold text-foreground">Conversas</h2>
                <p className="text-[11px] text-muted-foreground">{unifiedConversations.length} conversas</p>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="px-3 py-2 bg-card">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar ou começar nova conversa"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-[35px] bg-muted/50 border-0 rounded-lg text-sm"
              />
            </div>
          </div>

          {/* Conversation list */}
          <ScrollArea className="flex-1">
            {loadingConvs ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-pulse text-muted-foreground text-sm">Carregando...</div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <MessageSquare className="h-16 w-16 text-muted-foreground/20 mb-4" />
                <p className="text-sm text-muted-foreground">Nenhuma conversa encontrada</p>
              </div>
            ) : (
              <div>
                {filtered.map(conv => {
                  const isSelected = selectedConv?.id === conv.id;
                  const instLabel = getInstanceLabel(conv.instance_id);
                  return (
                    <button
                      key={conv.id}
                      onClick={() => selectConversation(conv)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/40 border-b border-border/10",
                        isSelected && "bg-muted/60"
                      )}
                    >
                      <Avatar className="h-[50px] w-[50px] flex-shrink-0">
                        <AvatarFallback className="bg-gradient-to-br from-primary/80 to-primary-glow/80 text-primary-foreground font-bold text-lg">
                          {(conv.client_name || conv.phone).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-[15px] text-foreground truncate">
                            {conv.client_name || formatPhoneDisplay(conv.phone)}
                          </p>
                          <span className="text-[11px] text-muted-foreground flex-shrink-0 ml-2">
                            {formatConvDate(conv.last_message_at)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-[13px] text-muted-foreground truncate flex-1">
                            {conv.client_name ? formatPhoneDisplay(conv.phone) : ''}
                          </p>
                          {conv.handoff_requested && (
                            <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 flex-shrink-0">Transbordo</Badge>
                          )}
                          {instLabel && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 flex-shrink-0">{instLabel}</Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* ─── Right Panel: Chat Area ─── */}
        <div className={cn(
          "flex-1 flex flex-col min-w-0",
          !showMobileChat && "hidden md:flex"
        )}>
          {!selectedConv ? (
            /* Empty state - WhatsApp Web style */
            <div className="flex-1 flex flex-col items-center justify-center bg-muted/20 border-b-[6px] border-primary/60">
              <div className="max-w-md text-center">
                <div className="h-[200px] w-[200px] mx-auto mb-8 rounded-full bg-muted/30 flex items-center justify-center">
                  <MessageSquare className="h-20 w-20 text-muted-foreground/20" />
                </div>
                <h3 className="text-[28px] font-light text-foreground mb-3">Chat WhatsApp</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Envie e receba mensagens em tempo real. Selecione uma conversa ao lado para começar.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="h-[60px] flex items-center gap-3 px-4 bg-muted/40 border-b border-border/20 flex-shrink-0">
                <button onClick={() => { setShowMobileChat(false); }} className="md:hidden text-muted-foreground hover:text-foreground mr-1">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <Avatar className="h-10 w-10 cursor-pointer">
                  <AvatarFallback className="bg-gradient-to-br from-primary/80 to-primary-glow/80 text-primary-foreground font-bold">
                    {(selectedConv.client_name || selectedConv.phone).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[15px] text-foreground truncate">
                    {selectedConv.client_name || formatPhoneDisplay(selectedConv.phone)}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {selectedConv.client_name ? formatPhoneDisplay(selectedConv.phone) : 'Online'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground">
                        <MoreVertical className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setSelectedConv(null); setShowMobileChat(false); }}>
                        Fechar conversa
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => loadMessages(selectedConv.phone)}>
                        Atualizar mensagens
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Messages area - WhatsApp-style background */}
              <div className="flex-1 overflow-y-auto py-3 chat-messages-bg">
                {loadingMsgs ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="animate-pulse text-muted-foreground text-sm">Carregando mensagens...</div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="bg-card/80 rounded-lg px-4 py-2 shadow-sm">
                      <p className="text-[13px] text-muted-foreground">🔒 Mensagens protegidas com criptografia de ponta a ponta.</p>
                    </div>
                  </div>
                ) : (
                  groupedMessages.map((group) => (
                    <div key={group.date}>
                      <div className="flex justify-center my-3">
                        <span className="text-[11px] bg-card/90 text-muted-foreground px-3 py-1 rounded-md shadow-sm font-medium">
                          {group.date}
                        </span>
                      </div>
                      {group.messages.map((msg) => (
                        <MessageBubble
                          key={msg.id}
                          message={msg}
                          onReact={(emoji) => handleReaction(msg, emoji)}
                          onButtonClick={handleButtonClick}
                        />
                      ))}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input area - WhatsApp Web style */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-t border-border/20 flex-shrink-0">
                {/* Emoji picker */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground flex-shrink-0 rounded-full">
                      <Smile className="h-6 w-6" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" side="top" align="start">
                    <div className="grid grid-cols-10 gap-1">
                      {EMOJI_LIST.map(e => (
                        <button key={e} onClick={() => setMessageText(prev => prev + e)}
                          className="h-8 w-8 flex items-center justify-center hover:bg-muted rounded text-lg">{e}</button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Attachment */}
                <label className="flex-shrink-0">
                  <input type="file" className="hidden" onChange={handleMediaUpload}
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx" />
                  <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground rounded-full" asChild>
                    <span><Paperclip className="h-6 w-6" /></span>
                  </Button>
                </label>

                {/* Text input */}
                <Input
                  ref={inputRef}
                  placeholder="Digite uma mensagem"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  className="flex-1 h-[42px] bg-card border-0 rounded-lg text-[15px] px-4 shadow-sm focus-visible:ring-0"
                  disabled={sending}
                />

                {/* Send button */}
                <Button
                  onClick={handleSend}
                  disabled={!messageText.trim() || sending}
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-muted-foreground hover:text-foreground flex-shrink-0 rounded-full"
                >
                  <Send className="h-6 w-6" />
                </Button>
              </div>
            </>
          )}
        </div>

        {/* ─── Debug Panel ─── */}
        <div className={cn(
          "absolute bottom-0 left-0 right-0 bg-card border-t border-border z-50 transition-all",
          showDebug ? "h-[200px]" : "h-8"
        )}>
          <button
            onClick={() => setShowDebug(!showDebug)}
            className={cn(
              "w-full h-8 flex items-center justify-between px-4 text-xs font-mono",
              rtStatus === 'SUBSCRIBED' ? "text-green-500" : "text-destructive"
            )}
          >
            <span>🔌 RT: {rtStatus} | Conversas: {unifiedConversations.length} (raw: {conversations.length}) | Msgs: {messages.length}</span>
            <span>{showDebug ? '▼ Fechar Debug' : '▲ Abrir Debug'}</span>
          </button>
          {showDebug && (
            <ScrollArea className="h-[168px] px-4 py-1">
              <div className="space-y-0.5 font-mono text-[11px] text-muted-foreground">
                {debugLogs.map((log, i) => (
                  <div key={i} className={cn(
                    log.includes('✅') ? 'text-green-500' : log.includes('Ignorado') ? 'text-yellow-500' : ''
                  )}>{log}</div>
                ))}
                {debugLogs.length === 0 && <div className="text-muted-foreground/50">Aguardando eventos...</div>}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
