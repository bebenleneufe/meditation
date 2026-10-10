// A web app cannot reliably wake a phone at a set time without a push server,
// but every calendar app can: the reminder is exported as a recurring event
// with an alarm, which the phone then delivers even when the app is closed.

const CALENDAR_LINE_BREAK = '\r\n';
// The format limits lines to 75 bytes; 60 characters leaves room for accented letters.
const MAXIMUM_LINE_CHARACTERS = 60;
const SESSION_LENGTH_MINUTES = 10;

let lastDownloadUrl = null;

function padTwoDigits(value) {
  return String(value).padStart(2, '0');
}

// No time zone suffix on purpose: a "floating" time stays at 8:00 wherever the phone travels.
function formatLocalDateTime(date) {
  return `${date.getFullYear()}${padTwoDigits(date.getMonth() + 1)}${padTwoDigits(date.getDate())}`
    + `T${padTwoDigits(date.getHours())}${padTwoDigits(date.getMinutes())}00`;
}

function formatUtcTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeCalendarText(text) {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function foldLine(line) {
  const segments = [];
  for (let index = 0; index < line.length; index += MAXIMUM_LINE_CHARACTERS) {
    segments.push(line.slice(index, index + MAXIMUM_LINE_CHARACTERS));
  }
  return segments.join(`${CALENDAR_LINE_BREAK} `);
}

export function isValidReminderTime(candidate) {
  return typeof candidate === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(candidate);
}

export function buildDailyReminderCalendar({ reminderTime, appUrl, now = new Date() }) {
  const [hours, minutes] = reminderTime.split(':').map(Number);
  const firstOccurrence = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
  if (firstOccurrence <= now) {
    firstOccurrence.setDate(firstOccurrence.getDate() + 1);
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pleine conscience//Rappel quotidien//FR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:rappel-${formatUtcTimestamp(now)}@pleine-conscience`,
    `DTSTAMP:${formatUtcTimestamp(now)}`,
    `DTSTART:${formatLocalDateTime(firstOccurrence)}`,
    `DURATION:PT${SESSION_LENGTH_MINUTES}M`,
    'RRULE:FREQ=DAILY',
    `SUMMARY:${escapeCalendarText('Un moment de pleine conscience')}`,
    `DESCRIPTION:${escapeCalendarText(`Ouvrez l'appli Pleine conscience : ${appUrl}`)}`,
    `URL:${appUrl}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeCalendarText("C'est l'heure de votre pause méditation")}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join(CALENDAR_LINE_BREAK) + CALENDAR_LINE_BREAK;
}

export function downloadCalendarFile(calendarText, fileName) {
  // The previous file's URL is released here rather than with a timer:
  // the browser may still be reading it right after the click.
  if (lastDownloadUrl !== null) {
    URL.revokeObjectURL(lastDownloadUrl);
  }
  lastDownloadUrl = URL.createObjectURL(new Blob([calendarText], { type: 'text/calendar;charset=utf-8' }));
  const downloadLink = document.createElement('a');
  downloadLink.href = lastDownloadUrl;
  downloadLink.download = fileName;
  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();
}
