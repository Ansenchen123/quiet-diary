const DB_NAME = "quiet-diary-v1";
const DB_VERSION = 1;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const storeNames = {
  entries: "entries",
  media: "media",
  settings: "settings"
};

const themes = [
  { id: "botanical", name: "Botanical", className: "theme-botanical", palette: ["#7a846f", "#fffaf2", "#28231f"], fontChoice: "serif", iconStyle: "pressed-leaf" },
  { id: "tide", name: "Tide", className: "theme-tide", palette: ["#526975", "#f7efe4", "#28231f"], fontChoice: "serif", iconStyle: "shoreline" },
  { id: "plum", name: "Plum", className: "theme-plum", palette: ["#704f58", "#fff7ef", "#28231f"], fontChoice: "serif", iconStyle: "quiet-moon" },
  { id: "ochre", name: "Ochre", className: "theme-ochre", palette: ["#a56f45", "#fff8ed", "#28231f"], fontChoice: "serif", iconStyle: "paper-sun" }
];

const noopSyncProvider = {
  async pushChanges() {
    return { pushed: 0 };
  },
  async pullChanges() {
    return { pulled: 0 };
  },
  async resolveConflict(localRecord) {
    return localRecord;
  }
};

let db;
let currentPin = "";
let selectedMood = "安靜";
let pendingMedia = [];
let activeTheme = themes[0];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", async () => {
  db = await openDatabase();
  await seedDefaults();
  bindEvents();
  renderThemes();
  await loadTheme();
  await renderEntries();
  setDefaultDate();
  initLock();
  registerServiceWorker();
});

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeNames.entries)) {
        database.createObjectStore(storeNames.entries, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(storeNames.media)) {
        database.createObjectStore(storeNames.media, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(storeNames.settings)) {
        database.createObjectStore(storeNames.settings, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(storeName, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function getRecord(storeName, key) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putRecord(storeName, value) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").put(value);
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
}

function deleteRecord(storeName, key) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function seedDefaults() {
  const theme = await getRecord(storeNames.settings, "theme");
  if (!theme) {
    await putRecord(storeNames.settings, { key: "theme", value: themes[0] });
  }
}

function bindEvents() {
  $("#pinForm").addEventListener("submit", handlePinSubmit);
  $("#bioButton").addEventListener("click", handleBiometricUnlock);
  $("#lockButton").addEventListener("click", lockApp);
  $("#entryForm").addEventListener("submit", saveEntry);
  $("#mediaInput").addEventListener("change", handleMediaSelection);
  $("#coverInput").addEventListener("change", handleCustomCover);
  $("#exportBackup").addEventListener("click", exportBackup);
  $("#importBackup").addEventListener("change", importBackup);
  $("#resetTheme").addEventListener("click", async () => {
    await applyTheme(themes[0]);
    await putRecord(storeNames.settings, { key: "customCover", value: "" });
    $("#heroCover").style.backgroundImage = "";
    $("#heroCover").classList.remove("custom-cover");
  });
  $("#clearEntries").addEventListener("click", clearEntries);

  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => setActiveView(tab.dataset.view));
  });
  $$(".mood").forEach((button) => {
    button.addEventListener("click", () => {
      selectedMood = button.dataset.mood;
      $$(".mood").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
    });
  });
}

async function initLock() {
  const pinMeta = await getRecord(storeNames.settings, "pinMeta");
  const hasPin = Boolean(pinMeta);
  $("#pinSubmit").textContent = hasPin ? "解鎖" : "設定 PIN";
  $("#lockHint").textContent = hasPin ? "輸入 PIN 後即可打開日記。" : "第一次使用請設定 4-6 位 PIN。";
  $("#bioButton").disabled = !hasPin || !window.PublicKeyCredential;
}

async function handlePinSubmit(event) {
  event.preventDefault();
  const pin = $("#pinInput").value.trim();
  if (!/^\d{4,6}$/.test(pin)) {
    setMessage("#lockMessage", "PIN 需為 4-6 位數字。");
    return;
  }

  const pinMeta = await getRecord(storeNames.settings, "pinMeta");
  if (!pinMeta) {
    const meta = await createPinMeta(pin);
    await putRecord(storeNames.settings, { key: "pinMeta", value: meta });
    currentPin = pin;
    unlockApp("PIN 已設定，日記已開啟。");
    return;
  }

  const valid = await verifyPin(pin, pinMeta.value);
  if (!valid) {
    setMessage("#lockMessage", "PIN 不正確。");
    return;
  }
  currentPin = pin;
  unlockApp("已解鎖。");
}

async function handleBiometricUnlock() {
  if (!window.PublicKeyCredential) {
    setMessage("#lockMessage", "此瀏覽器不支援生物辨識，請使用 PIN。");
    return;
  }
  setMessage("#lockMessage", "這台裝置若支援生物辨識，就能用更快的方式開啟；現在請先用 PIN。");
  $("#pinInput").focus();
}

function unlockApp(message) {
  $("#app").classList.add("unlocked");
  $("#app").dataset.screen = "main";
  $("#pinInput").value = "";
  setMessage("#lockMessage", message);
}

function lockApp() {
  $("#app").classList.remove("unlocked");
  $("#app").dataset.screen = "lock";
  currentPin = "";
  $("#pinInput").focus();
}

async function createPinMeta(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pin, salt);
  const verifier = crypto.getRandomValues(new Uint8Array(16));
  const encryptedVerifier = await encryptJson({ verifier: arrayToBase64(verifier) }, key);
  return {
    salt: arrayToBase64(salt),
    verifier: encryptedVerifier,
    iterations: 120000
  };
}

