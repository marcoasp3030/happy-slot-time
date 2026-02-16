import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, Clock, CheckCircle, ArrowLeft, ArrowRight } from 'lucide-react';
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

  // Selections
  const [selectedService, setSelectedService] = useState<any>(null);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!slug) return;
    const fetch = async () => {
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
    fetch();
  }, [slug]);

  // Fetch appointments for selected date
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

      // Check minimum advance
      const slotDate = new Date(`${selectedDate}T${timeStr}:00`);
      const diffMin = (slotDate.getTime() - now.getTime()) / 60000;
      if (diffMin >= minAdvance) {
        // Check capacity
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

    if (error) { toast.error('Erro ao agendar. Tente novamente.'); return; }
    setStep('success');
  };

  // Generate next 30 days for date selection
  const getAvailableDates = () => {
    const dates: string[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.now() + i * 86400000);
      const dayOfWeek = d.getDay();
      const bh = businessHours.find((h) => h.day_of_week === dayOfWeek);
      if (bh && bh.is_open) {
        dates.push(d.toISOString().split('T')[0]);
      }
    }
    return dates;
  };

  const primaryColor = pageSettings?.primary_color || '#10b981';
  const bgColor = pageSettings?.background_color || '#ffffff';
  const btnRadius = pageSettings?.button_style === 'square' ? '4px' : '9999px';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: bgColor }}>
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Empresa não encontrada</p>
      </div>
    );
  }

  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  return (
    <div className="min-h-screen" style={{ backgroundColor: bgColor, fontFamily: pageSettings?.font_style === 'classic' ? 'Georgia, serif' : pageSettings?.font_style === 'playful' ? '"Comic Sans MS", cursive' : '"Plus Jakarta Sans", sans-serif' }}>
      <div className="max-w-lg mx-auto p-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          {company.logo_url && <img src={company.logo_url} alt="" className="h-16 w-16 rounded-xl mx-auto mb-3 object-cover" />}
          <h1 className="text-2xl font-bold" style={{ color: pageSettings?.secondary_color || '#0f172a' }}>
            {pageSettings?.title || company.name}
          </h1>
          {pageSettings?.subtitle && <p className="text-muted-foreground mt-1">{pageSettings.subtitle}</p>}
          {pageSettings?.welcome_message && <p className="text-sm text-muted-foreground mt-2">{pageSettings.welcome_message}</p>}
        </div>

        {/* Steps */}
        {step !== 'success' && (
          <div className="flex items-center justify-center gap-1 mb-6">
            {['service', 'date', 'time', 'info'].map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <div
                  className="h-2 w-8 rounded-full transition-all"
                  style={{ backgroundColor: ['service', 'staff', 'date', 'time', 'info'].indexOf(step) >= i ? primaryColor : '#e2e8f0' }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Service selection */}
        {step === 'service' && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Escolha o serviço</h2>
            {services.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedService(s);
                  setStep(staffList.length > 0 ? 'staff' : 'date');
                }}
                className="w-full text-left p-4 rounded-xl border border-border hover:border-current transition-all bg-card"
                style={{ '--tw-border-opacity': 1 } as any}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-sm text-muted-foreground">{s.duration} min{s.price ? ` · R$ ${Number(s.price).toFixed(2)}` : ''}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Staff selection */}
        {step === 'staff' && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Escolha o profissional</h2>
            <button
              onClick={() => { setSelectedStaff(null); setStep('date'); }}
              className="w-full text-left p-4 rounded-xl border border-border hover:border-current transition-all bg-card"
            >
              <p className="font-medium">Sem preferência</p>
            </button>
            {staffList.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSelectedStaff(s); setStep('date'); }}
                className="w-full text-left p-4 rounded-xl border border-border hover:border-current transition-all bg-card"
              >
                <p className="font-medium">{s.name}</p>
              </button>
            ))}
            <Button variant="ghost" onClick={() => setStep('service')}><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
          </div>
        )}

        {/* Date selection */}
        {step === 'date' && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Escolha a data</h2>
            <div className="grid grid-cols-4 gap-2">
              {getAvailableDates().slice(0, 16).map((d) => {
                const date = new Date(d + 'T12:00:00');
                return (
                  <button
                    key={d}
                    onClick={() => { setSelectedDate(d); setStep('time'); }}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      selectedDate === d ? 'border-2' : 'border-border hover:border-current bg-card'
                    }`}
                    style={selectedDate === d ? { borderColor: primaryColor, backgroundColor: primaryColor + '10' } : {}}
                  >
                    <p className="text-xs text-muted-foreground">{dayNames[date.getDay()]}</p>
                    <p className="text-lg font-bold">{date.getDate()}</p>
                    <p className="text-xs text-muted-foreground">{monthNames[date.getMonth()]}</p>
                  </button>
                );
              })}
            </div>
            <Button variant="ghost" onClick={() => setStep(staffList.length > 0 ? 'staff' : 'service')}><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
          </div>
        )}

        {/* Time selection */}
        {step === 'time' && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Escolha o horário</h2>
            <p className="text-sm text-muted-foreground">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            {generateTimeSlots().length === 0 ? (
              <p className="text-muted-foreground text-sm py-4">Nenhum horário disponível</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {generateTimeSlots().map((t) => (
                  <button
                    key={t}
                    onClick={() => { setSelectedTime(t); setStep('info'); }}
                    className="p-3 rounded-xl border border-border hover:border-current transition-all bg-card text-sm font-medium"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            <Button variant="ghost" onClick={() => setStep('date')}><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
          </div>
        )}

        {/* Client info */}
        {step === 'info' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Seus dados</h2>
            <Card className="bg-card border-border">
              <CardContent className="p-4 text-sm space-y-1">
                <p><strong>Serviço:</strong> {selectedService?.name}</p>
                {selectedStaff && <p><strong>Profissional:</strong> {selectedStaff.name}</p>}
                <p><strong>Data:</strong> {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                <p><strong>Horário:</strong> {selectedTime}</p>
              </CardContent>
            </Card>
            <div><Label>Nome *</Label><Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Seu nome completo" /></div>
            <div><Label>WhatsApp *</Label><Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="(11) 99999-9999" /></div>
            <div><Label>Observação</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" rows={2} /></div>
            <Button
              onClick={handleSubmit}
              className="w-full"
              style={{ backgroundColor: primaryColor, borderRadius: btnRadius }}
              disabled={!clientName.trim() || !clientPhone.trim()}
            >
              Confirmar agendamento
            </Button>
            <Button variant="ghost" onClick={() => setStep('time')}><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
          </div>
        )}

        {/* Success */}
        {step === 'success' && (
          <div className="text-center py-12 space-y-4">
            <div className="h-16 w-16 rounded-full mx-auto flex items-center justify-center" style={{ backgroundColor: primaryColor + '20' }}>
              <CheckCircle className="h-8 w-8" style={{ color: primaryColor }} />
            </div>
            <h2 className="text-xl font-bold">Agendamento confirmado!</h2>
            <p className="text-muted-foreground">
              {selectedService?.name} em {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR')} às {selectedTime}
            </p>
            <p className="text-sm text-muted-foreground">Você receberá uma confirmação por WhatsApp.</p>
            <Button
              onClick={() => { setStep('service'); setSelectedService(null); setSelectedStaff(null); setSelectedDate(''); setSelectedTime(''); setClientName(''); setClientPhone(''); setNotes(''); }}
              variant="outline"
              style={{ borderRadius: btnRadius }}
            >
              Novo agendamento
            </Button>
          </div>
        )}

        {/* Footer */}
        {pageSettings?.cancellation_policy && step !== 'success' && (
          <p className="text-xs text-muted-foreground mt-8 text-center">{pageSettings.cancellation_policy}</p>
        )}
      </div>
    </div>
  );
}
