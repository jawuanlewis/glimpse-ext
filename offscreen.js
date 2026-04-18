// Offscreen document — runs in the extension's context (not the host page),
// so audio playback is not subject to the host page's Content Security Policy.
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "PLAY_AUDIO_OFFSCREEN" && message.url) {
    new Audio(message.url).play();
  }
});
