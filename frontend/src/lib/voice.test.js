import { isVoiceSupported, isVoiceEnabled, setVoiceEnabled, speak, stopSpeaking } from "@/lib/voice";

// jsdom ships neither SpeechSynthesis nor SpeechSynthesisUtterance — stand in
// with minimal fakes so the module's browser-API calls are exercised.
beforeEach(() => {
  window.localStorage.clear();
  window.speechSynthesis = { cancel: jest.fn(), speak: jest.fn() };
  window.SpeechSynthesisUtterance = jest.fn().mockImplementation((text) => ({ text }));
});

afterEach(() => {
  delete window.speechSynthesis;
  delete window.SpeechSynthesisUtterance;
});

test("is supported when the browser exposes speechSynthesis", () => {
  expect(isVoiceSupported()).toBe(true);
  delete window.speechSynthesis;
  expect(isVoiceSupported()).toBe(false);
});

test("is enabled by default so the feature is actually heard on first use", () => {
  expect(isVoiceEnabled()).toBe(true);
});

test("setVoiceEnabled persists the choice and stops any speech on mute", () => {
  setVoiceEnabled(false);
  expect(isVoiceEnabled()).toBe(false);
  expect(window.speechSynthesis.cancel).toHaveBeenCalled();

  setVoiceEnabled(true);
  expect(isVoiceEnabled()).toBe(true);
});

test("speak() cancels any prior utterance and speaks in French", () => {
  speak("Voie libre. Bonne route !");
  expect(window.speechSynthesis.cancel).toHaveBeenCalled();
  expect(window.SpeechSynthesisUtterance).toHaveBeenCalledWith("Voie libre. Bonne route !");
  expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
});

test("speak() is a silent no-op when muted", () => {
  setVoiceEnabled(false);
  window.speechSynthesis.cancel.mockClear();
  speak("Ne dis rien");
  expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
});

test("speak() is a silent no-op with empty text", () => {
  speak("");
  expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
});

test("stopSpeaking() cancels ongoing speech", () => {
  stopSpeaking();
  expect(window.speechSynthesis.cancel).toHaveBeenCalled();
});
