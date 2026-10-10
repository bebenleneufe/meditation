import { readJson, writeJson } from './storage.js';
import { isKnownAmbience } from './ambience.js';
import { isValidReminderTime } from './reminder.js';
import { isKnownAccessory } from './achievements.js';

const PREFERENCES_KEY = 'meditation.preferences.v1';

export const DEFAULT_PREFERENCES = Object.freeze({
  meditationId: 'pause-respiration',
  durationMinutes: 10,
  intervalMinutes: 0,
  breathingGuideEnabled: true,
  ambienceId: 'nappe',
  ambienceVolume: 0.5,
  reminderTime: '08:00',
  wornAccessory: null,
});

function isPositiveNumber(candidate) {
  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0;
}

function isNonEmptyString(candidate) {
  return typeof candidate === 'string' && candidate !== '';
}

function sanitizePreferences(storedPreferences) {
  const sanitizedPreferences = {};
  if (storedPreferences === null || typeof storedPreferences !== 'object') {
    return sanitizedPreferences;
  }
  if (isNonEmptyString(storedPreferences.meditationId)) {
    sanitizedPreferences.meditationId = storedPreferences.meditationId;
  }
  if (isPositiveNumber(storedPreferences.durationMinutes)) {
    sanitizedPreferences.durationMinutes = storedPreferences.durationMinutes;
  }
  if (typeof storedPreferences.intervalMinutes === 'number' && storedPreferences.intervalMinutes >= 0) {
    sanitizedPreferences.intervalMinutes = storedPreferences.intervalMinutes;
  }
  if (typeof storedPreferences.breathingGuideEnabled === 'boolean') {
    sanitizedPreferences.breathingGuideEnabled = storedPreferences.breathingGuideEnabled;
  }
  if (isKnownAmbience(storedPreferences.ambienceId)) {
    sanitizedPreferences.ambienceId = storedPreferences.ambienceId;
  }
  if (typeof storedPreferences.ambienceVolume === 'number'
    && storedPreferences.ambienceVolume >= 0
    && storedPreferences.ambienceVolume <= 1) {
    sanitizedPreferences.ambienceVolume = storedPreferences.ambienceVolume;
  }
  if (isValidReminderTime(storedPreferences.reminderTime)) {
    sanitizedPreferences.reminderTime = storedPreferences.reminderTime;
  }
  if (isKnownAccessory(storedPreferences.wornAccessory)) {
    sanitizedPreferences.wornAccessory = storedPreferences.wornAccessory;
  }
  return sanitizedPreferences;
}

export function loadPreferences() {
  return { ...DEFAULT_PREFERENCES, ...sanitizePreferences(readJson(PREFERENCES_KEY, null)) };
}

export function savePreferences(preferences) {
  writeJson(PREFERENCES_KEY, preferences);
}
