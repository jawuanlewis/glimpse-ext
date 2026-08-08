const manifest = chrome.runtime.getManifest();
document.getElementById("version").textContent = `v${manifest.version}`;

const themeBtn = document.getElementById("theme-toggle");
let currentTheme = "dark";

function applyTheme(theme) {
  currentTheme = theme;
  document.body.classList.toggle("dark", theme === "dark");
  themeBtn.textContent = theme === "dark" ? "Light" : "Dark";
}

// Load saved theme (default to dark)
chrome.storage.sync.get("theme", (result) => {
  applyTheme(result.theme || "dark");
});

themeBtn.addEventListener("click", () => {
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  chrome.storage.sync.set({ theme: newTheme });
  applyTheme(newTheme);
});

const enabledToggle = document.getElementById("enabled-toggle");

// Load saved enabled state (default to enabled)
chrome.storage.sync.get("enabled", (result) => {
  enabledToggle.checked = result.enabled !== false;
});

enabledToggle.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: enabledToggle.checked });
});
