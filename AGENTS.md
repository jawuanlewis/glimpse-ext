# Project Context - `glimpse-ext`

Chrome extension that shows instant word definitions on text highlight, powered by Wiktionary data via FreeDictionaryAPI.com.

## Stack

- **Extension standard:** Manifest V3
- **Language:** Vanilla JavaScript & CSS — no frameworks, no build step. pnpm is used only for dev tooling (Prettier)
- **APIs (all keyless):** [FreeDictionaryAPI.com](https://freedictionaryapi.com/) (primary), Wiktionary REST `page/definition` (fallback), Wiktionary Action API (pronunciation recordings)
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
│   └── popup.js        # Toolbar popup logic — version display, enabled toggle, theme toggle
├── utils/
│   └── api.js          # DictionaryAPI object — lookup w/ fallback, normalize, audio lookup
└── icons/              # Extension icons (16, 48, 128px)
```

## How It Works

1. `content.js` runs on every page (`<all_urls>`), listening for `mouseup` events.
2. On mouseup, it validates the selected text (letters/apostrophes/hyphens only, ≤50 chars) and sends a `LOOKUP_WORD` message to `background.js` (the service worker). No loading popup is shown — the popup only appears once a response comes back (a loading state existed pre-v1.1.0 and was intentionally removed; do not re-add this line without also re-adding that UI).
3. `background.js` calls `DictionaryAPI.lookup()` from `utils/api.js` and returns the normalized result.
4. `content.js` receives the response and creates the popup, rendering the definition (or an error).

## Message Passing

| Type                   | Direction                  | Payload         | Response                                                         |
| ---------------------- | -------------------------- | --------------- | ---------------------------------------------------------------- |
| `LOOKUP_WORD`          | content → background       | `{ word: str }` | `{ word, phonetic, meanings, source }` or `{ error, errorType }` |
| `PLAY_AUDIO`           | content → background       | `{ word: str }` | none                                                             |
| `PLAY_AUDIO_OFFSCREEN` | background → offscreen doc | `{ url: str }`  | `{ ok: bool }` (whether playback started)                        |

`background.js` returns `true` from `onMessage` to keep the channel open for async responses.

## API Response Shape (`normalizePrimary` / `normalizeFallback`)

```js
// Success
{ word: string, phonetic: string|null, meanings: [{ partOfSpeech, definitions: [{ definition, example|null }] }], source: { url, via: string|null } }

// Error
{ error: string, errorType: "not-found" | "timeout" | "service" | "network" }
```

Both normalizers go through `mergeMeanings()`, which merges entries sharing a part of speech (Wiktionary splits words by etymology — e.g. "run" has two verb entries) and caps each at **2 definitions** (`MAX_DEFINITIONS`). `pickExample()` deliberately skips multi-line quotations, citation lines (starting with a year or containing `[…]`), and anything over 120 chars — Wiktionary mixes these with simple examples.

`request()` aborts via `AbortController` and maps failures to an `errorType` — `content.js`'s `renderDefinition` uses this to pick the popup header (`"Not found"`, `"Timed out"`, `"Service unavailable"`, `"Connection error"`) so a slow/unreachable API doesn't get mislabeled as a missing word.

## Conventions

- No build step — load unpacked directly from the repo root in Chrome Developer mode
- All files use plain JS with no imports/exports (Manifest V3 service workers use `importScripts`; content scripts are IIFE-wrapped)
- `utils/api.js` is loaded in `background.js` via `importScripts("utils/api.js")` and exposes a global `DictionaryAPI` object
- `content.js` is wrapped in an IIFE (`(() => { ... })()`) to avoid polluting the global scope of host pages
- All user-generated strings rendered into HTML go through `escapeHtml()` (creates a temporary `div`, sets `textContent`, reads `innerHTML`) — do not bypass this
- **Formatter:** Prettier (`pnpm format`). Run before committing. Config in `.prettierrc`; `node_modules/` and `icons/` are ignored. `pnpm format:check` can be used to verify without writing.

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
- **Enabled/disabled state** — stored in `chrome.storage.sync` under the key `"enabled"` (boolean). Absent/`true` means enabled — treat as `!== false` when reading, never `=== true`, so existing installs without the key default to on. The toolbar popup's switch writes this key; `content.js` reads it at load and via `storage.onChanged` to gate the `mouseup` listener and to tear down any open popup the moment it's flipped off. `background.js` also listens for this key to mirror it onto the toolbar icon via `chrome.action.setBadgeText` (`"OFF"` when disabled, cleared when enabled).
- **Audio pronunciation** — neither dictionary provider returns audio. The play button is always shown and sends `PLAY_AUDIO { word }`; `background.js` asks `DictionaryAPI.findAudioUrl()` for a Wiktionary recording (English files named after the exact word, preferring `en-us-*`), plays it via the offscreen document, and falls back to `chrome.tts` if there is no recording or playback fails. Do **not** call `new Audio().play()` directly from `content.js` — host pages' CSPs block media from external domains, and content scripts are subject to them.
- **Popup host positioning** — `popupHost.style.position` must be set to `"absolute"` _before_ appending to the DOM. As a block element, an unstyled host div stretches to the body width; measuring it with `getBoundingClientRect()` while still `position: static` returns the full page width, causing the right-edge guard to snap the popup to the left edge of the screen.
- **Provider fallback** — `lookup()` tries FreeDictionaryAPI.com with a 3s timeout (`PRIMARY_TIMEOUT_MS`; it normally answers in ~150ms), then falls back to Wiktionary REST (6s) on timeout/service/network errors — but **not** on not-found, since both share Wiktionary data. FreeDictionaryAPI.com returns **200 with `entries: []`** for unknown words (not a 404) — `normalizePrimary` maps that to not-found. The fallback returns HTML fragments (stripped by `stripHtml`, since service workers have no `DOMParser`) and no IPA. Wiktionary REST is marked experimental and Wikimedia is sunsetting RESTBase, so check it still works if the fallback starts failing. Previous provider `api.dictionaryapi.dev` was dropped in v1.3.0: unmaintained since 2023, it scraped Google and was taking ~20s per request.
- **Attribution is required** — Wiktionary content is CC BY-SA 4.0. Every successful popup renders a "Source: Wiktionary" footer linking to the entry (`source.url`); keep it.
- **Diagnosing outages** — a wave of "Timed out" / "Service unavailable" popups (as opposed to "Not found") points to both providers being down, not an extension regression. Verify with `curl -w "%{http_code} %{time_total}"` against each API before assuming the code broke. Wikimedia requests send an `Api-User-Agent` header (browsers can't set `User-Agent`) per Wikimedia's API etiquette.
- **`escapeHtml()` also escapes `"`** so its output is safe inside double-quoted attribute values (`data-word`, `href`).
