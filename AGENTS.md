# Project Context - `glimpse-ext`

Chrome extension that shows instant word definitions on text highlight, powered by the Free Dictionary API.

## Stack

- **Extension standard:** Manifest V3
- **Language:** Vanilla JavaScript & CSS — no frameworks, no build step, no package manager
- **API:** [Free Dictionary API](https://dictionaryapi.dev/) — no key required
- **Isolation:** Shadow DOM (popup styles are fully isolated from the host page)

## Project Structure

```text
glimpse-ext/
├── manifest.json       # Extension config (Manifest V3)
├── background.js       # Service worker — receives messages, proxies API calls
├── content.js          # Content script — word selection, popup lifecycle & rendering
├── offscreen.html      # Offscreen document shell (loaded by background for audio playback)
├── offscreen.js        # Offscreen document — plays pronunciation audio outside host-page CSP
├── popup/
│   ├── popup.html      # Toolbar popup UI (shown when clicking the extension icon)
│   └── popup.js        # Toolbar popup logic — version display and theme toggle
├── utils/
│   └── api.js          # DictionaryAPI object — fetch + normalize API responses
└── icons/              # Extension icons (16, 48, 128px)
```

## How It Works

1. `content.js` runs on every page (`<all_urls>`), listening for `mouseup` events.
2. On mouseup, it validates the selected text (letters/apostrophes/hyphens only, ≤50 chars), then shows a loading popup immediately.
3. It sends a `LOOKUP_WORD` message to `background.js` (the service worker).
4. `background.js` calls `DictionaryAPI.lookup()` from `utils/api.js` and returns the normalized result.
5. `content.js` receives the response and re-renders the popup with the definition (or an error).

## Message Passing

| Type                  | Direction                  | Payload         | Response                                                |
| --------------------- | -------------------------- | --------------- | ------------------------------------------------------- |
| `LOOKUP_WORD`         | content → background       | `{ word: str }` | `{ word, phonetic, audioUrl, meanings }` or `{ error }` |
| `PLAY_AUDIO`          | content → background       | `{ url: str }`  | none                                                    |
| `PLAY_AUDIO_OFFSCREEN`| background → offscreen doc | `{ url: str }`  | none                                                    |

`background.js` returns `true` from `onMessage` to keep the channel open for async responses.

## API Response Shape (`DictionaryAPI.normalize`)

```js
// Success
{ word: string, phonetic: string|null, audioUrl: string|null, meanings: [{ partOfSpeech, definitions: [{ definition, example|null }] }] }

// Error
{ error: string }
```

`normalize()` caps meanings at **2 definitions per part of speech** (`.slice(0, 2)`).

## Conventions

- No build step — load unpacked directly from the repo root in Chrome Developer mode
- All files use plain JS with no imports/exports (Manifest V3 service workers use `importScripts`; content scripts are IIFE-wrapped)
- `utils/api.js` is loaded in `background.js` via `importScripts("utils/api.js")` and exposes a global `DictionaryAPI` object
- `content.js` is wrapped in an IIFE (`(() => { ... })()`) to avoid polluting the global scope of host pages
- All user-generated strings rendered into HTML go through `escapeHtml()` (creates a temporary `div`, sets `textContent`, reads `innerHTML`) — do not bypass this

## Loading the Extension

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked** and select the `glimpse-ext` folder
4. After any code change, click the refresh icon on the extension card — content scripts require a page reload to take effect

## Gotchas

- **No build step** — there is no `npm install`, no bundler, and no compiled output. All source files are the extension files.
- **Shadow DOM is closed** — `popupHost.attachShadow({ mode: "closed" })`. The shadow root is not accessible from outside `content.js`; do not attempt to query it from other scripts.
- **Popup positioning accounts for viewport edges** — `positionPopup()` adjusts left/top to prevent the popup from clipping off the right side or bottom of the viewport. Keep this logic intact when changing popup dimensions.
- **Word validation is strict** — `isValidWord` only accepts `[a-zA-Z'-]` with a max length of 50. Multi-word selections and non-English text are intentionally ignored.
- **Service worker scope** — `background.js` cannot access the DOM. `utils/api.js` uses `fetch` (available in service workers), not any browser UI API.
- **Toolbar popup (`popup/`) is informational + settings** — it displays the extension name, version, and a theme toggle. It does not interact with the content script or background worker directly, but shares the theme preference via `chrome.storage.sync`.
- **Theme preference** — stored in `chrome.storage.sync` under the key `"theme"` (`"dark"` or `"light"`). Dark is the default. Both the content script popup and the toolbar popup read/write this key, so changes in either take effect everywhere.
- **Audio pronunciation** — `DictionaryAPI.normalize()` surfaces an `audioUrl` from the API's `phonetics` array. `content.js` renders a play button and sends a `PLAY_AUDIO` message to `background.js`, which delegates to an offscreen document. Do **not** call `new Audio().play()` directly from `content.js` — host pages' CSPs block media from external domains, and content scripts are subject to them.
- **Popup host positioning** — `popupHost.style.position` must be set to `"absolute"` *before* appending to the DOM. As a block element, an unstyled host div stretches to the body width; measuring it with `getBoundingClientRect()` while still `position: static` returns the full page width, causing the right-edge guard to snap the popup to the left edge of the screen.
