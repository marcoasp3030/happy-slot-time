import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, Clock, CheckCircle, ArrowLeft, ArrowRight, User, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

type Step = 'service' | 'staff' | 'date' | 'time' | 'info' | 'success';

export default function PublicBooking() {
  const { slug } = useParams<{ slug: string }>();
  const [company, setCompany] = useState<any>(null);
  const [pageSettings, setPageSettings] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [businessHours, setBusinessHours] = useState<any[]>([]);
  const [companySettings, setCompanySettings] = useState<any>({ slot_interval: 30, min_advance_hours: 2, max_capacity_per_slot: 1 });
  const [existingAppointments, setExistingAppointments] = useState<any[]>([]);
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

  useEffect(() => {
    if (!slug) return;
    const fetchData = async () => {
      const { data: comp } = await supabase.from('companies').select('*').eq('slug', slug).single();
      if (!comp) { setLoading(false); return; }
      setCompany(comp);

      const [pageRes, servicesRes, staffRes, hoursRes, settingsRes] = await Promise.all([
        supabase.from('public_page_settings').select('*').eq('company_id', comp.id).single(),
        supabase.from('services').select('*').eq('company_id', comp.id).eq('active', true).order('name'),
        supabase.from('staff').select('*').eq('company_id', comp.id).eq('active', true).order('name'),
        supabase.from('business_hours').select('*').eq('company_id', comp.id).order('day_of_week'),
        supabase.from('company_settings').select('*').eq('company_id', comp.id).single(),
      ]);

      setPageSettings(pageRes.data);
      setServices(servicesRes.data || []);
      setStaffList(staffRes.data || []);
      setBusinessHours(hoursRes.data || []);
      if (settingsRes.data) setCompanySettings(settingsRes.data);
      setLoading(false);
    };
    fetchData();
  }, [slug]);

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
        const conflicts = existingAppointments.filter((a) => {
          const aStart = a.start_time.slice(0, 5);
          const aEnd = a.end_time.slice(0, 5);
          return timeStr < aEnd && endStr > aStart;
        });
        if (conflicts.length < (companySettings.max_capacity_per_slot || 1)) {
          slots.push(timeStr);
        }
      }
      current += interval;
    }
    return slots;
  };

  const handleSubmit = async () => {
    if (!clientName.trim() || !clientPhone.trim() || !company || !selectedService) return;
    setSubmitting(true);
    const duration = selectedService.duration || 30;
    const [h, m] = selectedTime.split(':').map(Number);
    const endMin = h * 60 + m + duration;
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

    const { error } = await supabase.from('appointments').insert({
      company_id: company.id,
      service_id: selectedService.id,
      staff_id: selectedStaff?.id || null,
      client_name: clientName.trim(),
      client_phone: clientPhone.trim(),
      appointment_date: selectedDate,
      start_time: selectedTime,
      end_time: endTime,
      notes: notes.trim() || null,
    });

    setSubmitting(false);
    if (error) { toast.error('Erro ao agendar. Tente novamente.'); return; }
    setStep('success');
  };

  const getAvailableDates = () => {
    const dates: string[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.now() + i * 86400000);
      const dayOfWeek = d.getDay();
      const bh = businessHours.find((h) => h.day_of_week === dayOfWeek);
      if (bh && bh.is_open) dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  };

  const primaryColor = pageSettings?.primary_color || '#10b981';
  const bgColor = pageSettings?.background_color || '#f8fafc';
  const btnRadius = pageSettings?.button_style === 'square' ? '8px' : '9999px';

  const steps: Step[] = ['service', ...(staffList.length > 0 ? ['staff'] as Step[] : []), 'date', 'time', 'info'];
  const currentStepIndex = steps.indexOf(step);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: bgColor }}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-3 border-muted-foreground/20 border-t-primary rounded-full animate-spin" style={{ borderTopColor: primaryColor }} />
          <p className="text-sm text-muted-foreground font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Calendar className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold mb-1">Empresa não encontrada</h2>
          <p className="text-muted-foreground text-sm">Verifique o link e tente novamente.</p>
        </div>
      </div>
    );
  }

  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: bgColor,
        fontFamily: pageSettings?.font_style === 'classic' ? 'Georgia, serif' : pageSettings?.font_style === 'playful' ? '"Comic Sans MS", cursive' : '"Plus Jakarta Sans", sans-serif',
      }}
    >
      <div className="max-w-lg mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8">
          {company.logo_url && (
            <img src={company.logo_url} alt="" className="h-16 w-16 rounded-2xl mx-auto mb-4 object-cover shadow-sm" />
          )}
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight" style={{ color: pageSettings?.secondary_color || '#0f172a' }}>
            {pageSettings?.title || company.name}
          </h1>
          {pageSettings?.subtitle && (
            <p className="text-muted-foreground mt-1.5 font-medium">{pageSettings.subtitle}</p>
          )}
          {pageSettings?.welcome_message && (
            <p className="text-sm text-muted-foreground/70 mt-2">{pageSettings.welcome_message}</p>
          )}
        </div>

        {/* Progress bar */}
        {step !== 'success' && (
          <div className="flex items-center gap-1.5 mb-8 px-4">
            {steps.map((s, i) => (
              <div
                key={s}
                className="flex-1 h-1.5 rounded-full transition-all duration-500"
                style={{ backgroundColor: i <= currentStepIndex ? primaryColor : '#e2e8f0' }}
              />
            ))}
          </div>
        )}

        <div className="page-transition">
          {/* Service selection */}
          {step === 'service' && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold px-1">Escolha o serviço</h2>
              {services.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedService(s);
                    setStep(staffList.length > 0 ? 'staff' : 'date');
                  }}
                  className="w-full text-left p-4 rounded-2xl border-2 border-transparent bg-white shadow-sm hover:shadow-md hover:border-current transition-all duration-200 group"
                  style={{ '--tw-border-opacity': 0.3 } as any}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: (s.color || primaryColor) + '15' }}>
                        <Sparkles className="h-4.5 w-4.5" style={{ color: s.color || primaryColor }} />
                      </div>
                      <div>
                        <p className="font-semibold">{s.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {s.duration} min{s.price ? ` · R$ ${Number(s.price).toFixed(2)}` : ''}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Staff selection */}
          {step === 'staff' && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold px-1">Escolha o profissional</h2>
              <button
                onClick={() => { setSelectedStaff(null); setStep('date'); }}
                className="w-full text-left p-4 rounded-2xl bg-white shadow-sm hover:shadow-md border-2 border-transparent transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                    <User className="h-4.5 w-4.5 text-muted-foreground" />
                  </div>
                  <p className="font-semibold">Sem preferência</p>
                </div>
              </button>
              {staffList.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setSelectedStaff(s); setStep('date'); }}
                  className="w-full text-left p-4 rounded-2xl bg-white shadow-sm hover:shadow-md border-2 border-transparent transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: primaryColor + '15' }}>
                      <span className="font-bold text-sm" style={{ color: primaryColor }}>
                        {s.name?.charAt(0)?.toUpperCase()}
                      </span>
                    </div>
                    <p className="font-semibold">{s.name}</p>
                  </div>
                </button>
              ))}
              <Button variant="ghost" onClick={() => setStep('service')} className="text-muted-foreground">
                <ArrowLeft className="h-4 w-4 mr-1.5" />Voltar
              </Button>
            </div>
          )}

          {/* Date selection */}
          {step === 'date' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold px-1">Escolha a data</h2>
              <div className="grid grid-cols-4 gap-2.5">
                {getAvailableDates().slice(0, 16).map((d) => {
                  const date = new Date(d + 'T12:00:00');
                  const isSelected = selectedDate === d;
                  return (
                    <button
                      key={d}
                      onClick={() => { setSelectedDate(d); setStep('time'); }}
                      className="p-3 rounded-2xl text-center transition-all duration-200 shadow-sm hover:shadow-md border-2"
                      style={{
                        borderColor: isSelected ? primaryColor : 'transparent',
                        backgroundColor: isSelected ? primaryColor + '10' : 'white',
                      }}
                    >
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase">{dayNames[date.getDay()]}</p>
                      <p className="text-xl font-extrabold mt-0.5">{date.getDate()}</p>
                      <p className="text-[11px] text-muted-foreground">{monthNames[date.getMonth()]}</p>
                    </button>
                  );
                })}
              </div>
              <Button variant="ghost" onClick={() => setStep(staffList.length > 0 ? 'staff' : 'service')} className="text-muted-foreground">
                <ArrowLeft className="h-4 w-4 mr-1.5" />Voltar
              </Button>
            </div>
          )}

          {/* Time selection */}
          {step === 'time' && (
            <div className="space-y-4">
              <div className="px-1">
                <h2 className="text-lg font-bold">Escolha o horário</h2>
                <p className="text-sm text-muted-foreground font-medium">
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
              {generateTimeSlots().length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-muted-foreground font-medium">Nenhum horário disponível</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                  {generateTimeSlots().map((t) => (
                    <button
                      key={t}
                      onClick={() => { setSelectedTime(t); setStep('info'); }}
                      className="p-3 rounded-xl bg-white shadow-sm hover:shadow-md border-2 border-transparent transition-all font-semibold text-sm hover:scale-[1.02]"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
              <Button variant="ghost" onClick={() => setStep('date')} className="text-muted-foreground">
                <ArrowLeft className="h-4 w-4 mr-1.5" />Voltar
              </Button>
            </div>
          )}

          {/* Client info */}
          {step === 'info' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold px-1">Seus dados</h2>

              <Card className="bg-white shadow-sm border-0 rounded-2xl overflow-hidden">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-3.5 w-3.5 flex-shrink-0" style={{ color: primaryColor }} />
                    <span className="font-semibold">{selectedService?.name}</span>
                  </div>
                  {selectedStaff && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{selectedStaff.name}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{selectedTime}</span>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2">
                <Label className="font-semibold text-sm">Nome *</Label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Seu nome completo" className="h-11 rounded-xl bg-white" />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold text-sm">WhatsApp *</Label>
                <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="(11) 99999-9999" className="h-11 rounded-xl bg-white" />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold text-sm">Observação</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" rows={2} className="rounded-xl bg-white" />
              </div>

              <Button
                onClick={handleSubmit}
                className="w-full h-12 font-semibold text-base shadow-md hover:shadow-lg transition-all"
                style={{ backgroundColor: primaryColor, borderRadius: btnRadius }}
                disabled={!clientName.trim() || !clientPhone.trim() || submitting}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Agendando...
                  </span>
                ) : (
                  'Confirmar agendamento'
                )}
              </Button>

              <Button variant="ghost" onClick={() => setStep('time')} className="text-muted-foreground">
                <ArrowLeft className="h-4 w-4 mr-1.5" />Voltar
              </Button>
            </div>
          )}

          {/* Success */}
          {step === 'success' && (
            <div className="text-center py-12 space-y-5 animate-scale-in">
              <div className="h-20 w-20 rounded-3xl mx-auto flex items-center justify-center shadow-lg" style={{ backgroundColor: primaryColor }}>
                <CheckCircle className="h-10 w-10 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold mb-1">Agendamento confirmado!</h2>
                <p className="text-muted-foreground font-medium">
                  {selectedService?.name} em {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR')} às {selectedTime}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">Você receberá uma confirmação por WhatsApp.</p>
              <Button
                onClick={() => {
                  setStep('service'); setSelectedService(null); setSelectedStaff(null);
                  setSelectedDate(''); setSelectedTime(''); setClientName(''); setClientPhone(''); setNotes('');
                }}
                variant="outline"
                className="font-semibold"
                style={{ borderRadius: btnRadius }}
              >
                Novo agendamento
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        {pageSettings?.cancellation_policy && step !== 'success' && (
          <p className="text-xs text-muted-foreground/60 mt-10 text-center leading-relaxed">{pageSettings.cancellation_policy}</p>
        )}
      </div>
    </div>
  );
}
