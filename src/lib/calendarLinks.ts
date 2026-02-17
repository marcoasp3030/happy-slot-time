/**
 * Generate "Add to Calendar" links (Outlook, Google) and .ics file downloads.
 * No API keys required.
 */

interface CalendarEvent {
  title: string;
  description?: string;
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  location?: string;
}

function toUTCDatetime(date: string, time: string): string {
  // Create local datetime and convert to UTC format for calendar links
  const dt = new Date(`${date}T${time}:00`);
  return dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function toICSDatetime(date: string, time: string): string {
  // Local datetime in ICS format (DTSTART;TZID=America/Sao_Paulo)
  return `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
}

export function generateGoogleCalendarLink(event: CalendarEvent): string {
  const start = toUTCDatetime(event.startDate, event.startTime);
  const end = toUTCDatetime(event.startDate, event.endTime);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${end}`,
    details: event.description || '',
    location: event.location || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function generateOutlookCalendarLink(event: CalendarEvent): string {
  const start = `${event.startDate}T${event.startTime}:00`;
  const end = `${event.startDate}T${event.endTime}:00`;
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: start,
    enddt: end,
    body: event.description || '',
    location: event.location || '',
  });
  return `https://outlook.live.com/calendar/0/action/compose?${params.toString()}`;
}

export function downloadICSFile(event: CalendarEvent): void {
  const uid = `${Date.now()}@slotera.app`;
  const dtstart = toICSDatetime(event.startDate, event.startTime);
  const dtend = toICSDatetime(event.startDate, event.endTime);
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Slotera//Agendamento//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART;TZID=America/Sao_Paulo:${dtstart}`,
    `DTEND;TZID=America/Sao_Paulo:${dtend}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${(event.description || '').replace(/\n/g, '\\n')}`,
    `LOCATION:${event.location || ''}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'agendamento.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
