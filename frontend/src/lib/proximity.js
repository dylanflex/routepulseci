// Proximity-alert bookkeeping.
//
// When someone reports an incident, every user whose live position is within
// PROXIMITY_RADIUS_M of it gets a notification asking them to confirm the alert.
// Two small localStorage-backed sets keep that honest and non-spammy:
//   * self-reported ids — you never get a confirm request for your own report.
//   * notified ids       — a given incident alerts you at most once, even across
//                          reloads/polls.
// Only genuinely fresh reports fire (see ALERT_MAX_AGE_MS), so opening the app
// never dumps the whole active backlog on you.

export const PROXIMITY_RADIUS_M = 1000;
export const ALERT_MAX_AGE_MS = 15 * 60 * 1000;

const SELF_KEY = "routepulse_self_reports";
const NOTIFIED_KEY = "routepulse_notified_alerts";
const MAX_IDS = 200; // keep the sets bounded

function readSet(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(raw) ? new Set(raw) : new Set();
  } catch {
    return new Set();
  }
}

function writeSet(key, set) {
  try {
    // Keep only the most recent MAX_IDS to avoid unbounded growth.
    const arr = [...set].slice(-MAX_IDS);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch {
    /* private mode — proximity alerts just won't dedupe across reloads */
  }
}

export function markSelfReported(id) {
  if (!id) return;
  const set = readSet(SELF_KEY);
  set.add(id);
  writeSet(SELF_KEY, set);
}

export function isSelfReported(id) {
  return readSet(SELF_KEY).has(id);
}

export function wasNotified(id) {
  return readSet(NOTIFIED_KEY).has(id);
}

export function markNotified(id) {
  if (!id) return;
  const set = readSet(NOTIFIED_KEY);
  set.add(id);
  writeSet(NOTIFIED_KEY, set);
}
