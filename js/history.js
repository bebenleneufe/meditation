import { readJson, writeJson } from './storage.js';

const SESSIONS_KEY = 'meditation.sessions.v1';

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
function toLocalDayKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function computeStreakDays(sessions, today) {
  const practicedDays = new Set(sessions.map((session) => toLocalDayKey(new Date(session.completedAt))));
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

export class SessionHistory {
  #sessions = loadSessions();

  record(durationSeconds, completedAt = new Date()) {
    this.#sessions = [...this.#sessions, { durationSeconds, completedAt: completedAt.toISOString() }];
    writeJson(SESSIONS_KEY, this.#sessions);
  }

  getStats(today = new Date()) {
    const totalSeconds = this.#sessions.reduce((sum, session) => sum + session.durationSeconds, 0);
    return {
      totalSessions: this.#sessions.length,
      totalMinutes: Math.round(totalSeconds / 60),
      streakDays: computeStreakDays(this.#sessions, today),
    };
  }
}
