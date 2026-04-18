(() => {
  const POPUP_ID = "glimpse-popup";
  let popupHost = null;
  let shadowContainer = null; // kept in scope so the storage listener can reach it
  let currentTheme = "dark";

  // Styles are static — compute once rather than on every popup creation.
  const POPUP_STYLES = getPopupStyles();

  // SVG icons — inline so rendering is pixel-exact and independent of the host page's font stack.
  const ICON_PLAY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 10" width="8" height="10" aria-hidden="true" style="margin-left:2px"><polygon points="0,0 8,5 0,10" fill="currentColor"/></svg>`;
  const ICON_MOON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor"/></svg>`;
  const ICON_SUN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>`;

  // Load saved theme preference
  chrome.storage.sync.get("theme", (result) => {
    if (result.theme) currentTheme = result.theme;
  });

  // Keep an open popup in sync when the theme is changed from the toolbar popup.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.theme) return;
    currentTheme = changes.theme.newValue;
    if (!shadowContainer) return;
    shadowContainer.classList.toggle("glimpse-dark", currentTheme === "dark");
    const themeBtn = shadowContainer.querySelector(".glimpse-theme-toggle");
    if (themeBtn) {
      themeBtn.innerHTML = currentTheme === "dark" ? ICON_SUN : ICON_MOON;
      themeBtn.setAttribute(
        "aria-label",
        currentTheme === "dark"
          ? "Switch to light mode"
          : "Switch to dark mode",
      );
    }
  });

  // --- Popup lifecycle ---

  function removePopup() {
    if (popupHost) {
      popupHost.remove();
      popupHost = null;
      shadowContainer = null;
    }
  }

  function createPopup(html, rect) {
    removePopup();

    popupHost = document.createElement("div");
    popupHost.id = POPUP_ID;
    const shadow = popupHost.attachShadow({ mode: "closed" });

    // Inject styles into shadow DOM
    const style = document.createElement("style");
    style.textContent = POPUP_STYLES;
    shadow.appendChild(style);

    shadowContainer = document.createElement("div");
    shadowContainer.className = `glimpse-popup ${currentTheme === "dark" ? "glimpse-dark" : ""}`;
    shadowContainer.innerHTML = html;
    shadow.appendChild(shadowContainer);
    const container = shadowContainer;

    // Set absolute positioning before appending so the element shrink-wraps
    // to its shadow content — otherwise getBoundingClientRect() in
    // positionPopup() would measure the full body width as a block div.
    popupHost.style.position = "absolute";
    popupHost.style.zIndex = "2147483647";

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
        themeBtn.innerHTML = currentTheme === "dark" ? ICON_SUN : ICON_MOON;
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
        if (url) chrome.runtime.sendMessage({ type: "PLAY_AUDIO", url });
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

    el.style.top = `${Math.max(0, top)}px`;
    el.style.left = `${Math.max(0, left)}px`;
  }

  // --- Rendering ---

  function renderDefinition(data) {
    const themeIcon = currentTheme === "dark" ? ICON_SUN : ICON_MOON;
    const themeLabel =
      currentTheme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    const headerActions = `
      <div class="glimpse-header-actions">
        <button class="glimpse-theme-toggle" aria-label="${themeLabel}">${themeIcon}</button>
        <button class="glimpse-close" aria-label="Close">&times;</button>
      </div>`;

    if (data.error) {
      return `
        <div class="glimpse-header">
          <span class="glimpse-word">Not found</span>
          ${headerActions}
        </div>
        <p class="glimpse-error">${escapeHtml(data.error)}</p>
      `;
    }

    const phonetic = data.phonetic
      ? `<span class="glimpse-phonetic">${escapeHtml(data.phonetic)}</span>`
      : "";

    const audioBtn = data.audioUrl
      ? `<button class="glimpse-audio-btn" data-audio-url="${escapeHtml(data.audioUrl)}" aria-label="Play pronunciation">${ICON_PLAY}</button>`
      : "";

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
        ${headerActions}
      </div>
      ${meanings}
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
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        width: 24px;
        height: 24px;
        cursor: pointer;
        color: #999;
        padding: 0;
      }

      .glimpse-theme-toggle:hover {
        color: #333;
      }

      .glimpse-audio-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: 1px solid #ccc;
        border-radius: 50%;
        width: 22px;
        height: 22px;
        cursor: pointer;
        color: #666;
        padding: 0;
        margin-left: 6px;
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

      .glimpse-error {
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

      .glimpse-dark .glimpse-error {
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
