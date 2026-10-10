import { ACCESSORIES, evaluateBadges } from './achievements.js';
import { toLocalDayKey } from './history.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const LONG_PRACTICE_MINUTES = 15;
const MONTH_FORMATTER = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const DAY_FORMATTER = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });

function requireElement(rootElement, selector) {
  const element = rootElement.querySelector(selector);
  if (element === null) {
    throw new Error(`Élément introuvable : ${selector}`);
  }
  return element;
}

// An accessory alone is hard to recognise, so accessory badges draw it on a small mascot.
export function createBadgeIcon(badge) {
  const symbolIds = badge.accessory === undefined ? [badge.icon] : ['mini-mascot', `accessory-${badge.accessory}`];
  const iconElement = document.createElementNS(SVG_NAMESPACE, 'svg');
  iconElement.setAttribute('viewBox', badge.accessory === undefined ? '0 0 24 24' : '0 0 100 100');
  iconElement.setAttribute('aria-hidden', 'true');
  for (const symbolId of symbolIds) {
    const useElement = document.createElementNS(SVG_NAMESPACE, 'use');
    useElement.setAttribute('href', `#${symbolId}`);
    iconElement.append(useElement);
  }
  return iconElement;
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function describePracticeMinutes(minutes) {
  const roundedMinutes = Math.max(1, Math.round(minutes));
  return roundedMinutes === 1 ? '1 minute' : `${roundedMinutes} minutes`;
}

export class ProgressView {
  #elements;
  #onToggleAccessory;
  #listenersController = new AbortController();
  #displayedMonth;
  #stats = null;
  #wornAccessory = null;

  constructor({ rootElement, onToggleAccessory }) {
    this.#elements = {
      monthLabel: requireElement(rootElement, '[data-calendar-month]'),
      calendarGrid: requireElement(rootElement, '[data-calendar-grid]'),
      previousMonthButton: requireElement(rootElement, '[data-calendar-previous]'),
      nextMonthButton: requireElement(rootElement, '[data-calendar-next]'),
      badgeGrid: requireElement(rootElement, '[data-badge-grid]'),
      currentStreak: requireElement(rootElement, '[data-record="streak"]'),
      longestStreak: requireElement(rootElement, '[data-record="longest"]'),
      totalMinutes: requireElement(rootElement, '[data-record="minutes"]'),
      totalSessions: requireElement(rootElement, '[data-record="sessions"]'),
    };
    this.#onToggleAccessory = onToggleAccessory;
    const today = new Date();
    this.#displayedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    this.#bindEvents();
  }

  render(stats, wornAccessory) {
    this.#stats = stats;
    this.#wornAccessory = wornAccessory;
    this.#renderRecords();
    this.#renderCalendar();
    this.#renderBadges();
  }

  destroy() {
    this.#listenersController.abort();
  }

  #bindEvents() {
    const { signal } = this.#listenersController;
    this.#elements.previousMonthButton.addEventListener('click', () => this.#shiftMonth(-1), { signal });
    this.#elements.nextMonthButton.addEventListener('click', () => this.#shiftMonth(1), { signal });
    // One delegated listener for every "wear" button, rather than one per badge.
    this.#elements.badgeGrid.addEventListener('click', (event) => {
      const wearButton = event.target.closest('[data-wear-accessory]');
      if (wearButton !== null) {
        this.#onToggleAccessory(wearButton.dataset.wearAccessory);
      }
    }, { signal });
  }

  #shiftMonth(monthOffset) {
    this.#displayedMonth = new Date(this.#displayedMonth.getFullYear(), this.#displayedMonth.getMonth() + monthOffset, 1);
    this.#renderCalendar();
  }

  #renderRecords() {
    const stats = this.#stats;
    this.#elements.currentStreak.textContent = String(stats.streakDays);
    this.#elements.longestStreak.textContent = String(stats.longestStreakDays);
    this.#elements.totalMinutes.textContent = String(stats.totalMinutes);
    this.#elements.totalSessions.textContent = String(stats.totalSessions);
  }

  #renderCalendar() {
    const year = this.#displayedMonth.getFullYear();
    const month = this.#displayedMonth.getMonth();
    const today = new Date();
    const todayKey = toLocalDayKey(today);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Weeks start on Monday, as in French calendars.
    const leadingBlankCount = (new Date(year, month, 1).getDay() + 6) % 7;

    const fragment = document.createDocumentFragment();
    for (let blankIndex = 0; blankIndex < leadingBlankCount; blankIndex += 1) {
      fragment.append(createTextElement('span', 'calendar__day calendar__day--blank', ''));
    }
    for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
      const date = new Date(year, month, dayNumber);
      const dayKey = toLocalDayKey(date);
      const practicedMinutes = this.#stats.minutesByDay.get(dayKey) ?? 0;
      const dayElement = createTextElement('span', 'calendar__day', String(dayNumber));
      dayElement.classList.toggle('is-practiced', practicedMinutes > 0);
      dayElement.classList.toggle('is-long', practicedMinutes >= LONG_PRACTICE_MINUTES);
      dayElement.classList.toggle('is-today', dayKey === todayKey);
      dayElement.setAttribute('role', 'listitem');
      dayElement.setAttribute('aria-label', practicedMinutes > 0
        ? `${DAY_FORMATTER.format(date)} : ${describePracticeMinutes(practicedMinutes)}`
        : DAY_FORMATTER.format(date));
      fragment.append(dayElement);
    }
    this.#elements.calendarGrid.replaceChildren(fragment);
    this.#elements.monthLabel.textContent = MONTH_FORMATTER.format(this.#displayedMonth);
    const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
    this.#elements.nextMonthButton.disabled = isCurrentMonth;
  }

  #renderBadges() {
    const fragment = document.createDocumentFragment();
    for (const badge of evaluateBadges(this.#stats)) {
      fragment.append(this.#createBadgeElement(badge));
    }
    this.#elements.badgeGrid.replaceChildren(fragment);
  }

  #createBadgeElement(badge) {
    const badgeElement = document.createElement('div');
    const iconWrapper = document.createElement('span');
    const hasAccessory = badge.accessory !== undefined;
    const isWorn = hasAccessory && badge.accessory === this.#wornAccessory;
    badgeElement.className = 'badge';
    badgeElement.setAttribute('role', 'listitem');
    badgeElement.classList.toggle('is-unlocked', badge.isUnlocked);
    badgeElement.classList.toggle('is-worn', isWorn);
    iconWrapper.className = 'badge__icon';
    iconWrapper.append(createBadgeIcon(badge));
    badgeElement.append(
      iconWrapper,
      createTextElement('span', 'badge__title', badge.title),
      createTextElement('span', 'badge__description', badge.description),
    );

    if (!badge.isUnlocked) {
      const progressElement = document.createElement('span');
      progressElement.className = 'badge__progress';
      progressElement.style.setProperty('--fill', String(badge.current / badge.target));
      progressElement.setAttribute('aria-label', `${badge.current} sur ${badge.target}`);
      badgeElement.append(progressElement, createTextElement('span', 'badge__count', `${badge.current} / ${badge.target}`));
    } else if (hasAccessory) {
      const wearButton = createTextElement('button', 'badge__wear', isWorn ? 'Retirer' : `Porter : ${ACCESSORIES[badge.accessory].toLowerCase()}`);
      wearButton.type = 'button';
      wearButton.dataset.wearAccessory = badge.accessory;
      wearButton.setAttribute('aria-pressed', String(isWorn));
      badgeElement.append(wearButton);
    }
    return badgeElement;
  }
}
