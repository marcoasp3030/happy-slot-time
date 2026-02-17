import { useEffect, useState } from 'react';
import { formatPhone } from '@/lib/utils';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, Clock, CheckCircle, ArrowLeft, ArrowRight, User, Sparkles, MapPin, Phone, Star, Video, ClipboardList, Shield, Download } from 'lucide-react';
import { generateGoogleCalendarLink, generateOutlookCalendarLink, downloadICSFile } from '@/lib/calendarLinks';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Step = 'service' | 'staff' | 'date' | 'time' | 'anamnesis' | 'info' | 'success';

const stepVariants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
};

export default function PublicBooking() {
  const { slug } = useParams<{ slug: string }>();
  const [company, setCompany] = useState<any>(null);
  const [pageSettings, setPageSettings] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [businessHours, setBusinessHours] = useState<any[]>([]);
  const [companySettings, setCompanySettings] = useState<any>({ slot_interval: 30, min_advance_hours: 2, max_capacity_per_slot: 1 });
  const [existingAppointments, setExistingAppointments] = useState<any[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('service');
  const [submitting, setSubmitting] = useState(false);

  const [selectedService, setSelectedService] = useState<any>(null);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [meetLink, setMeetLink] = useState<string | null>(null);
  const [anamnesisTemplates, setAnamnesisTemplates] = useState<any[]>([]);
  const [anamnesisResponses, setAnamnesisResponses] = useState<Record<string, any>>({});
  const [lgpdConsent, setLgpdConsent] = useState(false);
  const [privacyPolicyText, setPrivacyPolicyText] = useState('');

  useEffect(() => {
    if (!slug) return;
    const fetchData = async () => {
      const { data: comp } = await supabase.from('companies').select('*').eq('slug', slug).single();
      if (!comp) { setLoading(false); return; }
      setCompany(comp);

      const [pageRes, servicesRes, staffRes, hoursRes, settingsRes, blocksRes] = await Promise.all([
        supabase.from('public_page_settings').select('*').eq('company_id', comp.id).single(),
        supabase.from('services').select('*').eq('company_id', comp.id).eq('active', true).order('name'),
        supabase.from('staff').select('*').eq('company_id', comp.id).eq('active', true).order('name'),
        supabase.from('business_hours').select('*').eq('company_id', comp.id).order('day_of_week'),
        supabase.from('company_settings').select('*, privacy_policy_text').eq('company_id', comp.id).single(),
        supabase.from('time_blocks').select('*').eq('company_id', comp.id).gte('block_date', new Date().toISOString().split('T')[0]),
      ]);

      setPageSettings(pageRes.data);
      setServices(servicesRes.data || []);
      setStaffList(staffRes.data || []);
      setBusinessHours(hoursRes.data || []);
      if (settingsRes.data) {
        setCompanySettings(settingsRes.data);
        setPrivacyPolicyText(settingsRes.data.privacy_policy_text || '');
      }
      setTimeBlocks(blocksRes.data || []);
      setLoading(false);
    };
    fetchData();
  }, [slug]);

  // Fetch anamnesis templates when service is selected
  useEffect(() => {
    if (!selectedService?.requires_anamnesis || !company) {
      setAnamnesisTemplates([]);
      setAnamnesisResponses({});
      return;
    }
    const fetchTemplates = async () => {
      let data: any[] | null = null;
      // Prefer anamnesis_type_id if available
      if (selectedService.anamnesis_type_id) {
        const result = await supabase
          .from('anamnesis_templates')
          .select('*')
          .eq('active', true)
          .eq('anamnesis_type_id', selectedService.anamnesis_type_id)
          .order('sort_order');
        data = result.data;
      } else {
        // Fallback to service_id or global
        const result = await supabase
          .from('anamnesis_templates')
          .select('*')
          .eq('active', true)
          .order('sort_order')
          .or(`service_id.eq.${selectedService.id},service_id.is.null`);
        data = result.data;
      }
      setAnamnesisTemplates(data || []);
      setAnamnesisResponses({});
      setAnamnesisResponses({});
    };
    fetchTemplates();
  }, [selectedService, company]);

  useEffect(() => {
    if (!selectedDate || !company) return;
    supabase
      .from('appointments')
      .select('start_time, end_time')
      .eq('company_id', company.id)
      .eq('appointment_date', selectedDate)
      .neq('status', 'canceled')
      .then(({ data }) => setExistingAppointments(data || []));
  }, [selectedDate, company]);

  const generateTimeSlots = () => {
    if (!selectedDate || businessHours.length === 0) return [];
    const dayOfWeek = new Date(selectedDate + 'T12:00:00').getDay();
    const bh = businessHours.find((h) => h.day_of_week === dayOfWeek);
    if (!bh || !bh.is_open) return [];

    // Check if entire day is blocked for all staff
    const fullDayBlock = timeBlocks.find(b =>
      b.block_date === selectedDate && !b.start_time && !b.end_time && !b.staff_id
    );
    if (fullDayBlock) return [];

    // Get time-specific blocks for this date
    const dateBlocks = timeBlocks.filter(b =>
      b.block_date === selectedDate &&
      b.start_time && b.end_time &&
      (!b.staff_id || (selectedStaff && b.staff_id === selectedStaff.id) || !selectedStaff)
    );

    const slots: string[] = [];
    const [openH, openM] = bh.open_time.split(':').map(Number);
    const [closeH, closeM] = bh.close_time.split(':').map(Number);
    const interval = companySettings.slot_interval || 30;
    const duration = selectedService?.duration || 30;
    const now = new Date();
    const minAdvance = (companySettings.min_advance_hours || 2) * 60;

    let current = openH * 60 + openM;
    const end = closeH * 60 + closeM;

    while (current + duration <= end) {
      const hh = String(Math.floor(current / 60)).padStart(2, '0');
      const mm = String(current % 60).padStart(2, '0');
      const timeStr = `${hh}:${mm}`;
      const slotDate = new Date(`${selectedDate}T${timeStr}:00`);
      const diffMin = (slotDate.getTime() - now.getTime()) / 60000;

      if (diffMin >= minAdvance) {
        const endMin = current + duration;
        const endHH = String(Math.floor(endMin / 60)).padStart(2, '0');
        const endMM = String(endMin % 60).padStart(2, '0');
        const endStr = `${endHH}:${endMM}`;

        // Check if slot overlaps with any time block
        const isBlocked = dateBlocks.some(b => {
          const blockStart = b.start_time.slice(0, 5);
          const blockEnd = b.end_time.slice(0, 5);
          return timeStr < blockEnd && endStr > blockStart;
        });

        if (!isBlocked) {
          const conflicts = existingAppointments.filter((a) => {
            const aStart = a.start_time.slice(0, 5);
            const aEnd = a.end_time.slice(0, 5);
            return timeStr < aEnd && endStr > aStart;
          });
          if (conflicts.length < (companySettings.max_capacity_per_slot || 1)) {
            slots.push(timeStr);
          }
        }
      }
      current += interval;
    }
    return slots;
  };

  const validateAnamnesis = () => {
    for (const t of anamnesisTemplates) {
      if (t.required && !anamnesisResponses[t.id]) return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!clientName.trim() || !clientPhone.trim() || !company || !selectedService || !lgpdConsent) return;
    setSubmitting(true);

    // Log LGPD consent
    await supabase.from('consent_logs').insert({
      company_id: company.id,
      client_name: clientName.trim(),
      client_phone: clientPhone.trim(),
      consent_type: 'booking',
      user_agent: navigator.userAgent,
    });
    const duration = selectedService.duration || 30;
    const [h, m] = selectedTime.split(':').map(Number);
    const endMin = h * 60 + m + duration;
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

    const { data: inserted, error } = await supabase.from('appointments').insert({
      company_id: company.id,
      service_id: selectedService.id,
      staff_id: selectedStaff?.id || null,
      client_name: clientName.trim(),
      client_phone: clientPhone.trim(),
      appointment_date: selectedDate,
      start_time: selectedTime,
      end_time: endTime,
      notes: notes.trim() || null,
    }).select('id').single();

    if (error) { setSubmitting(false); toast.error('Erro ao agendar. Tente novamente.'); return; }

    // Save anamnesis responses if any
    if (hasAnamnesis && inserted?.id && Object.keys(anamnesisResponses).length > 0) {
      await supabase.from('anamnesis_responses').insert({
        company_id: company.id,
        service_id: selectedService.id,
        appointment_id: inserted.id,
        client_name: clientName.trim(),
        client_phone: clientPhone.trim(),
        responses: anamnesisResponses,
        filled_by: 'client',
      });
    }

    setSubmitting(false);

    // Check for meet link after a delay (Google Calendar sync is async)
    if (inserted?.id) {
      setTimeout(async () => {
        const { data: appt } = await supabase
          .from('appointments')
          .select('meet_link')
          .eq('id', inserted.id)
          .single();
        if (appt?.meet_link) setMeetLink(appt.meet_link);
      }, 3000);
    }

    setStep('success');
  };

  const getAvailableDates = () => {
    const dates: string[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.now() + i * 86400000);
      const dayOfWeek = d.getDay();
      const dateStr = d.toISOString().split('T')[0];
      const bh = businessHours.find((h) => h.day_of_week === dayOfWeek);
      if (!bh || !bh.is_open) continue;
      // Check if entire day is blocked (full-day block with no staff filter or matching staff)
      const fullDayBlock = timeBlocks.find(b =>
        b.block_date === dateStr && !b.start_time && !b.end_time &&
        (!b.staff_id || (selectedStaff && b.staff_id === selectedStaff.id) || !selectedStaff)
      );
      if (fullDayBlock && !fullDayBlock.staff_id) continue; // Skip fully blocked days for all staff
      dates.push(dateStr);
    }
    return dates;
  };

  const primaryColor = pageSettings?.primary_color || '#10b981';
  const secondaryColor = pageSettings?.secondary_color || '#0f172a';
  const bgColor = pageSettings?.background_color || '#f8fafc';
  const btnRadius = pageSettings?.button_style === 'square' ? '12px' : '9999px';

  const hasAnamnesis = selectedService?.requires_anamnesis && anamnesisTemplates.length > 0;
  const steps: Step[] = ['service', ...(staffList.length > 0 ? ['staff'] as Step[] : []), 'date', 'time', ...(hasAnamnesis ? ['anamnesis'] as Step[] : []), 'info'];
  const currentStepIndex = steps.indexOf(step);

  const stepLabels: Record<string, string> = {
    service: 'Serviço',
    staff: 'Profissional',
    date: 'Data',
    time: 'Horário',
    anamnesis: 'Anamnese',
    info: 'Dados',
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: bgColor }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="relative">
            <div className="h-12 w-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: primaryColor + '15' }}>
              <Calendar className="h-6 w-6" style={{ color: primaryColor }} />
            </div>
            <div className="absolute inset-0 h-12 w-12 rounded-2xl animate-ping opacity-20" style={{ backgroundColor: primaryColor }} />
          </div>
          <p className="text-sm text-muted-foreground font-medium">Carregando agendamento...</p>
        </motion.div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center px-6">
          <div className="h-20 w-20 rounded-3xl bg-muted flex items-center justify-center mx-auto mb-5">
            <Calendar className="h-9 w-9 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-extrabold mb-2">Empresa não encontrada</h2>
          <p className="text-muted-foreground">Verifique o link e tente novamente.</p>
        </motion.div>
      </div>
    );
  }

  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const fontFamily = pageSettings?.font_style === 'classic' ? 'Georgia, serif' : pageSettings?.font_style === 'playful' ? '"Comic Sans MS", cursive' : '"Plus Jakarta Sans", sans-serif';

  return (
    <div className="min-h-screen" style={{ backgroundColor: bgColor, fontFamily }}>
      {/* Hero Header */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `radial-gradient(circle at 20% 50%, ${primaryColor} 0%, transparent 50%), radial-gradient(circle at 80% 20%, ${primaryColor} 0%, transparent 40%)`,
          }}
        />
        <div className="relative max-w-lg mx-auto px-5 pt-10 pb-6 sm:pt-14 sm:pb-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            {company.logo_url ? (
              <motion.img
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                src={company.logo_url}
                alt={company.name}
                className="h-20 w-20 rounded-2xl mx-auto mb-5 object-cover shadow-lg ring-4 ring-white/80"
              />
            ) : (
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="h-20 w-20 rounded-2xl mx-auto mb-5 flex items-center justify-center shadow-lg ring-4 ring-white/80"
                style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)` }}
              >
                <span className="text-3xl font-extrabold text-white">{company.name?.charAt(0)?.toUpperCase()}</span>
              </motion.div>
            )}
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight" style={{ color: secondaryColor }}>
              {pageSettings?.title || company.name}
            </h1>
            {pageSettings?.subtitle && (
              <p className="text-muted-foreground mt-2 font-medium text-sm sm:text-base">{pageSettings.subtitle}</p>
            )}
            {pageSettings?.welcome_message && (
              <p className="text-sm text-muted-foreground/60 mt-2 max-w-sm mx-auto">{pageSettings.welcome_message}</p>
            )}
            {(company.address || company.phone) && (
              <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground/60">
                {company.address && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {company.address}
                  </span>
                )}
                {company.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {company.phone}
                  </span>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 pb-12">
        {/* Step indicator */}
        {step !== 'success' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <div className="flex items-center justify-between mb-2.5 px-1">
              {steps.map((s, i) => (
                <div key={s} className="flex items-center gap-1.5">
                  <div
                    className="flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold transition-all duration-500"
                    style={{
                      backgroundColor: i <= currentStepIndex ? primaryColor : 'transparent',
                      color: i <= currentStepIndex ? 'white' : '#94a3b8',
                      border: i <= currentStepIndex ? 'none' : '2px solid #e2e8f0',
                    }}
                  >
                    {i < currentStepIndex ? '✓' : i + 1}
                  </div>
                  {i < steps.length - 1 && (
                    <div className="hidden sm:block w-8 lg:w-12 h-0.5 rounded-full transition-all duration-500"
                      style={{ backgroundColor: i < currentStepIndex ? primaryColor : '#e2e8f0' }}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-0.5">
              {steps.map((s, i) => (
                <span
                  key={s}
                  className="text-[10px] sm:text-xs font-semibold transition-colors duration-300"
                  style={{ color: i <= currentStepIndex ? secondaryColor : '#94a3b8' }}
                >
                  {stepLabels[s]}
                </span>
              ))}
            </div>
          </motion.div>
        )}

        {/* Content */}
        <AnimatePresence mode="wait">
          {/* Service selection */}
          {step === 'service' && (
            <motion.div
              key="service"
              variants={stepVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: primaryColor + '15' }}>
                  <Sparkles className="h-4 w-4" style={{ color: primaryColor }} />
                </div>
                <h2 className="text-lg font-bold" style={{ color: secondaryColor }}>Escolha o serviço</h2>
              </div>
              {services.map((s, i) => (
                <motion.button
                  key={s.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => {
                    setSelectedService(s);
                    setStep(staffList.length > 0 ? 'staff' : 'date');
                  }}
                  className="w-full text-left rounded-2xl bg-white shadow-sm hover:shadow-lg border border-transparent hover:border-opacity-30 transition-all duration-300 group relative overflow-hidden"
                  style={{ ['--hover-border' as string]: primaryColor }}
                >
                  {s.image_url && (
                    <div className="w-full h-36 overflow-hidden">
                      <img src={s.image_url} alt={s.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                      style={{ background: `linear-gradient(135deg, ${primaryColor}05, ${primaryColor}10)` }}
                    />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3.5">
                        {!s.image_url && (
                          <div
                            className="h-12 w-12 rounded-xl flex items-center justify-center shadow-sm"
                            style={{ background: `linear-gradient(135deg, ${(s.color || primaryColor)}15, ${(s.color || primaryColor)}25)` }}
                          >
                            <Star className="h-5 w-5" style={{ color: s.color || primaryColor }} />
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-sm" style={{ color: secondaryColor }}>{s.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />{s.duration} min
                            </span>
                            {s.price && (
                              <span className="text-xs font-bold" style={{ color: primaryColor }}>
                                R$ {Number(s.price).toFixed(2)}
                              </span>
                            )}
                          </div>
                          {s.description && (
                            <p className="text-xs text-muted-foreground/60 mt-1 line-clamp-2">{s.description}</p>
                          )}
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                </motion.button>
              ))}
              {services.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Nenhum serviço disponível</p>
                </div>
              )}
            </motion.div>
          )}

          {/* Staff selection */}
          {step === 'staff' && (
            <motion.div
              key="staff"
              variants={stepVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: primaryColor + '15' }}>
                  <User className="h-4 w-4" style={{ color: primaryColor }} />
                </div>
                <h2 className="text-lg font-bold" style={{ color: secondaryColor }}>Escolha o profissional</h2>
              </div>
              <motion.button
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => { setSelectedStaff(null); setStep('date'); }}
                className="w-full text-left p-4 rounded-2xl bg-white shadow-sm hover:shadow-lg border border-transparent transition-all duration-300 group"
              >
                <div className="flex items-center gap-3.5">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-muted to-muted/60 flex items-center justify-center">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-bold text-sm" style={{ color: secondaryColor }}>Sem preferência</p>
                    <p className="text-xs text-muted-foreground">Qualquer profissional disponível</p>
                  </div>
                </div>
              </motion.button>
              {staffList.map((s, i) => (
                <motion.button
                  key={s.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: (i + 1) * 0.05 }}
                  onClick={() => { setSelectedStaff(s); setStep('date'); }}
                  className="w-full text-left p-4 rounded-2xl bg-white shadow-sm hover:shadow-lg border border-transparent transition-all duration-300 group"
                >
                  <div className="flex items-center gap-3.5">
                    {s.photo_url ? (
                      <img src={s.photo_url} alt={s.name} className="h-12 w-12 rounded-xl object-cover shadow-sm" />
                    ) : (
                      <div className="h-12 w-12 rounded-xl flex items-center justify-center shadow-sm"
                        style={{ background: `linear-gradient(135deg, ${primaryColor}20, ${primaryColor}35)` }}
                      >
                        <span className="font-bold text-base" style={{ color: primaryColor }}>
                          {s.name?.charAt(0)?.toUpperCase()}
                        </span>
                      </div>
                    )}
                    <p className="font-bold text-sm" style={{ color: secondaryColor }}>{s.name}</p>
                  </div>
                </motion.button>
              ))}
              <BackButton onClick={() => setStep('service')} />
            </motion.div>
          )}

          {/* Date selection */}
          {step === 'date' && (
            <motion.div
              key="date"
              variants={stepVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: primaryColor + '15' }}>
                  <Calendar className="h-4 w-4" style={{ color: primaryColor }} />
                </div>
                <h2 className="text-lg font-bold" style={{ color: secondaryColor }}>Escolha a data</h2>
              </div>

              {/* Selected service mini summary */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium"
                style={{ backgroundColor: primaryColor + '10', color: primaryColor }}
              >
                <Star className="h-3 w-3" />
                <span>{selectedService?.name}</span>
                {selectedStaff && <><span>·</span><span>{selectedStaff.name}</span></>}
              </div>

              <div className="grid grid-cols-4 gap-2">
                {getAvailableDates().slice(0, 16).map((d, i) => {
                  const date = new Date(d + 'T12:00:00');
                  const isSelected = selectedDate === d;
                  const isToday = d === new Date().toISOString().split('T')[0];
                  return (
                    <motion.button
                      key={d}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.02 }}
                      onClick={() => { setSelectedDate(d); setStep('time'); }}
                      className="relative p-3 rounded-2xl text-center transition-all duration-300 border-2 hover:shadow-md group"
                      style={{
                        borderColor: isSelected ? primaryColor : 'transparent',
                        backgroundColor: isSelected ? primaryColor + '10' : 'white',
                        boxShadow: isSelected ? `0 4px 14px ${primaryColor}20` : '0 1px 3px rgba(0,0,0,0.04)',
                      }}
                    >
                      {isToday && (
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 px-1.5 py-0 rounded-full text-[8px] font-bold text-white"
                          style={{ backgroundColor: primaryColor }}
                        >
                          HOJE
                        </div>
                      )}
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">{dayNames[date.getDay()]}</p>
                      <p className="text-xl font-extrabold mt-0.5" style={{ color: isSelected ? primaryColor : secondaryColor }}>{date.getDate()}</p>
                      <p className="text-[10px] font-medium text-muted-foreground/60">{monthNames[date.getMonth()]}</p>
                    </motion.button>
                  );
                })}
              </div>
              <BackButton onClick={() => setStep(staffList.length > 0 ? 'staff' : 'service')} />
            </motion.div>
          )}

          {/* Time selection */}
          {step === 'time' && (
            <motion.div
              key="time"
              variants={stepVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: primaryColor + '15' }}>
                  <Clock className="h-4 w-4" style={{ color: primaryColor }} />
                </div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: secondaryColor }}>Escolha o horário</h2>
                  <p className="text-xs text-muted-foreground capitalize">
                    {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                </div>
              </div>

              {generateTimeSlots().length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl shadow-sm">
                  <Clock className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="font-bold text-sm" style={{ color: secondaryColor }}>Nenhum horário disponível</p>
                  <p className="text-xs text-muted-foreground mt-1">Tente outra data</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {generateTimeSlots().map((t, i) => (
                    <motion.button
                      key={t}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.02 }}
                      onClick={() => { setSelectedTime(t); setStep(hasAnamnesis ? 'anamnesis' : 'info'); }}
                      className="p-3.5 rounded-xl bg-white shadow-sm hover:shadow-md border-2 border-transparent transition-all duration-200 font-bold text-sm group"
                      style={{ color: secondaryColor }}
                      onMouseEnter={(e) => {
                        (e.target as HTMLElement).style.borderColor = primaryColor;
                        (e.target as HTMLElement).style.backgroundColor = primaryColor + '08';
                      }}
                      onMouseLeave={(e) => {
                        (e.target as HTMLElement).style.borderColor = 'transparent';
                        (e.target as HTMLElement).style.backgroundColor = 'white';
                      }}
                    >
                      {t}
                    </motion.button>
                  ))}
                </div>
              )}
              <BackButton onClick={() => setStep('date')} />
            </motion.div>
          )}

          {/* Anamnesis step */}
          {step === 'anamnesis' && (
            <motion.div
              key="anamnesis"
              variants={stepVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: primaryColor + '15' }}>
                  <ClipboardList className="h-4 w-4" style={{ color: primaryColor }} />
                </div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: secondaryColor }}>Ficha de anamnese</h2>
                  <p className="text-xs text-muted-foreground">Preencha as informações abaixo</p>
                </div>
              </div>

              <div className="space-y-4">
                {anamnesisTemplates.map((field) => (
                  <div key={field.id} className="p-4 rounded-2xl bg-white shadow-sm space-y-2">
                    <Label className="font-bold text-sm" style={{ color: secondaryColor }}>
                      {field.field_label} {field.required && <span className="text-red-500">*</span>}
                    </Label>

                    {field.field_type === 'text' && (
                      <Input
                        value={anamnesisResponses[field.id] || ''}
                        onChange={(e) => setAnamnesisResponses(prev => ({ ...prev, [field.id]: e.target.value }))}
                        placeholder="Digite aqui..."
                        className="h-11 rounded-xl bg-white shadow-sm border-border/60"
                      />
                    )}

                    {field.field_type === 'textarea' && (
                      <Textarea
                        value={anamnesisResponses[field.id] || ''}
                        onChange={(e) => setAnamnesisResponses(prev => ({ ...prev, [field.id]: e.target.value }))}
                        placeholder="Digite aqui..."
                        rows={3}
                        className="rounded-xl bg-white shadow-sm border-border/60"
                      />
                    )}

                    {field.field_type === 'number' && (
                      <Input
                        type="number"
                        value={anamnesisResponses[field.id] || ''}
                        onChange={(e) => setAnamnesisResponses(prev => ({ ...prev, [field.id]: e.target.value }))}
                        placeholder="0"
                        className="h-11 rounded-xl bg-white shadow-sm border-border/60"
                      />
                    )}

                    {field.field_type === 'select' && Array.isArray(field.field_options) && (
                      <Select
                        value={anamnesisResponses[field.id] || ''}
                        onValueChange={(v) => setAnamnesisResponses(prev => ({ ...prev, [field.id]: v }))}
                      >
                        <SelectTrigger className="h-11 rounded-xl bg-white shadow-sm border-border/60">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {(field.field_options as string[]).map((opt: string) => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {field.field_type === 'checkbox' && Array.isArray(field.field_options) && (
                      <div className="space-y-2">
                        {(field.field_options as string[]).map((opt: string) => {
                          const checked = Array.isArray(anamnesisResponses[field.id]) && anamnesisResponses[field.id].includes(opt);
                          return (
                            <label key={opt} className="flex items-center gap-2 cursor-pointer">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(c) => {
                                  setAnamnesisResponses(prev => {
                                    const current = Array.isArray(prev[field.id]) ? prev[field.id] : [];
                                    return {
                                      ...prev,
                                      [field.id]: c ? [...current, opt] : current.filter((x: string) => x !== opt),
                                    };
                                  });
                                }}
                              />
                              <span className="text-sm">{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <Button
                onClick={() => {
                  if (!validateAnamnesis()) {
                    toast.error('Preencha todos os campos obrigatórios');
                    return;
                  }
                  setStep('info');
                }}
                className="w-full h-12 font-bold text-sm shadow-md text-white border-0"
                style={{ backgroundColor: primaryColor, borderRadius: btnRadius }}
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                Continuar
              </Button>

              <BackButton onClick={() => setStep('time')} />
            </motion.div>
          )}

          {/* Client info */}
          {step === 'info' && (
            <motion.div
              key="info"
              variants={stepVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="space-y-5"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: primaryColor + '15' }}>
                  <User className="h-4 w-4" style={{ color: primaryColor }} />
                </div>
                <h2 className="text-lg font-bold" style={{ color: secondaryColor }}>Seus dados</h2>
              </div>

              {/* Appointment summary card */}
              <div className="p-4 rounded-2xl bg-white shadow-sm border border-border/40">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">Resumo do agendamento</p>
                <div className="grid grid-cols-2 gap-3">
                  <SummaryItem icon={<Star className="h-3.5 w-3.5" />} label="Serviço" value={selectedService?.name} color={primaryColor} />
                  {selectedStaff && <SummaryItem icon={<User className="h-3.5 w-3.5" />} label="Profissional" value={selectedStaff.name} color={primaryColor} />}
                  <SummaryItem
                    icon={<Calendar className="h-3.5 w-3.5" />}
                    label="Data"
                    value={new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                    color={primaryColor}
                  />
                  <SummaryItem icon={<Clock className="h-3.5 w-3.5" />} label="Horário" value={selectedTime} color={primaryColor} />
                </div>
                {selectedService?.price && (
                  <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">Valor</span>
                    <span className="font-extrabold" style={{ color: primaryColor }}>R$ {Number(selectedService.price).toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Form */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Nome completo *</Label>
                  <Input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Digite seu nome"
                    className="h-12 rounded-xl bg-white text-sm shadow-sm border-border/60 focus:ring-2 focus:border-transparent"
                    style={{ ['--tw-ring-color' as string]: primaryColor + '40' }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold text-xs uppercase tracking-wider text-muted-foreground">WhatsApp *</Label>
                  <Input
                    value={clientPhone}
                    onChange={(e) => setClientPhone(formatPhone(e.target.value))}
                    placeholder="(00) 00000-0000"
                    className="h-12 rounded-xl bg-white text-sm shadow-sm border-border/60"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Observação</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Alguma informação adicional? (opcional)"
                    rows={2}
                    className="rounded-xl bg-white text-sm shadow-sm border-border/60"
                  />
                </div>
              </div>

              {/* LGPD Consent */}
              <div className="p-4 rounded-2xl bg-white shadow-sm border border-border/40">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={lgpdConsent}
                    onCheckedChange={(v) => setLgpdConsent(!!v)}
                    className="mt-0.5"
                  />
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    <span className="flex items-center gap-1 font-semibold text-foreground mb-1">
                      <Shield className="h-3 w-3" style={{ color: primaryColor }} />
                      Consentimento LGPD
                    </span>
                    Li e concordo com a{' '}
                    <a
                      href={`/privacidade/${slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold underline hover:no-underline"
                      style={{ color: primaryColor }}
                    >
                      Política de Privacidade
                    </a>
                    {' '}e autorizo o tratamento dos meus dados pessoais para fins de agendamento e atendimento.
                  </div>
                </label>
              </div>

              <Button
                onClick={handleSubmit}
                className="w-full h-13 font-bold text-base shadow-lg hover:shadow-xl transition-all duration-300 text-white border-0"
                style={{ backgroundColor: primaryColor, borderRadius: btnRadius }}
                disabled={!clientName.trim() || !clientPhone.trim() || !lgpdConsent || submitting}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Agendando...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5" />
                    Confirmar agendamento
                  </span>
                )}
              </Button>

              <BackButton onClick={() => setStep(hasAnamnesis ? 'anamnesis' : 'time')} />
            </motion.div>
          )}

          {/* Success */}
          {step === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="text-center py-12 space-y-6"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="relative mx-auto w-fit"
              >
                <div className="h-24 w-24 rounded-3xl mx-auto flex items-center justify-center shadow-xl"
                  style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)` }}
                >
                  <CheckCircle className="h-12 w-12 text-white" />
                </div>
                <div className="absolute -inset-2 rounded-3xl animate-ping opacity-10" style={{ backgroundColor: primaryColor }} />
              </motion.div>
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold" style={{ color: secondaryColor }}>Agendamento confirmado!</h2>
                <p className="text-muted-foreground mt-2 font-medium">
                  {selectedService?.name}
                </p>
                <div className="inline-flex items-center gap-3 mt-3 px-4 py-2 rounded-xl" style={{ backgroundColor: primaryColor + '10' }}>
                  <span className="flex items-center gap-1 text-sm font-bold" style={{ color: primaryColor }}>
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </span>
                  <span className="text-muted-foreground/30">|</span>
                  <span className="flex items-center gap-1 text-sm font-bold" style={{ color: primaryColor }}>
                    <Clock className="h-3.5 w-3.5" />
                    {selectedTime}
                  </span>
                </div>
              </div>
              {meetLink && (
                <motion.a
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  href={meetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm text-white shadow-lg hover:shadow-xl transition-all duration-300"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Video className="h-4 w-4" />
                  Entrar na reunião online (Google Meet)
                </motion.a>
              )}

              {/* Add to Calendar buttons */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="flex flex-col sm:flex-row items-center gap-2"
              >
                <a
                  href={generateGoogleCalendarLink({
                    title: `${selectedService?.name} - ${company?.name}`,
                    description: `Agendamento com ${selectedStaff?.name || company?.name}`,
                    startDate: selectedDate,
                    startTime: selectedTime,
                    endTime: (() => { const [h, m] = selectedTime.split(':').map(Number); const end = h * 60 + m + (selectedService?.duration || 30); return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`; })(),
                    location: company?.address || '',
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs border shadow-sm hover:shadow-md transition-all duration-300"
                  style={{ borderColor: primaryColor + '40', color: primaryColor }}
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Adicionar ao Google Agenda
                </a>
                <a
                  href={generateOutlookCalendarLink({
                    title: `${selectedService?.name} - ${company?.name}`,
                    description: `Agendamento com ${selectedStaff?.name || company?.name}`,
                    startDate: selectedDate,
                    startTime: selectedTime,
                    endTime: (() => { const [h, m] = selectedTime.split(':').map(Number); const end = h * 60 + m + (selectedService?.duration || 30); return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`; })(),
                    location: company?.address || '',
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs border shadow-sm hover:shadow-md transition-all duration-300"
                  style={{ borderColor: primaryColor + '40', color: primaryColor }}
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Adicionar ao Outlook
                </a>
                <button
                  onClick={() => downloadICSFile({
                    title: `${selectedService?.name} - ${company?.name}`,
                    description: `Agendamento com ${selectedStaff?.name || company?.name}`,
                    startDate: selectedDate,
                    startTime: selectedTime,
                    endTime: (() => { const [h, m] = selectedTime.split(':').map(Number); const end = h * 60 + m + (selectedService?.duration || 30); return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`; })(),
                    location: company?.address || '',
                  })}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs border shadow-sm hover:shadow-md transition-all duration-300"
                  style={{ borderColor: primaryColor + '40', color: primaryColor }}
                >
                  <Download className="h-3.5 w-3.5" />
                  Baixar .ics
                </button>
              </motion.div>

              <p className="text-sm text-muted-foreground">
                Você receberá uma confirmação por WhatsApp 📱
              </p>
              <Button
                onClick={() => {
                  setStep('service'); setSelectedService(null); setSelectedStaff(null);
                  setSelectedDate(''); setSelectedTime(''); setClientName(''); setClientPhone(''); setNotes(''); setMeetLink(null); setAnamnesisResponses({}); setLgpdConsent(false);
                }}
                variant="outline"
                className="font-bold mt-2 h-11 px-6"
                style={{ borderRadius: btnRadius, borderColor: primaryColor + '40', color: primaryColor }}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Novo agendamento
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        {pageSettings?.cancellation_policy && step !== 'success' && (
          <p className="text-[11px] text-muted-foreground/40 mt-12 text-center leading-relaxed max-w-sm mx-auto">{pageSettings.cancellation_policy}</p>
        )}

        <div className="flex items-center justify-center gap-3 mt-6 text-[10px] text-muted-foreground/30 font-medium">
          <a href={`/privacidade/${slug}`} target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground/60 underline transition-colors">
            Política de Privacidade
          </a>
          <span>•</span>
          <span>Powered by Agendamento Online</span>
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 flex-shrink-0" style={{ color }}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-bold truncate">{value}</p>
      </div>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-sm text-muted-foreground/60 hover:text-muted-foreground transition-colors mt-2 font-medium">
      <ArrowLeft className="h-3.5 w-3.5" />
      Voltar
    </button>
  );
}
