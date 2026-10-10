// localStorage can throw (private browsing, quota, disabled storage):
// the app must keep working without persistence rather than crash.

export function readJson(storageKey, fallbackValue) {
  try {
    const serializedValue = window.localStorage.getItem(storageKey);
    return serializedValue === null ? fallbackValue : JSON.parse(serializedValue);
  } catch (error) {
    console.warn(`Lecture impossible de « ${storageKey} »`, error);
    return fallbackValue;
  }
}

export function writeJson(storageKey, value) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`Écriture impossible de « ${storageKey} »`, error);
    return false;
  }
}
