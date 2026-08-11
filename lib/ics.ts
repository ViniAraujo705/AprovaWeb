import type { RecordingEvent } from './types'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toIcsDate(iso: string): string {
  const d = new Date(iso)
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

// RFC5545 exige quebra de linha após 75 octetos, com continuação indentada por um espaço.
function foldLine(line: string): string {
  if (line.length <= 75) return line
  let result = line.slice(0, 75)
  let rest = line.slice(75)
  while (rest.length > 0) {
    result += '\r\n ' + rest.slice(0, 74)
    rest = rest.slice(74)
  }
  return result
}

/** Gera o conteúdo de um arquivo .ics (iCalendar) a partir da escala de gravações, pra importar em Google Calendar, Apple Calendar, Outlook etc. */
export function buildIcs(events: RecordingEvent[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aprova//Agenda//PT-BR', 'CALSCALE:GREGORIAN']
  const now = toIcsDate(new Date().toISOString())
  for (const ev of events) {
    const start = toIcsDate(ev.startAt)
    const end = ev.endAt
      ? toIcsDate(ev.endAt)
      : toIcsDate(new Date(new Date(ev.startAt).getTime() + 60 * 60 * 1000).toISOString())
    const descriptionParts = [
      ev.clientName ? `Cliente: ${ev.clientName}` : null,
      ev.crew.length ? `Equipe: ${ev.crew.map((c) => c.name).join(', ')}` : null,
      ev.notes,
    ].filter((p): p is string => !!p)

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${ev.id}@aprova`)
    lines.push(`DTSTAMP:${now}`)
    lines.push(`DTSTART:${start}`)
    lines.push(`DTEND:${end}`)
    lines.push(`SUMMARY:${escapeIcsText(ev.title)}`)
    if (descriptionParts.length) {
      lines.push(`DESCRIPTION:${escapeIcsText(descriptionParts.join('\n'))}`)
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n')
}

export function downloadIcs(events: RecordingEvent[], filename: string) {
  const content = buildIcs(events)
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