async function verifyPin(pin, meta) {
  try {
    const key = await deriveKey(pin, base64ToArray(meta.salt));
    const result = await decryptJson(meta.verifier, key);
    return Boolean(result.verifier);
  } catch {
    return false;
  }
}

async function deriveKey(pin, salt) {
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptJson(data, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(data)));
  return { iv: arrayToBase64(iv), data: arrayToBase64(new Uint8Array(encrypted)) };
}

async function decryptJson(payload, key) {
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToArray(payload.iv) }, key, base64ToArray(payload.data));
  return JSON.parse(decoder.decode(decrypted));
}

function setDefaultDate() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  $("#entryDate").value = now.toISOString().slice(0, 16);
  $("#heroDate").textContent = new Intl.DateTimeFormat("zh-Hant", { dateStyle: "full" }).format(new Date());
}

async function handleMediaSelection(event) {
  const files = Array.from(event.target.files || []);
  const accepted = files.filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
  pendingMedia = await Promise.all(accepted.map(fileToPendingMedia));
  renderPendingMedia();
}

async function fileToPendingMedia(file) {
  const id = crypto.randomUUID();
  const type = file.type.startsWith("video/") ? "video" : "photo";
  const blobKey = `media-${id}`;
  const thumbnailKey = `thumb-${id}`;
  const url = URL.createObjectURL(file);
  return { id, type, file, url, blobKey, thumbnailKey, createdAt: new Date().toISOString() };
}

function renderPendingMedia() {
  const preview = $("#mediaPreview");
  preview.innerHTML = "";
  pendingMedia.forEach((asset) => {
    const tile = document.createElement("div");
    tile.className = "media-tile";
    const media = document.createElement(asset.type === "video" ? "video" : "img");
    media.src = asset.url;
    media.muted = true;
    media.controls = asset.type === "video";
    media.alt = "待儲存媒體";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "移除媒體");
    remove.addEventListener("click", () => {
      pendingMedia = pendingMedia.filter((item) => item.id !== asset.id);
      renderPendingMedia();
    });
    tile.append(media, remove);
    preview.append(tile);
  });
}

