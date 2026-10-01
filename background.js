importScripts("utils/api.js");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "LOOKUP_WORD") {
    DictionaryAPI.lookup(message.word).then(sendResponse);
    return true; // keep the message channel open for async response
  }

  if (message.type === "PLAY_AUDIO") {
    playPronunciation(message.word);
  }
});

// Reflect the enabled/disabled state on the toolbar icon so it's obvious at a
// glance that Glimpse is off, without needing to open the popup.
function updateBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: "#999999" });
}

chrome.storage.sync.get("enabled", (result) => {
  updateBadge(result.enabled !== false);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.enabled) {
    updateBadge(changes.enabled.newValue !== false);
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
              "Play word pronunciation recordings from Wiktionary.",
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

// Play a human recording from Wiktionary when one exists; otherwise (or if
// playback fails) fall back to Chrome's built-in text-to-speech, so every
// word gets a pronunciation.
async function playPronunciation(word) {
  if (typeof word !== "string" || !word || word.length > 50) return;

  let url = null;
  try {
    url = await DictionaryAPI.findAudioUrl(word);
  } catch (err) {
    console.warn("Glimpse: audio lookup failed, using text-to-speech", err);
  }

  if (url && (await playAudioViaOffscreen(url))) return;
  chrome.tts.speak(word, { lang: "en-US" });
}

// Resolves true once playback has started, false if it couldn't.
async function playAudioViaOffscreen(url) {
  try {
    await ensureOffscreenDocument();
    const response = await chrome.runtime.sendMessage({
      type: "PLAY_AUDIO_OFFSCREEN",
      url,
    });
    return response?.ok === true;
  } catch (err) {
    console.error("Glimpse: audio playback failed", err);
    return false;
  }
}
