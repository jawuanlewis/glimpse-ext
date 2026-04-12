(() => {
  const POPUP_ID = "glimpse-popup";
  let popupHost = null;
  let currentTheme = "dark";

  // Load saved theme preference
  chrome.storage.sync.get("theme", (result) => {
    if (result.theme) currentTheme = result.theme;
  });

  // --- Popup lifecycle ---

  function removePopup() {
    if (popupHost) {
      popupHost.remove();
      popupHost = null;
    }
  }

  function createPopup(html, rect) {
    removePopup();

    popupHost = document.createElement("div");
    popupHost.id = POPUP_ID;
    const shadow = popupHost.attachShadow({ mode: "closed" });

    // Inject styles into shadow DOM
    const style = document.createElement("style");
    style.textContent = getPopupStyles();
    shadow.appendChild(style);

    const container = document.createElement("div");
    container.className = `glimpse-popup ${currentTheme === "dark" ? "glimpse-dark" : ""}`;
    container.innerHTML = html;
    shadow.appendChild(container);

    document.body.appendChild(popupHost);
    positionPopup(popupHost, rect);

    // Close button
    const closeBtn = shadow.querySelector(".glimpse-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removePopup();
      });
    }

    // Theme toggle
    const themeBtn = shadow.querySelector(".glimpse-theme-toggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        currentTheme = currentTheme === "dark" ? "light" : "dark";
        chrome.storage.sync.set({ theme: currentTheme });
        container.classList.toggle("glimpse-dark", currentTheme === "dark");
        themeBtn.textContent = currentTheme === "dark" ? "\u2600" : "\u263E";
        themeBtn.setAttribute(
          "aria-label",
          currentTheme === "dark"
            ? "Switch to light mode"
            : "Switch to dark mode",
        );
      });
    }

    // Audio play button
    const audioBtn = shadow.querySelector(".glimpse-audio-btn");
    if (audioBtn) {
      audioBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const url = audioBtn.dataset.audioUrl;
        if (url) new Audio(url).play();
      });
    }
  }

  function positionPopup(el, rect) {
    const MARGIN = 8;
    const popupRect = el.getBoundingClientRect();

    let top = rect.bottom + window.scrollY + MARGIN;
    let left = rect.left + window.scrollX;

    // If popup would go off the right edge, pull it left
    if (left + popupRect.width > window.innerWidth + window.scrollX) {
      left = window.innerWidth + window.scrollX - popupRect.width - MARGIN;
    }

    // If popup would go below viewport, show above the selection instead
    if (rect.bottom + popupRect.height + MARGIN > window.innerHeight) {
      top = rect.top + window.scrollY - popupRect.height - MARGIN;
    }

    el.style.position = "absolute";
    el.style.top = `${Math.max(0, top)}px`;
    el.style.left = `${Math.max(0, left)}px`;
    el.style.zIndex = "2147483647";
  }

  // --- Rendering ---

  function renderDefinition(data) {
    if (data.error) {
      const themeIcon = currentTheme === "dark" ? "\u2600" : "\u263E";
      const themeLabel =
        currentTheme === "dark"
          ? "Switch to light mode"
          : "Switch to dark mode";
      return `
        <div class="glimpse-header">
          <span class="glimpse-word">Not found</span>
          <div class="glimpse-header-actions">
            <button class="glimpse-theme-toggle" aria-label="${themeLabel}">${themeIcon}</button>
            <button class="glimpse-close" aria-label="Close">&times;</button>
          </div>
        </div>
        <p class="glimpse-error">${escapeHtml(data.error)}</p>
      `;
    }

    const phonetic = data.phonetic
      ? `<span class="glimpse-phonetic">${escapeHtml(data.phonetic)}</span>`
      : "";

    const audioBtn = data.audioUrl
      ? `<button class="glimpse-audio-btn" data-audio-url="${escapeHtml(data.audioUrl)}" aria-label="Play pronunciation">&#9655;</button>`
      : "";

    const themeIcon = currentTheme === "dark" ? "\u2600" : "\u263E";
    const themeLabel =
      currentTheme === "dark" ? "Switch to light mode" : "Switch to dark mode";

    const meanings = data.meanings
      .map((m) => {
        const defs = m.definitions
          .map((d) => {
            const example = d.example
              ? `<p class="glimpse-example">"${escapeHtml(d.example)}"</p>`
              : "";
            return `<li>${escapeHtml(d.definition)}${example}</li>`;
          })
          .join("");
        return `
          <div class="glimpse-meaning">
            <span class="glimpse-pos">${escapeHtml(m.partOfSpeech)}</span>
            <ol>${defs}</ol>
          </div>
        `;
      })
      .join("");

    return `
      <div class="glimpse-header">
        <div>
          <span class="glimpse-word">${escapeHtml(data.word)}</span>
          ${phonetic}
          ${audioBtn}
        </div>
        <div class="glimpse-header-actions">
          <button class="glimpse-theme-toggle" aria-label="${themeLabel}">${themeIcon}</button>
          <button class="glimpse-close" aria-label="Close">&times;</button>
        </div>
      </div>
      ${meanings}
    `;
  }

  function renderLoading(word) {
    const themeIcon = currentTheme === "dark" ? "\u2600" : "\u263E";
    const themeLabel =
      currentTheme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    return `
      <div class="glimpse-header">
        <span class="glimpse-word">${escapeHtml(word)}</span>
        <div class="glimpse-header-actions">
          <button class="glimpse-theme-toggle" aria-label="${themeLabel}">${themeIcon}</button>
          <button class="glimpse-close" aria-label="Close">&times;</button>
        </div>
      </div>
      <p class="glimpse-loading">Looking up definition...</p>
    `;
  }

  // --- Helpers ---

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function isValidWord(text) {
    return /^[a-zA-Z'-]+$/.test(text) && text.length <= 50;
  }

  function getSelectionRect() {
    const selection = globalThis.getSelection();
    if (!selection.rangeCount) return null;
    return selection.getRangeAt(0).getBoundingClientRect();
  }

  // --- Event listeners ---

  document.addEventListener("mouseup", (e) => {
    // Ignore clicks inside our own popup
    if (popupHost?.contains(e.target)) return;

    // Small delay to let the selection finalize
    setTimeout(() => {
      const selection = globalThis.getSelection();
      const text = selection?.toString().trim();

      if (!text || !isValidWord(text)) {
        return;
      }

      const rect = getSelectionRect();
      if (!rect) return;

      // Show loading state
      createPopup(renderLoading(text), rect);

      // Request definition from background
      chrome.runtime.sendMessage(
        { type: "LOOKUP_WORD", word: text.toLowerCase() },
        (response) => {
          if (chrome.runtime.lastError || !response) {
            createPopup(
              renderDefinition({
                error: "Could not reach dictionary service.",
              }),
              rect,
            );
            return;
          }
          createPopup(renderDefinition(response), rect);
        },
      );
    }, 10);
  });

  // Dismiss on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") removePopup();
  });

  // Dismiss when clicking outside
  document.addEventListener("mousedown", (e) => {
    if (popupHost && !popupHost.contains(e.target)) {
      removePopup();
    }
  });

  // --- Shadow DOM styles (inlined to keep them isolated) ---

  function getPopupStyles() {
    return `
      .glimpse-popup {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #1a1a1a;
        background: #ffffff;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        padding: 12px 16px;
        max-width: 360px;
        min-width: 200px;
        animation: glimpse-fadein 0.15s ease-out;
      }

      @keyframes glimpse-fadein {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .glimpse-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 8px;
      }

      .glimpse-word {
        font-size: 18px;
        font-weight: 600;
        color: #111;
      }

      .glimpse-phonetic {
        margin-left: 8px;
        font-size: 14px;
        color: #666;
        font-style: italic;
      }

      .glimpse-header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }

      .glimpse-close {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #999;
        padding: 0 4px;
        line-height: 1;
        flex-shrink: 0;
      }

      .glimpse-close:hover {
        color: #333;
      }

      .glimpse-theme-toggle {
        background: none;
        border: none;
        font-size: 16px;
        cursor: pointer;
        color: #999;
        padding: 0 4px;
        line-height: 1;
      }

      .glimpse-theme-toggle:hover {
        color: #333;
      }

      .glimpse-audio-btn {
        background: none;
        border: 1px solid #ccc;
        border-radius: 50%;
        width: 22px;
        height: 22px;
        font-size: 12px;
        cursor: pointer;
        color: #666;
        padding: 0;
        margin-left: 6px;
        line-height: 22px;
        text-align: center;
        vertical-align: middle;
        flex-shrink: 0;
      }

      .glimpse-audio-btn:hover {
        background: #f0f0f0;
        color: #333;
      }

      .glimpse-meaning {
        margin-bottom: 8px;
      }

      .glimpse-meaning:last-child {
        margin-bottom: 0;
      }

      .glimpse-pos {
        display: inline-block;
        font-size: 12px;
        font-weight: 600;
        color: #4a7c59;
        background: #e8f5e9;
        padding: 1px 8px;
        border-radius: 4px;
        margin-bottom: 4px;
        text-transform: lowercase;
      }

      .glimpse-meaning ol {
        margin: 4px 0 0 0;
        padding-left: 20px;
      }

      .glimpse-meaning li {
        margin-bottom: 4px;
        color: #333;
      }

      .glimpse-example {
        margin: 2px 0 0 0;
        font-style: italic;
        color: #777;
        font-size: 13px;
      }

      .glimpse-error, .glimpse-loading {
        margin: 0;
        color: #888;
        font-style: italic;
      }

      /* Dark theme */
      .glimpse-dark {
        color: #e0e0e0;
        background: #1e1e1e;
        border-color: #333;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      }

      .glimpse-dark .glimpse-word {
        color: #f0f0f0;
      }

      .glimpse-dark .glimpse-phonetic {
        color: #aaa;
      }

      .glimpse-dark .glimpse-close,
      .glimpse-dark .glimpse-theme-toggle {
        color: #888;
      }

      .glimpse-dark .glimpse-close:hover,
      .glimpse-dark .glimpse-theme-toggle:hover {
        color: #ddd;
      }

      .glimpse-dark .glimpse-pos {
        color: #7cc88a;
        background: #1a3a1f;
      }

      .glimpse-dark .glimpse-meaning li {
        color: #ccc;
      }

      .glimpse-dark .glimpse-example {
        color: #999;
      }

      .glimpse-dark .glimpse-error,
      .glimpse-dark .glimpse-loading {
        color: #999;
      }

      .glimpse-dark .glimpse-audio-btn {
        color: #aaa;
        border-color: #555;
      }

      .glimpse-dark .glimpse-audio-btn:hover {
        background: #333;
        color: #ddd;
      }
    `;
  }
})();