async function saveEntry(event) {
  event.preventDefault();
  const text = $("#entryText").value.trim();
  const entryDate = $("#entryDate").value ? new Date($("#entryDate").value).toISOString() : new Date().toISOString();
  const tags = $("#tagInput").value.split(",").map((tag) => tag.trim()).filter(Boolean);
  if (!text && !selectedMood && pendingMedia.length === 0) {
    setMessage("#entryMessage", "至少留下文字、心情、照片或影片其中一種。");
    return;
  }

  const mediaIds = [];
  for (const asset of pendingMedia) {
    const thumbnail = asset.type === "photo" ? await createImageThumbnail(asset.file) : asset.file;
    const record = {
      id: asset.id,
      type: asset.type,
      localUri: asset.blobKey,
      blobKey: asset.blobKey,
      thumbnailKey: asset.thumbnailKey,
      blob: asset.file,
      thumbnail,
      duration: null,
      createdAt: asset.createdAt
    };
    await putRecord(storeNames.media, record);
    mediaIds.push(asset.id);
  }

  const now = new Date().toISOString();
  const entry = {
    id: crypto.randomUUID(),
    text,
    mood: selectedMood,
    tags,
    mediaIds,
    entryDate,
    createdAt: now,
    updatedAt: now,
    location: null
  };
  await putRecord(storeNames.entries, entry);
  await noopSyncProvider.pushChanges([entry]);
  $("#entryForm").reset();
  selectedMood = "安靜";
  $$(".mood").forEach((item) => item.classList.toggle("active", item.dataset.mood === "安靜"));
  pendingMedia = [];
  renderPendingMedia();
  setDefaultDate();
  setMessage("#entryMessage", "已存在這台裝置。");
  await renderEntries();
}

async function renderEntries() {
  const entries = (await getAll(storeNames.entries)).sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate));
  const list = $("#entriesList");
  list.innerHTML = "";
  $("#entryCount").textContent = `${entries.length} 篇`;
  if (entries.length === 0) {
    list.innerHTML = `<div class="empty-state">還沒有日記。新增一張照片、一段話，或只選一個心情都可以。</div>`;
  }
  for (const entry of entries) {
    list.append(await renderEntryCard(entry));
  }
  renderCalendar(entries);
}

