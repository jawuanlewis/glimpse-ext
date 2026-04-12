const manifest = chrome.runtime.getManifest();
document.getElementById("version").textContent = `v${manifest.version}`;

const themeBtn = document.getElementById("theme-toggle");

function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  themeBtn.textContent = theme === "dark" ? "Light" : "Dark";
}

// Load saved theme (default to dark)
chrome.storage.sync.get("theme", (result) => {
  applyTheme(result.theme || "dark");
});

themeBtn.addEventListener("click", () => {
  const isDark = document.body.classList.contains("dark");
  const newTheme = isDark ? "light" : "dark";
  chrome.storage.sync.set({ theme: newTheme });
  applyTheme(newTheme);
});
