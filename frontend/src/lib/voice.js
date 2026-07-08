// Voice announcements for "avant de partir" recommendations, via the
// browser's built-in Web Speech API (SpeechSynthesis) — free, no backend
// key, no recurring cost. Matches the app's existing "degrade gracefully
// without external keys" philosophy (see backend/ai.py, backend/routing.py):
// unsupported browsers just get no voice instead of an error.
const STORAGE_KEY = "routepulse_voice_enabled";

export const isVoiceSupported = () =>
  typeof window !== "undefined" && "speechSynthesis" in window;

// On by default so the feature is actually heard during a demo; a listener
// (jury, user) can mute it via the toggle, which is remembered from then on.
export const isVoiceEnabled = () => {
  if (!isVoiceSupported()) return false;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === "true";
};

export const setVoiceEnabled = (enabled) => {
  window.localStorage.setItem(STORAGE_KEY, String(enabled));
  if (!enabled) stopSpeaking();
};

export const stopSpeaking = () => {
  if (isVoiceSupported()) window.speechSynthesis.cancel();
};

// iOS Safari (and some Android browsers) only grant SpeechSynthesis a "user
// activation" window tied to the synchronous portion of the gesture that
// triggered it. Our real speak() call happens after an `await` on a route-
// scan network request, by which point that window has closed — the browser
// silently drops the utterance with no error. Call this synchronously at the
// very top of the click handler, before any `await`, to keep the gesture's
// activation alive so the later speak() call still works on mobile.
export const primeSpeech = () => {
  if (!isVoiceSupported() || !isVoiceEnabled()) return;
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
};

// Speaks french text aloud. Cancels any announcement already in progress
// first so a second route scan doesn't queue up and talk over the first.
export const speak = (text) => {
  if (!text || !isVoiceSupported() || !isVoiceEnabled()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "fr-FR";
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
};