async function renderEntryCard(entry) {
  const card = document.createElement("article");
  card.className = "entry-card";
  const date = new Intl.DateTimeFormat("zh-Hant", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.entryDate));
  card.innerHTML = `
    <header>
      <div>
        <time datetime="${entry.entryDate}">${date}</time>
        <h3>${escapeHtml(entry.mood || "未命名的一刻")}</h3>
      </div>
      <button class="button text" type="button" data-delete="${entry.id}">刪除</button>
    </header>
    ${entry.text ? `<p>${escapeHtml(entry.text)}</p>` : ""}
    ${entry.tags.length ? `<div class="tag-list">${entry.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
  `;
  card.querySelector("[data-delete]").addEventListener("click", async () => {
    await deleteRecord(storeNames.entries, entry.id);
    await renderEntries();
  });

  if (entry.mediaIds.length) {
    const mediaWrap = document.createElement("div");
    mediaWrap.className = "entry-media";
    for (const mediaId of entry.mediaIds) {
      const asset = await getRecord(storeNames.media, mediaId);
      if (!asset) continue;
      const node = document.createElement(asset.type === "video" ? "video" : "img");
      node.src = URL.createObjectURL(asset.blob);
      node.controls = asset.type === "video";
      node.alt = "日記媒體";
      mediaWrap.append(node);
    }
    card.append(mediaWrap);
  }
  return card;
}

function renderCalendar(entries) {
  const grid = $("#calendarGrid");
  grid.innerHTML = "";
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const daysWithEntries = new Set(entries.map((entry) => new Date(entry.entryDate).getDate()));
  for (let day = 1; day <= days; day += 1) {
    const cell = document.createElement("div");
    cell.className = `calendar-day${daysWithEntries.has(day) ? " has-entry" : ""}`;
    cell.textContent = String(day);
    grid.append(cell);
  }
}

function renderThemes() {
  const wrap = $("#themeOptions");
  wrap.innerHTML = "";
  themes.forEach((theme) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-option";
    button.dataset.theme = theme.id;
    button.innerHTML = `<div class="theme-swatch ${theme.className}"></div><strong>${theme.name}</strong><small>${theme.iconStyle}</small>`;
    button.addEventListener("click", () => applyTheme(theme));
    wrap.append(button);
  });
}

async function loadTheme() {
  const themeSetting = await getRecord(storeNames.settings, "theme");
  const customCover = await getRecord(storeNames.settings, "customCover");
  activeTheme = themeSetting?.value || themes[0];
  applyThemeToUi(activeTheme);
  if (customCover?.value) {
    $("#heroCover").style.backgroundImage = `linear-gradient(rgba(0,0,0,.08), rgba(0,0,0,.28)), url(${customCover.value})`;
    $("#heroCover").classList.add("custom-cover");
  }
}

async function applyTheme(theme) {
  activeTheme = theme;
  await putRecord(storeNames.settings, { key: "theme", value: theme });
  await putRecord(storeNames.settings, { key: "customCover", value: "" });
  $("#heroCover").style.backgroundImage = "";
  $("#heroCover").classList.remove("custom-cover");
  applyThemeToUi(theme);
}

function applyThemeToUi(theme) {
  const hero = $("#heroCover");
  themes.forEach((item) => hero.classList.remove(item.className));
  hero.classList.add(theme.className);
  $("#themeChip").textContent = theme.name;
  $$(".theme-option").forEach((button) => button.classList.toggle("active", button.dataset.theme === theme.id));
}

async function handleCustomCover(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const dataUrl = await blobToDataUrl(file);
  await putRecord(storeNames.settings, { key: "customCover", value: dataUrl });
  $("#heroCover").style.backgroundImage = `linear-gradient(rgba(0,0,0,.08), rgba(0,0,0,.28)), url(${dataUrl})`;
  $("#heroCover").classList.add("custom-cover");
}

async function exportBackup() {
  if (!currentPin) {
    setMessage("#backupMessage", "請先用 PIN 解鎖後再匯出。");
    return;
  }
  const backupSalt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(currentPin, backupSalt);
  const entries = await getAll(storeNames.entries);
  const media = await Promise.all((await getAll(storeNames.media)).map(async (asset) => ({
    ...asset,
    blob: await blobToDataUrl(asset.blob),
    thumbnail: await blobToDataUrl(asset.thumbnail)
  })));
  const settings = await getAll(storeNames.settings);
  const archive = await encryptJson({ version: 1, exportedAt: new Date().toISOString(), entries, media, settings }, key);
  downloadJson(`quiet-diary-backup-${Date.now()}.json`, { type: "quiet-diary-backup", salt: arrayToBase64(backupSalt), archive });
  setMessage("#backupMessage", "加密備份已匯出。");
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file || !currentPin) {
    setMessage("#backupMessage", "請先解鎖，再選擇備份檔。");
    return;
  }
  try {
    const payload = JSON.parse(await file.text());
    const key = await deriveKey(currentPin, base64ToArray(payload.salt));
    const archive = await decryptJson(payload.archive, key);
    for (const entry of archive.entries || []) await putRecord(storeNames.entries, entry);
    for (const asset of archive.media || []) {
      await putRecord(storeNames.media, {
        ...asset,
        blob: dataUrlToBlob(asset.blob),
        thumbnail: dataUrlToBlob(asset.thumbnail)
      });
    }
    for (const setting of archive.settings || []) {
      if (setting.key !== "pinMeta") await putRecord(storeNames.settings, setting);
    }
    await loadTheme();
    await renderEntries();
    setMessage("#backupMessage", "備份已匯入。");
  } catch {
    setMessage("#backupMessage", "匯入失敗，請確認 PIN 與備份檔。");
  }
}

async function clearEntries() {
  const entries = await getAll(storeNames.entries);
  for (const entry of entries) await deleteRecord(storeNames.entries, entry.id);
  await renderEntries();
}

function setActiveView(viewId) {
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === viewId));
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
}

function setMessage(selector, message) {
  $(selector).textContent = message;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function arrayToBase64(array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < array.length; index += chunkSize) {
    binary += String.fromCharCode(...array.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToArray(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function createImageThumbnail(file) {
  return new Promise((resolve) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 360;
      const scale = Math.min(size / image.width, size / image.height, 1);
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        resolve(blob || file);
      }, "image/jpeg", 0.78);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    image.src = url;
  });
}

function dataUrlToBlob(dataUrl) {
  const [meta, data] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] || "application/octet-stream";
  const bytes = base64ToArray(data);
  return new Blob([bytes], { type: mime });
}

function downloadJson(filename, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then((registration) => {
      registration.update();
    }).catch(() => {});
  }
}
