const manifest = chrome.runtime.getManifest();
document.getElementById("version").textContent = `v${manifest.version}`;
