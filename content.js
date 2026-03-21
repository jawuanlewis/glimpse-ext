(() => {
  const POPUP_ID = "quick-define-popup";
  let popupHost = null;

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
    container.className = "qd-popup";
    container.innerHTML = html;
    shadow.appendChild(container);

    document.body.appendChild(popupHost);
    positionPopup(popupHost, rect);

    // Close button
    const closeBtn = shadow.querySelector(".qd-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removePopup();
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
      return `
        <div class="qd-header">
          <span class="qd-word">Not found</span>
          <button class="qd-close" aria-label="Close">&times;</button>
        </div>
        <p class="qd-error">${escapeHtml(data.error)}</p>
      `;
    }

    const phonetic = data.phonetic
      ? `<span class="qd-phonetic">${escapeHtml(data.phonetic)}</span>`
      : "";

    const meanings = data.meanings
      .map((m) => {
        const defs = m.definitions
          .map((d) => {
            const example = d.example
              ? `<p class="qd-example">"${escapeHtml(d.example)}"</p>`
              : "";
            return `<li>${escapeHtml(d.definition)}${example}</li>`;
          })
          .join("");
        return `
          <div class="qd-meaning">
            <span class="qd-pos">${escapeHtml(m.partOfSpeech)}</span>
            <ol>${defs}</ol>
          </div>
        `;
      })
      .join("");

    return `
      <div class="qd-header">
        <div>
          <span class="qd-word">${escapeHtml(data.word)}</span>
          ${phonetic}
        </div>
        <button class="qd-close" aria-label="Close">&times;</button>
      </div>
      ${meanings}
    `;
  }

  function renderLoading(word) {
    return `
      <div class="qd-header">
        <span class="qd-word">${escapeHtml(word)}</span>
        <button class="qd-close" aria-label="Close">&times;</button>
      </div>
      <p class="qd-loading">Looking up definition...</p>
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
      .qd-popup {
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
        animation: qd-fadein 0.15s ease-out;
      }

      @keyframes qd-fadein {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .qd-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 8px;
      }

      .qd-word {
        font-size: 18px;
        font-weight: 600;
        color: #111;
      }

      .qd-phonetic {
        margin-left: 8px;
        font-size: 14px;
        color: #666;
        font-style: italic;
      }

      .qd-close {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #999;
        padding: 0 4px;
        line-height: 1;
        flex-shrink: 0;
      }

      .qd-close:hover {
        color: #333;
      }

      .qd-meaning {
        margin-bottom: 8px;
      }

      .qd-meaning:last-child {
        margin-bottom: 0;
      }

      .qd-pos {
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

      .qd-meaning ol {
        margin: 4px 0 0 0;
        padding-left: 20px;
      }

      .qd-meaning li {
        margin-bottom: 4px;
        color: #333;
      }

      .qd-example {
        margin: 2px 0 0 0;
        font-style: italic;
        color: #777;
        font-size: 13px;
      }

      .qd-error, .qd-loading {
        margin: 0;
        color: #888;
        font-style: italic;
      }
    `;
  }
})();
