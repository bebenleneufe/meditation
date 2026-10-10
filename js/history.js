import { readJson, writeJson } from './storage.js';

const SESSIONS_KEY = 'meditation.sessions.v1';
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const EARLY_SESSION_HOUR = 8;
const LATE_SESSION_HOUR = 22;

function isValidSession(candidate) {
  return candidate !== null
    && typeof candidate === 'object'
    && typeof candidate.durationSeconds === 'number'
    && typeof candidate.completedAt === 'string'
    && !Number.isNaN(Date.parse(candidate.completedAt));
}

function loadSessions() {
  const storedSessions = readJson(SESSIONS_KEY, []);
  return Array.isArray(storedSessions) ? storedSessions.filter(isValidSession) : [];
}

// Local calendar day, not UTC: a session at 23:30 must count for "today".
export function toLocalDayKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function computeCurrentStreak(practicedDays, today) {
  const cursorDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // Not having meditated *yet* today shouldn't break yesterday's streak.
  if (!practicedDays.has(toLocalDayKey(cursorDate))) {
    cursorDate.setDate(cursorDate.getDate() - 1);
  }

  let streakDays = 0;
  while (practicedDays.has(toLocalDayKey(cursorDate))) {
    streakDays += 1;
    cursorDate.setDate(cursorDate.getDate() - 1);
  }
  return streakDays;
}

// Days are compared at local noon so a daylight-saving change never turns one day into 0.96 or 1.04.
function dayKeyToNoon(dayKey) {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12).getTime();
}

function computeLongestStreak(practicedDays) {
  const sortedDays = [...practicedDays].sort().map(dayKeyToNoon);
  let longestStreak = 0;
  let currentRun = 0;
  sortedDays.forEach((dayTimestamp, dayIndex) => {
    const isConsecutive = dayIndex > 0 && Math.round((dayTimestamp - sortedDays[dayIndex - 1]) / MILLISECONDS_PER_DAY) === 1;
    currentRun = isConsecutive ? currentRun + 1 : 1;
    longestStreak = Math.max(longestStreak, currentRun);
  });
  return longestStreak;
}

export class SessionHistory {
  #sessions = loadSessions();

  record({ durationSeconds, meditationId, completedAt = new Date() }) {
    this.#sessions = [...this.#sessions, { durationSeconds, meditationId, completedAt: completedAt.toISOString() }];
    writeJson(SESSIONS_KEY, this.#sessions);
  }

  getStats(today = new Date()) {
    const minutesByDay = new Map();
    const meditationIds = new Set();
    let totalSeconds = 0;
    let hasEarlySession = false;
    let hasLateSession = false;

    for (const session of this.#sessions) {
      const completedAt = new Date(session.completedAt);
      const dayKey = toLocalDayKey(completedAt);
      minutesByDay.set(dayKey, (minutesByDay.get(dayKey) ?? 0) + session.durationSeconds / 60);
      totalSeconds += session.durationSeconds;
      if (typeof session.meditationId === 'string') {
        meditationIds.add(session.meditationId);
      }
      // The start time decides "early" or "late", not the end time.
      const startHour = new Date(completedAt.getTime() - session.durationSeconds * 1000).getHours();
      hasEarlySession ||= startHour < EARLY_SESSION_HOUR && startHour >= 4;
      hasLateSession ||= startHour >= LATE_SESSION_HOUR;
    }

    const practicedDays = new Set(minutesByDay.keys());
    return {
      totalSessions: this.#sessions.length,
      totalMinutes: Math.round(totalSeconds / 60),
      streakDays: computeCurrentStreak(practicedDays, today),
      longestStreakDays: computeLongestStreak(practicedDays),
      minutesByDay,
      distinctMeditationCount: meditationIds.size,
      hasEarlySession,
      hasLateSession,
    };
  }
}
