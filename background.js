importScripts("utils/api.js");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "LOOKUP_WORD") {
    DictionaryAPI.lookup(message.word).then(sendResponse);
    return true; // keep the message channel open for async response
  }
});
