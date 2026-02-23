import { useState, useEffect, useRef, useCallback } from 'react';
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
  Search, Send, Paperclip, Smile, Image as ImageIcon,
  Phone, MoreVertical, Check, CheckCheck, Clock, X,
  MessageSquare, ArrowLeft, Mic, FileText, Video,
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
}

const EMOJI_LIST = ['😀','😂','❤️','👍','👋','🔥','🎉','😢','😮','🙏','✅','❌','👏','💪','🤔','😎','🥰','😡','💯','⭐'];

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

function DeliveryIcon({ status }: { status: string | null }) {
  if (!status || status === 'pending') return <Clock className="h-3 w-3 text-muted-foreground/50" />;
  if (status === 'sent') return <Check className="h-3 w-3 text-muted-foreground/60" />;
  if (status === 'delivered') return <CheckCheck className="h-3 w-3 text-muted-foreground/60" />;
  if (status === 'read') return <CheckCheck className="h-3 w-3 text-accent-foreground" />;
  if (status === 'error' || status === 'failed') return <X className="h-3 w-3 text-destructive" />;
  return null;
}

export default function Chat() {
  const { companyId } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [instances, setInstances] = useState<any[]>([]);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load conversations
  const loadConversations = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('company_id', companyId)
      .order('last_message_at', { ascending: false })
      .limit(100);
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

  // Load messages for selected conversation
  const loadMessages = useCallback(async (convId: string) => {
    setLoadingMsgs(true);
    const { data } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('conversation_id', convId)
      .not('delivery_status', 'eq', 'locking')
      .not('content', 'eq', '__DEBOUNCE_LOCK__')
      .not('content', 'eq', '__PROCESSING__')
      .order('created_at', { ascending: true })
      .limit(500);
    if (data) setMessages(data as Message[]);
    setLoadingMsgs(false);
  }, []);

  useEffect(() => {
    if (selectedConv) loadMessages(selectedConv.id);
  }, [selectedConv, loadMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Realtime subscriptions
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel('chat-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages', filter: `company_id=eq.${companyId}` }, (payload) => {
        const msg = payload.new as Message;
        if (!msg || msg.content === '__DEBOUNCE_LOCK__' || msg.content === '__PROCESSING__' || msg.delivery_status === 'locking') return;

        if (payload.eventType === 'INSERT') {
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            if (msg.conversation_id === selectedConv?.id) return [...prev, msg];
            return prev;
          });
          // Update conversation list
          loadConversations();
        } else if (payload.eventType === 'UPDATE') {
          setMessages(prev => prev.map(m => m.id === msg.id ? msg : m));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations', filter: `company_id=eq.${companyId}` }, () => {
        loadConversations();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [companyId, selectedConv?.id, loadConversations]);

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
      toast.success('Reação enviada');
    } catch {
      toast.error('Erro ao reagir');
    }
  };

  // Send media
  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConv) return;

    // Upload to storage first
    const ext = file.name.split('.').pop();
    const path = `${companyId}/${Date.now()}.${ext}`;
    const { data: uploadData, error: uploadErr } = await supabase.storage
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

  const selectConversation = (conv: Conversation) => {
    setSelectedConv(conv);
    setShowMobileChat(true);
  };

  // Filter conversations
  const filtered = conversations.filter(c => {
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

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-8rem)] flex rounded-2xl overflow-hidden border border-border/60 bg-card shadow-lg">
        {/* Sidebar - Conversations list */}
        <div className={cn(
          "w-full md:w-[380px] flex-shrink-0 flex flex-col border-r border-border/40 bg-card",
          showMobileChat && "hidden md:flex"
        )}>
          {/* Header */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-border/40 bg-muted/30">
            <h2 className="text-lg font-bold text-foreground">Conversas</h2>
            <Badge variant="secondary" className="text-xs">{conversations.length}</Badge>
          </div>

          {/* Search */}
          <div className="p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar conversas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 bg-muted/50 border-0"
              />
            </div>
          </div>

          {/* Conversation list */}
          <ScrollArea className="flex-1">
            {loadingConvs ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-pulse text-muted-foreground text-sm">Carregando...</div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Nenhuma conversa encontrada</p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {filtered.map(conv => {
                  const isSelected = selectedConv?.id === conv.id;
                  const instLabel = getInstanceLabel(conv.instance_id);
                  return (
                    <button
                      key={conv.id}
                      onClick={() => selectConversation(conv)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                        isSelected && "bg-primary/5 border-l-2 border-l-primary"
                      )}
                    >
                      <Avatar className="h-12 w-12 flex-shrink-0">
                        <AvatarFallback className="bg-gradient-to-br from-primary to-primary-glow text-primary-foreground font-bold">
                          {(conv.client_name || conv.phone).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-sm text-foreground truncate">
                            {conv.client_name || formatPhoneDisplay(conv.phone)}
                          </p>
                          <span className="text-[11px] text-muted-foreground flex-shrink-0 ml-2">
                            {formatConvDate(conv.last_message_at)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-xs text-muted-foreground truncate">
                            {formatPhoneDisplay(conv.phone)}
                          </p>
                          {conv.handoff_requested && (
                            <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">Transbordo</Badge>
                          )}
                          {instLabel && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{instLabel}</Badge>
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

        {/* Chat area */}
        <div className={cn(
          "flex-1 flex flex-col bg-background",
          !showMobileChat && "hidden md:flex"
        )}>
          {!selectedConv ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div className="h-24 w-24 rounded-full bg-muted/50 flex items-center justify-center mb-6">
                <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Chat WhatsApp</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Selecione uma conversa para visualizar e enviar mensagens em tempo real.
              </p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="h-16 flex items-center gap-3 px-4 border-b border-border/40 bg-muted/30 flex-shrink-0">
                <button onClick={() => setShowMobileChat(false)} className="md:hidden text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-gradient-to-br from-primary to-primary-glow text-primary-foreground font-bold">
                    {(selectedConv.client_name || selectedConv.phone).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">
                    {selectedConv.client_name || formatPhoneDisplay(selectedConv.phone)}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatPhoneDisplay(selectedConv.phone)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setSelectedConv(null); setShowMobileChat(false); }}>
                        Fechar conversa
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 chat-messages-bg">
                {loadingMsgs ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-pulse text-muted-foreground text-sm">Carregando mensagens...</div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <p className="text-sm text-muted-foreground">Nenhuma mensagem nesta conversa</p>
                  </div>
                ) : (
                  groupedMessages.map((group) => (
                    <div key={group.date}>
                      <div className="flex justify-center my-3">
                        <span className="text-[11px] bg-muted/80 text-muted-foreground px-3 py-1 rounded-lg shadow-sm">
                          {group.date}
                        </span>
                      </div>
                      {group.messages.map((msg) => (
                        <MessageBubble
                          key={msg.id}
                          message={msg}
                          onReact={(emoji) => handleReaction(msg, emoji)}
                        />
                      ))}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              <div className="flex items-center gap-2 px-4 py-3 border-t border-border/40 bg-muted/30 flex-shrink-0">
                {/* Emoji picker */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground flex-shrink-0">
                      <Smile className="h-5 w-5" />
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
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" asChild>
                    <span><Paperclip className="h-5 w-5" /></span>
                  </Button>
                </label>

                {/* Text input */}
                <Input
                  ref={inputRef}
                  placeholder="Digite uma mensagem..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  className="flex-1 h-10 bg-background border-border/60 rounded-xl"
                  disabled={sending}
                />

                {/* Send button */}
                <Button
                  onClick={handleSend}
                  disabled={!messageText.trim() || sending}
                  size="icon"
                  className="h-10 w-10 rounded-xl flex-shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function MessageBubble({ message, onReact }: { message: Message; onReact: (emoji: string) => void }) {
  const isOutgoing = message.direction === 'outgoing';
  const [showReactions, setShowReactions] = useState(false);

  const renderContent = () => {
    if (message.message_type === 'image' && message.media_url) {
      return (
        <div>
          <img src={message.media_url} alt="" className="max-w-[280px] rounded-lg mb-1" loading="lazy" />
          {message.content && <p className="text-sm whitespace-pre-wrap">{message.content}</p>}
        </div>
      );
    }
    if (message.message_type === 'video' && message.media_url) {
      return (
        <div>
          <video src={message.media_url} controls className="max-w-[280px] rounded-lg mb-1" />
          {message.content && <p className="text-sm whitespace-pre-wrap">{message.content}</p>}
        </div>
      );
    }
    if (message.message_type === 'audio' && message.media_url) {
      return <audio src={message.media_url} controls className="max-w-[260px]" />;
    }
    if (message.message_type === 'document' && message.media_url) {
      return (
        <a href={message.media_url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 p-2 bg-background/50 rounded-lg hover:bg-background/80 transition-colors">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">Documento</p>
            <p className="text-xs text-muted-foreground">Clique para abrir</p>
          </div>
        </a>
      );
    }
    return <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>;
  };

  return (
    <div className={cn("flex mb-1 group", isOutgoing ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[75%] md:max-w-[65%] px-3 py-2 rounded-2xl shadow-sm",
          isOutgoing
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-card text-foreground border border-border/40 rounded-bl-md"
        )}
        onDoubleClick={() => setShowReactions(!showReactions)}
      >
        {renderContent()}
        <div className={cn(
          "flex items-center justify-end gap-1 mt-1",
          isOutgoing ? "text-primary-foreground/70" : "text-muted-foreground"
        )}>
          <span className="text-[10px]">{formatMsgTime(message.created_at)}</span>
          {isOutgoing && <DeliveryIcon status={message.delivery_status} />}
        </div>

        {/* Reaction button on hover */}
        <Popover open={showReactions} onOpenChange={setShowReactions}>
          <PopoverTrigger asChild>
            <button className={cn(
              "absolute -bottom-3 opacity-0 group-hover:opacity-100 transition-opacity bg-card border border-border/60 rounded-full p-1 shadow-md",
              isOutgoing ? "left-0" : "right-0"
            )}>
              <Smile className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-1.5" side="top">
            <div className="flex gap-0.5">
              {['👍','❤️','😂','😮','😢','🙏'].map(e => (
                <button key={e} onClick={() => { onReact(e); setShowReactions(false); }}
                  className="h-8 w-8 flex items-center justify-center hover:bg-muted rounded text-lg hover:scale-125 transition-transform">{e}</button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
