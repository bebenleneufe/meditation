export function formatClock(totalSeconds) {
  const clampedSeconds = Math.max(0, totalSeconds);
  const minutes = String(Math.floor(clampedSeconds / 60)).padStart(2, '0');
  const seconds = String(clampedSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function describeDuration(totalSeconds) {
  const roundedMinutes = Math.round(totalSeconds / 60);
  if (roundedMinutes < 1) {
    return "moins d'une minute";
  }
  return roundedMinutes === 1 ? '1 minute' : `${roundedMinutes} minutes`;
}
