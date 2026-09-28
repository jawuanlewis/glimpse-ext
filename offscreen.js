// Offscreen document — runs in the extension's context (not the host page),
// so audio playback is not subject to the host page's Content Security Policy.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PLAY_AUDIO_OFFSCREEN" && message.url) {
    // Report whether playback started so background.js can fall back to
    // text-to-speech if the file is missing or can't be decoded.
    new Audio(message.url).play().then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false }),
    );
    return true; // keep the message channel open for async response
  }
});
