# Glimpse

Chrome extension that shows instant word definitions on highlight — powered by the [Free Dictionary API](https://dictionaryapi.dev/).

![Chrome](https://img.shields.io/badge/platform-Chrome-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/manifest-v3-green)
![License](https://img.shields.io/badge/license-MIT-blue)

## Install

### Chrome Web Store

> Coming soon — a link to the published extension will be added here.

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
- **Audio pronunciation** — play button when audio is available from the dictionary API
- **Part of speech** labels
- **Top definitions** with usage examples (when available)
- **Dark / Light theme** — toggle in the popup or toolbar; dark mode by default, preference syncs across devices via Chrome storage

The popup appears near the selected text and dismisses when you click elsewhere or press Escape.

## Project Structure

```text
glimpse-ext/
├── manifest.json       # Extension config (Manifest V3)
├── background.js       # Service worker — API requests & audio playback routing
├── content.js          # Content script — word selection, popup lifecycle & rendering
├── offscreen.html      # Offscreen document shell (audio playback outside host-page CSP)
├── offscreen.js        # Offscreen document logic — plays pronunciation audio
├── popup/
│   ├── popup.html      # Toolbar popup UI
│   └── popup.js        # Toolbar popup — version display & theme toggle
├── icons/              # Extension icons (16, 48, 128px)
└── utils/
    └── api.js          # Dictionary API client
```

## Tech Stack

- **Manifest V3** — modern Chrome extension standard
- **Vanilla JavaScript & CSS** — no frameworks, minimal footprint
- **Shadow DOM** — popup styles are fully isolated from host pages
- **[Free Dictionary API](https://dictionaryapi.dev/)** — no API key required

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

## License

[MIT](LICENSE)
