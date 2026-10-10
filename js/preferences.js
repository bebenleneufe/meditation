import { readJson, writeJson } from './storage.js';

const PREFERENCES_KEY = 'meditation.preferences.v1';

export const DEFAULT_PREFERENCES = Object.freeze({
  meditationId: 'pause-respiration',
  durationMinutes: 10,
  intervalMinutes: 0,
  breathingGuideEnabled: true,
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
  return sanitizedPreferences;
}

export function loadPreferences() {
  return { ...DEFAULT_PREFERENCES, ...sanitizePreferences(readJson(PREFERENCES_KEY, null)) };
}

export function savePreferences(preferences) {
  writeJson(PREFERENCES_KEY, preferences);
}
