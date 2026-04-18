importScripts("utils/api.js");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "LOOKUP_WORD") {
    DictionaryAPI.lookup(message.word).then(sendResponse);
    return true; // keep the message channel open for async response
  }

  if (message.type === "PLAY_AUDIO") {
    playAudioViaOffscreen(message.url);
  }
});

// Cached promise so rapid back-to-back PLAY_AUDIO messages don't race on
// createDocument() — both calls await the same in-flight promise instead.
let offscreenReady = null;

async function ensureOffscreenDocument() {
  if (!offscreenReady) {
    offscreenReady = chrome.offscreen
      .hasDocument()
      .then((has) => {
        if (!has) {
          return chrome.offscreen.createDocument({
            url: "offscreen.html",
            reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
            justification:
              "Play word pronunciation audio from the dictionary API.",
          });
        }
      })
      .catch((err) => {
        offscreenReady = null; // reset so the next attempt can retry
        throw err;
      });
  }
  return offscreenReady;
}

async function playAudioViaOffscreen(url) {
  if (!url) return;
  try {
    await ensureOffscreenDocument();
    chrome.runtime.sendMessage({ type: "PLAY_AUDIO_OFFSCREEN", url });
  } catch (err) {
    console.error("Glimpse: audio playback failed", err);
  }
}
