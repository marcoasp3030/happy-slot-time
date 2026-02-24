import { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
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
  FileText, Download, ExternalLink, Tag, Plus, ChevronUp, ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
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
  company_id?: string;
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

interface ReplyTo {
  id: string;
  content: string | null;
  direction: string;
  message_type: string;
}

interface LastMsgPreview {
  content: string;
  direction: string;
  message_type: string;
  created_at: string;
}

interface ContactTag {
  id: string;
  phone: string;
  tag: string;
  name: string | null;
}

// ── Helpers ────────────────────────────────────────────
const EMOJI_LIST = ['😀','😂','❤️','👍','👋','🔥','🎉','😢','😮','🙏','✅','❌','👏','💪','🤔','😎','🥰','😡','💯','⭐'];
const QUICK_REACTIONS = ['👍','❤️','😂','😮','😢','🙏'];

const TAG_COLORS: Record<string, string> = {
  'urgente': 'bg-destructive/20 text-destructive border-destructive/30',
  'aguardando': 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30',
  'resolvido': 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30',
  'vip': 'bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30',
  'novo': 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30',
  'follow-up': 'bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30',
};

function getTagClasses(tag: string) {
  return TAG_COLORS[tag.toLowerCase()] || 'bg-muted text-muted-foreground border-border';
}

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

function getMessagePreviewText(msg: LastMsgPreview | undefined): string {
  if (!msg) return '';
  const prefix = msg.direction === 'outgoing' ? '✓ ' : '';
  switch (msg.message_type) {
    case 'image': return prefix + '📷 Foto';
    case 'video': return prefix + '🎥 Vídeo';
    case 'audio': return prefix + '🎵 Áudio';
    case 'document': return prefix + '📄 Documento';
    case 'sticker': return prefix + '🎭 Figurinha';
    default: return prefix + (msg.content?.substring(0, 60) || '');
  }
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
  let meta = metadata;
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta); } catch { return null; }
  }
  const buttons = meta?.buttons || meta?.choices;
  if (buttons && Array.isArray(buttons) && buttons.length > 0) {
    return (
      <div className="flex flex-col gap-1 mt-2 border-t border-border/20 pt-2">
        {buttons.map((btn: any, i: number) => {
          const label = typeof btn === 'string'
            ? btn.split('|')[0]
            : btn?.text || btn?.title || btn?.displayText || btn?.buttonText || String(btn);
          return (
            <button key={i} onClick={() => onButtonClick?.(label)}
              className="w-full text-center py-2 px-3 text-sm font-medium text-accent-foreground bg-accent/30 hover:bg-accent/50 rounded-lg transition-colors border border-border/20">
              {label}
            </button>
          );
        })}
      </div>
    );
  }
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
              <button key={ri} onClick={() => onButtonClick?.(row.title || row.description)}
                className="w-full text-left py-1.5 px-3 text-sm hover:bg-accent/30 rounded-md transition-colors">
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
  message, onReact, onButtonClick, onReply, allMessages, highlightText,
}: {
  message: Message;
  onReact: (emoji: string) => void;
  onButtonClick?: (text: string) => void;
  onReply?: (msg: Message) => void;
  allMessages?: Message[];
  highlightText?: string;
}) {
  const isOutgoing = message.direction === 'outgoing';
  const [showReactions, setShowReactions] = useState(false);

  const quotedMsg = (() => {
    if (!message.metadata) return null;
    let meta = message.metadata;
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { return null; } }
    const quotedId = meta?.quoted_message_id || meta?.contextInfo?.stanzaId;
    if (quotedId && allMessages) {
      return allMessages.find(m => m.wa_message_id === quotedId || m.id === quotedId);
    }
    return null;
  })();

  const renderHighlightedText = (text: string) => {
    if (!highlightText || !text) return text;
    const idx = text.toLowerCase().indexOf(highlightText.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-amber-300/60 dark:bg-amber-500/40 text-inherit rounded-sm px-0.5">{text.slice(idx, idx + highlightText.length)}</mark>
        {text.slice(idx + highlightText.length)}
      </>
    );
  };

  const renderContent = () => {
    if (message.message_type === 'image' && message.media_url) {
      return (
        <div>
          <img src={message.media_url} alt="" className="max-w-full rounded-lg mb-1 cursor-pointer" loading="lazy"
            onClick={() => window.open(message.media_url!, '_blank')} />
          {message.content && <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{renderHighlightedText(message.content)}</p>}
        </div>
      );
    }
    if (message.message_type === 'video' && message.media_url) {
      return (
        <div>
          <video src={message.media_url} controls className="max-w-full rounded-lg mb-1" />
          {message.content && <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{renderHighlightedText(message.content)}</p>}
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
    return <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{renderHighlightedText(message.content || '')}</p>;
  };

  const bubbleWidth = (message.message_type === 'audio' || message.message_type === 'document') ? 'min-w-[250px]' : '';

  return (
    <div id={`msg-${message.id}`} className={cn("flex mb-1 px-[6%] group", isOutgoing ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[60%] px-2.5 py-1.5 shadow-sm",
          bubbleWidth,
          isOutgoing
            ? "bg-wa-outgoing text-white rounded-lg rounded-tr-none"
            : "bg-card text-foreground rounded-lg rounded-tl-none border border-border/20"
        )}
      >
        {quotedMsg && (
          <div className={cn(
            "rounded-md px-2.5 py-1.5 mb-1.5 border-l-[3px] cursor-pointer",
            isOutgoing ? "bg-white/10 border-white/50" : "bg-muted/60 border-primary/60"
          )}>
            <p className={cn("text-[10px] font-semibold", isOutgoing ? "text-white/70" : "text-primary")}>
              {quotedMsg.direction === 'incoming' ? 'Cliente' : 'Você'}
            </p>
            <p className={cn("text-[11px] truncate", isOutgoing ? "text-white/60" : "text-muted-foreground")}>
              {quotedMsg.message_type !== 'text' ? `📎 ${quotedMsg.message_type}` : (quotedMsg.content?.substring(0, 80) || '')}
            </p>
          </div>
        )}

        {renderContent()}
        <InteractiveButtons metadata={message.metadata} onButtonClick={onButtonClick} />

        <div className={cn(
          "flex items-center justify-end gap-1 mt-0.5 -mb-0.5",
          isOutgoing ? "text-white/60" : "text-muted-foreground"
        )}>
          <span className="text-[10px]">{formatMsgTime(message.created_at)}</span>
          {isOutgoing && <DeliveryIcon status={message.delivery_status} />}
        </div>

        <div className={cn(
          "absolute -bottom-3 opacity-0 group-hover:opacity-100 transition-all z-10 flex gap-1",
          isOutgoing ? "left-0" : "right-0"
        )}>
          {onReply && (
            <button onClick={() => onReply(message)}
              className="bg-card border border-border/60 rounded-full p-1 shadow-md hover:shadow-lg transition-shadow" title="Responder">
              <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground rotate-[225deg]" />
            </button>
          )}
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
  const selectedPhoneConvIdsRef = useRef<string[]>([]);
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [hasOlderMsgs, setHasOlderMsgs] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Last message preview per phone
  const [lastMsgPreviews, setLastMsgPreviews] = useState<Record<string, LastMsgPreview>>({});
  // Message search within conversation
  const [msgSearchQuery, setMsgSearchQuery] = useState('');
  const [msgSearchResults, setMsgSearchResults] = useState<string[]>([]);
  const [msgSearchIdx, setMsgSearchIdx] = useState(0);
  const [showMsgSearch, setShowMsgSearch] = useState(false);
  // Tags
  const [contactTags, setContactTags] = useState<ContactTag[]>([]);
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [tagDialogPhone, setTagDialogPhone] = useState('');

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

  // Load last message previews for all conversations
  const loadLastMsgPreviews = useCallback(async (convIds: string[]) => {
    if (convIds.length === 0) return;
    // Get the latest message per conversation_id using a single query
    // We'll fetch the latest message for each conv and build a phone->preview map
    const { data } = await supabase
      .from('whatsapp_messages')
      .select('conversation_id, content, direction, message_type, created_at')
      .in('conversation_id', convIds)
      .not('content', 'eq', '__DEBOUNCE_LOCK__')
      .not('content', 'eq', '__PROCESSING__')
      .not('delivery_status', 'eq', 'locking')
      .not('delivery_status', 'eq', 'processing')
      .order('created_at', { ascending: false })
      .limit(400);

    if (!data) return;

    // Group by conversation_id, take first (most recent) per conv
    const convMsgMap = new Map<string, typeof data[0]>();
    for (const msg of data) {
      if (!convMsgMap.has(msg.conversation_id)) {
        convMsgMap.set(msg.conversation_id, msg);
      }
    }

    // Map conv_id -> phone using conversations
    const previews: Record<string, LastMsgPreview> = {};
    for (const [convId, msg] of convMsgMap) {
      const conv = conversations.find(c => c.id === convId);
      if (conv) {
        const existing = previews[conv.phone];
        if (!existing || msg.created_at > existing.created_at) {
          previews[conv.phone] = {
            content: msg.content || '',
            direction: msg.direction,
            message_type: msg.message_type,
            created_at: msg.created_at,
          };
        }
      }
    }
    setLastMsgPreviews(prev => ({ ...prev, ...previews }));
  }, [conversations]);

  // Load tags
  const loadContactTags = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('contact_tags')
      .select('id, phone, tag, name')
      .eq('company_id', companyId);
    if (data) setContactTags(data as ContactTag[]);
  }, [companyId]);

  // Load instances
  useEffect(() => {
    if (!companyId) return;
    supabase.from('whatsapp_instances').select('id, label, instance_name, phone_number, status')
      .eq('company_id', companyId).then(({ data }) => { if (data) setInstances(data); });
  }, [companyId]);

  useEffect(() => { loadConversations(); loadContactTags(); }, [loadConversations, loadContactTags]);

  // Load previews when conversations change
  useEffect(() => {
    if (conversations.length > 0) {
      loadLastMsgPreviews(conversations.map(c => c.id));
    }
  }, [conversations.length]); // Only re-run when count changes, not every update

  // Ref to always have fresh conversations without causing loadMessages to re-create
  const conversationsRef = useRef<Conversation[]>([]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  // Load messages for selected conversation (unified: load from ALL conversations with same phone)
  const loadMessages = useCallback(async (phone: string, olderThan?: string) => {
    if (!companyId) return;
    if (!olderThan) setLoadingMsgs(true);
    else setLoadingOlder(true);

    const convIds = conversationsRef.current.filter(c => c.phone === phone).map(c => c.id);
    selectedPhoneConvIdsRef.current = convIds;
    
    if (convIds.length === 0) {
      setMessages([]);
      setLoadingMsgs(false);
      setLoadingOlder(false);
      return;
    }

    let query = supabase
      .from('whatsapp_messages')
      .select('*')
      .in('conversation_id', convIds)
      .not('delivery_status', 'eq', 'locking')
      .not('delivery_status', 'eq', 'processing')
      .not('content', 'eq', '__DEBOUNCE_LOCK__')
      .not('content', 'eq', '__PROCESSING__');

    if (olderThan) {
      query = query.lt('created_at', olderThan).order('created_at', { ascending: false }).limit(50);
    } else {
      query = query.order('created_at', { ascending: true }).limit(100);
    }

    const { data } = await query;

    if (olderThan) {
      if (data && data.length > 0) {
        const sorted = data.reverse();
        setMessages(prev => [...sorted as Message[], ...prev]);
        setHasOlderMsgs(data.length >= 50);
      } else {
        setHasOlderMsgs(false);
      }
      setLoadingOlder(false);
    } else {
      if (data) {
        setMessages(data as Message[]);
        setHasOlderMsgs(data.length >= 100);
      }
      setLoadingMsgs(false);
    }
    addDebugLog(`Carregou ${data?.length || 0} msgs de ${convIds.length} conversas (tel: ${phone})${olderThan ? ' [older]' : ''}`);
  }, [companyId, addDebugLog]);

  // Only reload messages when user explicitly switches conversation
  useEffect(() => {
    if (selectedConv) loadMessages(selectedConv.phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConv?.phone]);

  // Keep convIds ref updated when conversations change (e.g. new conv for same phone)
  useEffect(() => {
    if (selectedConv) {
      selectedPhoneConvIdsRef.current = conversations.filter(c => c.phone === selectedConv.phone).map(c => c.id);
    }
  }, [conversations, selectedConv?.phone]);

  // Ref for the scrollable messages container
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);
  const prevMsgCount = useRef(0);

  // Scroll to bottom - instant on first load, smooth only for new incoming messages when near bottom
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || !messages.length) return;

    if (isFirstLoad.current) {
      container.scrollTop = container.scrollHeight;
      isFirstLoad.current = false;
    } else if (messages.length > prevMsgCount.current) {
      const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distFromBottom < 200) {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
        });
      }
    }
    prevMsgCount.current = messages.length;
  }, [messages]);

  // Reset first load flag when switching conversations
  useEffect(() => {
    isFirstLoad.current = true;
    prevMsgCount.current = 0;
    setHasOlderMsgs(true);
    setReplyTo(null);
    setShowMsgSearch(false);
    setMsgSearchQuery('');
    setMsgSearchResults([]);
  }, [selectedConv?.phone]);

  // Scroll to top → load older messages
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      if (container.scrollTop < 60 && hasOlderMsgs && !loadingOlder && messages.length > 0 && selectedConvRef.current) {
        const oldestMsg = messages[0];
        if (oldestMsg) {
          const prevHeight = container.scrollHeight;
          loadMessages(selectedConvRef.current.phone, oldestMsg.created_at).then(() => {
            requestAnimationFrame(() => {
              container.scrollTop = container.scrollHeight - prevHeight;
            });
          });
        }
      }
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasOlderMsgs, loadingOlder, messages, loadMessages]);

  // Message search within conversation
  useEffect(() => {
    if (!msgSearchQuery.trim()) {
      setMsgSearchResults([]);
      setMsgSearchIdx(0);
      return;
    }
    const q = msgSearchQuery.toLowerCase();
    const results = messages
      .filter(m => m.content?.toLowerCase().includes(q))
      .map(m => m.id);
    setMsgSearchResults(results);
    setMsgSearchIdx(results.length > 0 ? results.length - 1 : 0);
    // Scroll to last (most recent) result
    if (results.length > 0) {
      const el = document.getElementById(`msg-${results[results.length - 1]}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [msgSearchQuery, messages]);

  const navigateSearchResult = (direction: 'up' | 'down') => {
    if (msgSearchResults.length === 0) return;
    let newIdx = direction === 'up' ? msgSearchIdx - 1 : msgSearchIdx + 1;
    if (newIdx < 0) newIdx = msgSearchResults.length - 1;
    if (newIdx >= msgSearchResults.length) newIdx = 0;
    setMsgSearchIdx(newIdx);
    const el = document.getElementById(`msg-${msgSearchResults[newIdx]}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Realtime - single stable connection
  useEffect(() => {
    if (!companyId) return;

    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout>;
    let channelRef: ReturnType<typeof supabase.channel> | null = null;

    const connect = () => {
      if (cancelled) return;
      addDebugLog(`Conectando realtime... companyId: ${companyId}`);

      const channel = supabase
        .channel(`chat-rt-${companyId}-${Date.now()}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'whatsapp_messages',
        }, (payload) => {
          const msg = payload.new as Message;
          if (!msg || msg.company_id !== companyId) return;
          addDebugLog(`INSERT msg: ${msg?.id?.slice(0,8)} dir=${msg?.direction} status=${msg?.delivery_status} content="${msg?.content?.substring(0, 30)}"`);
          if (msg.content === '__DEBOUNCE_LOCK__' || msg.content === '__PROCESSING__' || msg.delivery_status === 'locking' || msg.delivery_status === 'processing') {
            return;
          }
          const convIds = selectedPhoneConvIdsRef.current;
          const activePhone = selectedConvRef.current?.phone;
          const isForActiveChat = convIds.includes(msg.conversation_id);

          // Add message to active chat
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id || m.wa_message_id === msg.wa_message_id && msg.wa_message_id)) return prev;
            // Replace optimistic message if this is the server version
            const optimisticIdx = isForActiveChat && msg.direction === 'outgoing'
              ? prev.findIndex(m => m.id.startsWith('opt-') && m.content === msg.content)
              : -1;
            if (optimisticIdx >= 0) {
              const updated = [...prev];
              updated[optimisticIdx] = msg;
              return updated;
            }
            if (isForActiveChat) {
              addDebugLog(`  → Adicionada ao chat ativo ✅`);
              return [...prev, msg];
            }
            return prev;
          });

          // Update last message preview
          const conv = conversationsRef.current.find(c => c.id === msg.conversation_id);
          if (conv) {
            setLastMsgPreviews(prev => ({
              ...prev,
              [conv.phone]: {
                content: msg.content || '',
                direction: msg.direction,
                message_type: msg.message_type,
                created_at: msg.created_at,
              },
            }));
          }

          // Update conversations list locally: move to top + update last_message_at
          setConversations(prev => {
            const updated = prev.map(c =>
              c.id === msg.conversation_id
                ? { ...c, last_message_at: msg.created_at }
                : c
            );
            if (!updated.some(c => c.id === msg.conversation_id)) {
              loadConversations();
              return prev;
            }
            return updated;
          });

          // Increment unread count for non-active conversations (incoming only)
          if (msg.direction === 'incoming') {
            const msgPhone = conv?.phone;
            if (msgPhone && msgPhone !== activePhone) {
              setUnreadCounts(prev => ({ ...prev, [msgPhone]: (prev[msgPhone] || 0) + 1 }));
              addDebugLog(`  → Unread +1 para ${msgPhone}`);
            }
          }
        })
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'whatsapp_messages',
        }, (payload) => {
          const msg = payload.new as Message;
          if (!msg || msg.company_id !== companyId) return;
          setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...msg } : m));
        })
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'whatsapp_conversations',
        }, (payload) => {
          const conv = payload.new as Conversation;
          if (conv?.company_id !== companyId) return;
          addDebugLog(`Nova conversa: ${conv?.phone}`);
          setConversations(prev => {
            if (prev.some(c => c.id === conv.id)) return prev;
            return [conv, ...prev];
          });
        })
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'whatsapp_conversations',
        }, (payload) => {
          const conv = payload.new as Conversation;
          if (conv?.company_id !== companyId) return;
          setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, ...conv } : c));
        })
        .subscribe((status) => {
          setRtStatus(status);
          addDebugLog(`Subscription: ${status}`);
          if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
            addDebugLog('Reconectando em 5s...');
            supabase.removeChannel(channel);
            retryTimeout = setTimeout(connect, 5000);
          }
        });

      channelRef = channel;
    };

    connect();

    const pollInterval = setInterval(() => {
      loadConversations();
    }, 30000);

    return () => {
      cancelled = true;
      clearTimeout(retryTimeout);
      clearInterval(pollInterval);
      if (channelRef) supabase.removeChannel(channelRef);
    };
  }, [companyId, loadConversations, addDebugLog]);

  // Send message
  const handleSend = async () => {
    if (!messageText.trim() || !selectedConv || sending) return;
    const text = messageText.trim();
    const currentReply = replyTo;
    setMessageText('');
    setReplyTo(null);
    setSending(true);

    // Optimistic: add message to UI immediately
    const optimisticId = `opt-${Date.now()}`;
    const optimisticMsg: Message = {
      id: optimisticId,
      conversation_id: selectedConv.id,
      direction: 'outgoing',
      message_type: 'text',
      content: text,
      media_url: null,
      metadata: null,
      created_at: new Date().toISOString(),
      delivery_status: 'pending',
      wa_message_id: null,
      company_id: companyId!,
    };
    setMessages(prev => [...prev, optimisticMsg]);

    // Update preview & conversation order instantly
    setLastMsgPreviews(prev => ({
      ...prev,
      [selectedConv.phone]: { content: text, direction: 'outgoing', message_type: 'text', created_at: optimisticMsg.created_at },
    }));
    setConversations(prev => prev.map(c =>
      c.id === selectedConv.id ? { ...c, last_message_at: optimisticMsg.created_at } : c
    ));

    try {
      const body: any = {
        action: 'send-text',
        phone: selectedConv.phone,
        message: text,
        conversation_id: selectedConv.id,
        instance_id: selectedConv.instance_id,
      };
      if (currentReply) {
        const originalMsg = messages.find(m => m.id === currentReply.id);
        if (originalMsg?.wa_message_id) {
          body.quoted_message_id = originalMsg.wa_message_id;
        }
      }
      const { data, error } = await supabase.functions.invoke('chat-send', { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Replace optimistic msg with real msg from server
      if (data?.message) {
        setMessages(prev => prev.map(m => m.id === optimisticId ? { ...data.message } : m));
      }
    } catch (err: any) {
      toast.error('Erro ao enviar: ' + (err.message || 'Tente novamente'));
      // Remove optimistic message on failure
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
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

  const handleButtonClick = (text: string) => {
    setMessageText(text);
    inputRef.current?.focus();
  };

  const selectConversation = (conv: Conversation) => {
    setSelectedConv(conv);
    setShowMobileChat(true);
    setUnreadCounts(prev => {
      const next = { ...prev };
      delete next[conv.phone];
      return next;
    });
  };

  // Tag management
  const getTagsForPhone = (phone: string) => contactTags.filter(t => t.phone === phone);

  const addTag = async (phone: string, tag: string) => {
    if (!companyId || !tag.trim()) return;
    const conv = unifiedConversations.find(c => c.phone === phone);
    const { error } = await supabase.from('contact_tags').insert({
      company_id: companyId,
      phone,
      tag: tag.trim().toLowerCase(),
      name: conv?.client_name || null,
    });
    if (error) {
      toast.error('Erro ao adicionar etiqueta');
    } else {
      loadContactTags();
      toast.success('Etiqueta adicionada');
    }
  };

  const removeTag = async (tagId: string) => {
    const { error } = await supabase.from('contact_tags').delete().eq('id', tagId);
    if (error) {
      toast.error('Erro ao remover etiqueta');
    } else {
      loadContactTags();
    }
  };

  // Filter conversations (use unified list)
  const filtered = unifiedConversations.filter(c => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (c.client_name?.toLowerCase().includes(q)) || c.phone.includes(q);
  });

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

  // Suggested tags for quick add
  const suggestedTags = useMemo(() => {
    const all = new Set(contactTags.map(t => t.tag));
    ['urgente', 'aguardando', 'resolvido', 'vip', 'novo', 'follow-up'].forEach(t => all.add(t));
    return Array.from(all);
  }, [contactTags]);

  return (
    <DashboardLayout>
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
                  const preview = lastMsgPreviews[conv.phone];
                  const tags = getTagsForPhone(conv.phone);
                  const hasUnread = !!unreadCounts[conv.phone];
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
                          <p className={cn("text-[15px] truncate", hasUnread ? "font-bold text-foreground" : "font-medium text-foreground")}>
                            {conv.client_name || formatPhoneDisplay(conv.phone)}
                          </p>
                          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                            {hasUnread && (
                              <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-bold px-1.5">
                                {unreadCounts[conv.phone]}
                              </span>
                            )}
                            <span className={cn("text-[11px] flex-shrink-0", hasUnread ? "text-primary font-semibold" : "text-muted-foreground")}>
                              {formatConvDate(conv.last_message_at)}
                            </span>
                          </div>
                        </div>
                        {/* Last message preview */}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className={cn("text-[13px] truncate flex-1", hasUnread ? "text-foreground font-medium" : "text-muted-foreground")}>
                            {preview ? getMessagePreviewText(preview) : (conv.client_name ? formatPhoneDisplay(conv.phone) : '')}
                          </p>
                          {conv.handoff_requested && (
                            <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 flex-shrink-0">Transbordo</Badge>
                          )}
                          {instLabel && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 flex-shrink-0">{instLabel}</Badge>
                          )}
                        </div>
                        {/* Tags */}
                        {tags.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {tags.slice(0, 3).map(t => (
                              <span key={t.id} className={cn("text-[9px] px-1.5 py-0.5 rounded-full border font-medium", getTagClasses(t.tag))}>
                                {t.tag}
                              </span>
                            ))}
                            {tags.length > 3 && (
                              <span className="text-[9px] text-muted-foreground">+{tags.length - 3}</span>
                            )}
                          </div>
                        )}
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
                  <div className="flex items-center gap-1.5">
                    <p className="text-[12px] text-muted-foreground">
                      {selectedConv.client_name ? formatPhoneDisplay(selectedConv.phone) : 'Online'}
                    </p>
                    {/* Tags in header */}
                    {getTagsForPhone(selectedConv.phone).map(t => (
                      <span key={t.id} className={cn("text-[9px] px-1.5 py-0 rounded-full border font-medium", getTagClasses(t.tag))}>
                        {t.tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {/* Search in messages */}
                  <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground"
                    onClick={() => { setShowMsgSearch(!showMsgSearch); if (showMsgSearch) { setMsgSearchQuery(''); setMsgSearchResults([]); } }}>
                    <Search className="h-5 w-5" />
                  </Button>
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
                      <DropdownMenuItem onClick={() => { setTagDialogPhone(selectedConv.phone); setShowTagDialog(true); }}>
                        <Tag className="h-4 w-4 mr-2" /> Gerenciar etiquetas
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Search bar within messages */}
              {showMsgSearch && (
                <div className="flex items-center gap-2 px-4 py-2 bg-card border-b border-border/20 flex-shrink-0">
                  <Input
                    placeholder="Pesquisar mensagens..."
                    value={msgSearchQuery}
                    onChange={(e) => setMsgSearchQuery(e.target.value)}
                    className="flex-1 h-8 text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') navigateSearchResult(e.shiftKey ? 'up' : 'down');
                      if (e.key === 'Escape') { setShowMsgSearch(false); setMsgSearchQuery(''); setMsgSearchResults([]); }
                    }}
                  />
                  {msgSearchResults.length > 0 && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {msgSearchIdx + 1}/{msgSearchResults.length}
                    </span>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateSearchResult('up')}>
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateSearchResult('down')}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => { setShowMsgSearch(false); setMsgSearchQuery(''); setMsgSearchResults([]); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Messages area */}
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto py-3 chat-messages-bg">
                {loadingOlder && (
                  <div className="flex justify-center py-3">
                    <div className="animate-pulse text-muted-foreground text-xs bg-card/80 px-3 py-1 rounded-full shadow-sm">Carregando anteriores...</div>
                  </div>
                )}
                {!loadingOlder && hasOlderMsgs && messages.length > 0 && (
                  <div className="flex justify-center py-2">
                    <button
                      onClick={() => selectedConv && messages[0] && loadMessages(selectedConv.phone, messages[0].created_at)}
                      className="text-xs text-primary hover:underline"
                    >
                      ↑ Carregar mensagens anteriores
                    </button>
                  </div>
                )}
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
                          onReply={(m) => setReplyTo({ id: m.id, content: m.content, direction: m.direction, message_type: m.message_type })}
                          allMessages={messages}
                          highlightText={msgSearchQuery.trim() && msgSearchResults.includes(msg.id) ? msgSearchQuery : undefined}
                        />
                      ))}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply preview bar */}
              {replyTo && (
                <div className="flex items-center gap-2 px-4 py-2 bg-muted/60 border-t border-border/20 flex-shrink-0">
                  <div className="flex-1 min-w-0 border-l-[3px] border-primary pl-2.5">
                    <p className="text-[11px] font-semibold text-primary">
                      {replyTo.direction === 'incoming' ? 'Cliente' : 'Você'}
                    </p>
                    <p className="text-[12px] text-muted-foreground truncate">
                      {replyTo.message_type !== 'text' ? `📎 ${replyTo.message_type}` : (replyTo.content?.substring(0, 100) || '')}
                    </p>
                  </div>
                  <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground p-1">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Input area */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-t border-border/20 flex-shrink-0">
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

                <label className="flex-shrink-0">
                  <input type="file" className="hidden" onChange={handleMediaUpload}
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx" />
                  <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground rounded-full" asChild>
                    <span><Paperclip className="h-6 w-6" /></span>
                  </Button>
                </label>

                <Input
                  ref={inputRef}
                  placeholder="Digite uma mensagem"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  className="flex-1 h-[42px] bg-card border-0 rounded-lg text-[15px] px-4 shadow-sm focus-visible:ring-0"
                  disabled={sending}
                />

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

        {/* ─── Tag Management Dialog ─── */}
        <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" /> Etiquetas
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Current tags */}
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Etiquetas atuais</p>
                <div className="flex flex-wrap gap-2">
                  {getTagsForPhone(tagDialogPhone).length === 0 && (
                    <p className="text-sm text-muted-foreground/60">Nenhuma etiqueta</p>
                  )}
                  {getTagsForPhone(tagDialogPhone).map(t => (
                    <span key={t.id} className={cn("inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium", getTagClasses(t.tag))}>
                      {t.tag}
                      <button onClick={() => removeTag(t.id)} className="hover:opacity-70">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Quick add tags */}
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Adicionar etiqueta</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {suggestedTags
                    .filter(t => !getTagsForPhone(tagDialogPhone).some(ct => ct.tag === t))
                    .map(t => (
                      <button key={t} onClick={() => addTag(tagDialogPhone, t)}
                        className={cn("text-xs px-2.5 py-1 rounded-full border font-medium hover:opacity-80 transition-opacity", getTagClasses(t))}>
                        + {t}
                      </button>
                    ))}
                </div>
                {/* Custom tag input */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Nova etiqueta personalizada..."
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    className="h-9 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTagInput.trim()) {
                        addTag(tagDialogPhone, newTagInput);
                        setNewTagInput('');
                      }
                    }}
                  />
                  <Button size="sm" className="h-9" onClick={() => {
                    if (newTagInput.trim()) {
                      addTag(tagDialogPhone, newTagInput);
                      setNewTagInput('');
                    }
                  }}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ─── Debug Panel ─── */}
        <div className={cn(
          "absolute bottom-0 left-0 right-0 bg-card border-t border-border z-50 transition-all",
          showDebug ? "h-[200px]" : "h-8"
        )}>
          <button
            onClick={() => setShowDebug(!showDebug)}
            className={cn(
              "w-full h-8 flex items-center justify-between px-4 text-xs font-mono",
              rtStatus === 'SUBSCRIBED' ? "text-primary" : "text-destructive"
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
                    log.includes('✅') ? 'text-primary' : log.includes('Ignorado') ? 'text-amber-500' : ''
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
