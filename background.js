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

async function playAudioViaOffscreen(url) {
  // Offscreen documents play audio outside the host page's CSP.
  const hasDoc = await chrome.offscreen.hasDocument();
  if (!hasDoc) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: "Play word pronunciation audio from the dictionary API.",
    });
  }
  chrome.runtime.sendMessage({ type: "PLAY_AUDIO_OFFSCREEN", url });
}
