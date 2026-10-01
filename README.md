# Glimpse

Chrome extension that shows instant word definitions on highlight — powered by [Wiktionary](https://en.wiktionary.org/) data via [FreeDictionaryAPI.com](https://freedictionaryapi.com/).

![Chrome](https://img.shields.io/badge/platform-Chrome-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/manifest-v3-green)
![License](https://img.shields.io/badge/license-MIT-blue)

## Install

### Chrome Web Store

View and install [Glimpse](https://chromewebstore.google.com/detail/ampidfgddfkbpibhppmjclafaeajcbfl?utm_source=item-share-cb)

### Load Unpacked (Developer Mode)

1. Clone this repository:

   ```bash
   git clone https://github.com/jawuanlewis/glimpse-ext.git
   ```

2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (toggle in the top right).
4. Click **Load unpacked** and select the cloned `glimpse-ext` folder.
5. Navigate to any webpage, highlight a word, and see the definition popup.

## How It Works

Highlight any word on a webpage and Glimpse displays a clean popup with:

- **Word** and **phonetic** pronunciation
- **Audio pronunciation** — plays a human recording from Wiktionary when one exists, otherwise Chrome's built-in text-to-speech
- **Part of speech** labels
- **Top definitions** with usage examples (when available)
- **Dark / Light theme** — toggle in the popup or toolbar; dark mode by default, preference syncs across devices via Chrome storage

The popup appears near the selected text and dismisses when you click elsewhere or press Escape.

## Project Structure

```text
glimpse-ext/
├── manifest.json       # Extension config (Manifest V3)
├── background.js       # Service worker — API requests & pronunciation playback
├── content.js          # Content script — word selection, popup lifecycle & rendering
├── offscreen.html      # Offscreen document shell (audio playback outside host-page CSP)
├── offscreen.js        # Offscreen document logic — plays pronunciation audio
├── popup/
│   ├── popup.html      # Toolbar popup UI
│   └── popup.js        # Toolbar popup — version display & theme toggle
├── icons/              # Extension icons (16, 48, 128px)
└── utils/
    └── api.js          # Dictionary client — lookup, fallback & audio lookup
```

## Tech Stack

- **Manifest V3** — modern Chrome extension standard
- **Vanilla JavaScript & CSS** — no frameworks, minimal footprint
- **Shadow DOM** — popup styles are fully isolated from host pages
- **[FreeDictionaryAPI.com](https://freedictionaryapi.com/)** — primary dictionary source, no API key required
- **[Wiktionary REST API](https://en.wiktionary.org/api/rest_v1/)** — automatic fallback if the primary is unavailable

Definitions come from [Wiktionary](https://en.wiktionary.org/) and are licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); each popup links back to the source entry.

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

## License

[MIT](LICENSE)
