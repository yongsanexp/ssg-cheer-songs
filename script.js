// GitHub 저장소 설정 - Pages로 호스팅되는 이 저장소 자체에 응원가를 커밋합니다.
const GH_OWNER = "yongsanexp";
const GH_REPO = "ssg-cheer-songs";
const GH_BRANCH = "main";
const SONGS_JSON_PATH = "songs.json";

// ---------- 파일명 규칙 ----------
//  - "이름.wav"        : 응원가 (기본, 버전 1)
//  - "이름2.wav"       : 응원가 버전 2 (같은 선수의 두 번째 응원가)
//  - "이름등장.wav"    : 등장곡
let RAW_FILES = [];
let PLAYERS = {};
let PLAYER_LIST = [];

function buildPlayers(rawFiles) {
  const map = {};
  const ensure = (name) => {
    if (!map[name]) map[name] = { name, cheerFiles: [], entranceFile: null };
    return map[name];
  };
  for (const raw of rawFiles) {
    if (raw.endsWith("등장")) {
      ensure(raw.slice(0, -2)).entranceFile = raw + ".wav";
      continue;
    }
    const m = raw.match(/^(.+?)(\d+)$/);
    if (m) {
      ensure(m[1]).cheerFiles.push({ variant: parseInt(m[2], 10), file: raw + ".wav" });
    } else {
      ensure(raw).cheerFiles.push({ variant: 1, file: raw + ".wav" });
    }
  }
  Object.values(map).forEach(p => p.cheerFiles.sort((a, b) => a.variant - b.variant));
  return map;
}

async function fetchManifest() {
  const res = await fetch(SONGS_JSON_PATH + "?t=" + Date.now(), { cache: "no-store" });
  if (!res.ok) return [];
  const arr = await res.json();
  return arr.map(f => f.replace(/\.wav$/i, ""));
}

async function refreshPlayers() {
  RAW_FILES = await fetchManifest();
  PLAYERS = buildPlayers(RAW_FILES);
  PLAYER_LIST = Object.values(PLAYERS).sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

function getPlayer(name) {
  return name ? PLAYERS[name] : null;
}
function getCheerFile(name, variant) {
  const p = getPlayer(name);
  if (!p || p.cheerFiles.length === 0) return null;
  const found = p.cheerFiles.find(c => c.variant === variant);
  return (found || p.cheerFiles[0]).file;
}
function getEntranceFile(name) {
  const p = getPlayer(name);
  return p ? p.entranceFile : null;
}

// ---------- 타순 저장 (기기별 로컬 저장) ----------
const STORAGE_KEY = "ssgLineup";
const ORDER_KEY = "ssgCurrentOrder";
const TOKEN_KEY = "ssgGithubToken";

function emptySlot() { return { name: "", variant: 1 }; }
function defaultLineup() { return { pitcher: emptySlot(), batters: Array.from({ length: 9 }, emptySlot) }; }

function normalizeSlot(slot) {
  if (!slot) return emptySlot();
  if (typeof slot === "string") {
    if (!slot) return emptySlot();
    const base = slot.replace(/\.wav$/, "");
    const m = base.match(/^(.+?)(\d+)$/);
    if (m && PLAYERS[m[1]]) return { name: m[1], variant: parseInt(m[2], 10) };
    return { name: PLAYERS[base] ? base : "", variant: 1 };
  }
  return { name: slot.name || "", variant: slot.variant || 1 };
}

function loadLineup() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        pitcher: normalizeSlot(parsed.pitcher),
        batters: Array.from({ length: 9 }, (_, i) => normalizeSlot(parsed.batters && parsed.batters[i]))
      };
    }
  } catch (e) {}
  return defaultLineup();
}
function saveLineup(l) { localStorage.setItem(STORAGE_KEY, JSON.stringify(l)); }

let lineup = defaultLineup();
let currentOrder = parseInt(localStorage.getItem(ORDER_KEY) || "1", 10);
if (currentOrder < 1 || currentOrder > 9) currentOrder = 1;

function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }

// ---------- DOM ----------
const audioPlayer = document.getElementById("audioPlayer");
const pitcherNameEl = document.getElementById("pitcherName");
const playPitcherBtn = document.getElementById("playPitcher");
const currentOrderNumEl = document.getElementById("currentOrderNum");
const currentBatterNameEl = document.getElementById("currentBatterName");
const playBtn = document.getElementById("playBtn");
const entranceBtn = document.getElementById("entranceBtn");
const variantSwitchEl = document.getElementById("variantSwitch");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const lineupListEl = document.getElementById("lineupList");
const regGridEl = document.getElementById("regGrid");
const tokenInput = document.getElementById("ghToken");
const tokenSaveBtn = document.getElementById("ghTokenSave");
const tokenStatusEl = document.getElementById("ghTokenStatus");
const upNameEl = document.getElementById("upName");
const upTypeEl = document.getElementById("upType");
const upVariantField = document.getElementById("upVariantField");
const upVariantEl = document.getElementById("upVariant");
const upFileEl = document.getElementById("upFile");
const uploadBtn = document.getElementById("uploadBtn");
const uploadProgressEl = document.getElementById("uploadProgress");
const songListEl = document.getElementById("songList");
const refreshBtn = document.getElementById("refreshBtn");
const knownPlayersEl = document.getElementById("knownPlayers");

// ---------- 렌더링 ----------
function buildPlayerOptions(selectedName) {
  let html = `<option value="">-- 선택 --</option>`;
  for (const p of PLAYER_LIST) {
    const sel = p.name === selectedName ? "selected" : "";
    html += `<option value="${p.name}" ${sel}>${p.name}</option>`;
  }
  return html;
}
function buildVariantOptions(name, selectedVariant) {
  const p = getPlayer(name);
  if (!p || p.cheerFiles.length <= 1) return "";
  let html = "";
  for (const c of p.cheerFiles) {
    const sel = c.variant === selectedVariant ? "selected" : "";
    html += `<option value="${c.variant}" ${sel}>응원가 ${c.variant}</option>`;
  }
  return `<select class="variant-select" data-variant-for="${name}">${html}</select>`;
}

function renderRegistration() {
  let html = `
    <div class="reg-row pitcher">
      <div class="pos-tag">P</div>
      <select data-role="pitcher">${buildPlayerOptions(lineup.pitcher.name)}</select>
      ${buildVariantOptions(lineup.pitcher.name, lineup.pitcher.variant)}
    </div>`;

  for (let i = 0; i < 9; i++) {
    const slot = lineup.batters[i];
    html += `
      <div class="reg-row">
        <div class="pos-tag">${i + 1}</div>
        <select data-role="batter" data-index="${i}">${buildPlayerOptions(slot.name)}</select>
        ${buildVariantOptions(slot.name, slot.variant)}
      </div>`;
  }
  regGridEl.innerHTML = html;

  regGridEl.querySelectorAll("select[data-role]").forEach(sel => sel.addEventListener("change", onPlayerSelectChange));
  regGridEl.querySelectorAll("select.variant-select").forEach(sel => sel.addEventListener("change", onVariantSelectChange));
}

function onPlayerSelectChange(e) {
  const sel = e.target;
  const slot = sel.dataset.role === "pitcher" ? lineup.pitcher : lineup.batters[parseInt(sel.dataset.index, 10)];
  slot.name = sel.value;
  slot.variant = 1;
  saveLineup(lineup);
  renderAll();
}
function onVariantSelectChange(e) {
  const sel = e.target;
  const row = sel.closest(".reg-row");
  const playerSel = row.querySelector("select[data-role]");
  const slot = playerSel.dataset.role === "pitcher" ? lineup.pitcher : lineup.batters[parseInt(playerSel.dataset.index, 10)];
  slot.variant = parseInt(sel.value, 10);
  saveLineup(lineup);
  renderAll();
}

function renderLineupList() {
  let html = "";
  for (let i = 0; i < 9; i++) {
    const slot = lineup.batters[i];
    const p = getPlayer(slot.name);
    const active = (i + 1) === currentOrder ? "active" : "";
    let nameHtml;
    if (p) {
      const variantTag = p.cheerFiles.length > 1 ? ` <span class="tag">${slot.variant}번</span>` : "";
      const entranceTag = p.entranceFile ? ` <span class="tag entrance">등장</span>` : "";
      nameHtml = `<span class="pname">${p.name}${variantTag}${entranceTag}</span>`;
    } else {
      nameHtml = `<span class="pname empty">미등록</span>`;
    }
    html += `<li class="${active}"><span class="num">${i + 1}</span>${nameHtml}</li>`;
  }
  lineupListEl.innerHTML = html;
}

function renderNowPlaying() {
  const pPlayer = getPlayer(lineup.pitcher.name);
  pitcherNameEl.textContent = pPlayer ? pPlayer.name : "미등록";
  const pHasEntrance = pPlayer && pPlayer.entranceFile;
  playPitcherBtn.disabled = !pPlayer;
  playPitcherBtn.textContent = pHasEntrance ? "▶ 등장곡 재생" : "▶ 응원가 재생";

  const bSlot = lineup.batters[currentOrder - 1];
  const bPlayer = getPlayer(bSlot.name);
  currentOrderNumEl.textContent = currentOrder;
  currentBatterNameEl.textContent = bPlayer ? bPlayer.name : "미등록";
  playBtn.disabled = !bPlayer || bPlayer.cheerFiles.length === 0;

  if (bPlayer && bPlayer.entranceFile) {
    entranceBtn.hidden = false;
    entranceBtn.disabled = false;
  } else {
    entranceBtn.hidden = true;
  }

  if (bPlayer && bPlayer.cheerFiles.length > 1) {
    variantSwitchEl.hidden = false;
    variantSwitchEl.innerHTML = bPlayer.cheerFiles.map(c =>
      `<button type="button" class="variant-btn ${c.variant === bSlot.variant ? "active" : ""}" data-variant="${c.variant}">${c.variant}번</button>`
    ).join("");
    variantSwitchEl.querySelectorAll(".variant-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        bSlot.variant = parseInt(btn.dataset.variant, 10);
        saveLineup(lineup);
        renderAll();
      });
    });
  } else {
    variantSwitchEl.hidden = true;
    variantSwitchEl.innerHTML = "";
  }
}

function renderKnownPlayers() {
  knownPlayersEl.innerHTML = PLAYER_LIST.map(p => `<option value="${p.name}">`).join("");
}

function renderSongList() {
  if (RAW_FILES.length === 0) {
    songListEl.innerHTML = `<p class="hint">등록된 응원가가 없어요.</p>`;
    return;
  }
  const byPlayer = {};
  Object.values(PLAYERS).forEach(p => { byPlayer[p.name] = p; });
  const names = Object.keys(byPlayer).sort((a, b) => a.localeCompare(b, "ko"));

  let html = "";
  names.forEach(name => {
    const p = byPlayer[name];
    p.cheerFiles.forEach(c => {
      html += songRowHtml(name, `응원가 ${c.variant}번`, c.file);
    });
    if (p.entranceFile) {
      html += songRowHtml(name, "등장곡", p.entranceFile, true);
    }
  });
  songListEl.innerHTML = html;

  songListEl.querySelectorAll(".song-preview").forEach(btn => {
    btn.addEventListener("click", () => playFile(btn.dataset.file));
  });
  songListEl.querySelectorAll(".song-delete").forEach(btn => {
    btn.addEventListener("click", () => deleteSong(btn.dataset.file));
  });
}
function songRowHtml(name, label, file, gold) {
  return `
    <div class="song-row">
      <div class="song-meta"><span class="nm">${name}</span><span class="tag${gold ? " entrance" : ""}">${label}</span></div>
      <div class="song-actions">
        <button type="button" class="icon-btn song-preview" data-file="${file}">▶</button>
        <button type="button" class="icon-btn danger song-delete" data-file="${file}">삭제</button>
      </div>
    </div>`;
}

function renderAll() {
  renderRegistration();
  renderLineupList();
  renderNowPlaying();
  renderKnownPlayers();
  renderSongList();
}

// ---------- 재생 ----------
function playFile(file) {
  if (!file) return;
  audioPlayer.src = encodeURIComponent(file);
  audioPlayer.currentTime = 0;
  audioPlayer.play().catch(err => {
    console.error("재생 실패:", err);
    alert("재생에 실패했습니다. 최근에 등록한 곡이라면 GitHub Pages 반영까지 1분 정도 걸릴 수 있어요.\n(" + file + ")");
  });
}
playBtn.addEventListener("click", () => {
  const slot = lineup.batters[currentOrder - 1];
  playFile(getCheerFile(slot.name, slot.variant));
});
entranceBtn.addEventListener("click", () => {
  const slot = lineup.batters[currentOrder - 1];
  playFile(getEntranceFile(slot.name));
});
playPitcherBtn.addEventListener("click", () => {
  const entrance = getEntranceFile(lineup.pitcher.name);
  playFile(entrance || getCheerFile(lineup.pitcher.name, lineup.pitcher.variant));
});
nextBtn.addEventListener("click", () => {
  currentOrder = currentOrder === 9 ? 1 : currentOrder + 1;
  localStorage.setItem(ORDER_KEY, String(currentOrder));
  renderAll();
});
prevBtn.addEventListener("click", () => {
  currentOrder = currentOrder === 1 ? 9 : currentOrder - 1;
  localStorage.setItem(ORDER_KEY, String(currentOrder));
  renderAll();
});

// ---------- GitHub API ----------
function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}
function ghHeaders() {
  return {
    Authorization: `token ${getToken()}`,
    Accept: "application/vnd.github+json"
  };
}
async function ghGetFile(path) {
  const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${encodePath(path)}?ref=${GH_BRANCH}`, {
    headers: ghHeaders()
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`조회 실패 (${res.status})`);
  return res.json();
}
async function ghPutFile(path, base64Content, message, sha) {
  const body = { message, content: base64Content, branch: GH_BRANCH };
  if (sha) body.sha = sha;
  const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${encodePath(path)}`, {
    method: "PUT",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`업로드 실패 (${res.status}): ${t.slice(0, 200)}`);
  }
  return res.json();
}
async function ghDeleteFile(path, message, sha) {
  const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${encodePath(path)}`, {
    method: "DELETE",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ message, sha, branch: GH_BRANCH })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`삭제 실패 (${res.status}): ${t.slice(0, 200)}`);
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
function b64ToUtf8(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

async function updateManifest(mutateFn) {
  const existing = await ghGetFile(SONGS_JSON_PATH);
  let list = existing ? JSON.parse(b64ToUtf8(existing.content)) : [];
  list = mutateFn(list);
  list.sort((a, b) => a.localeCompare(b, "ko"));
  const contentB64 = utf8ToB64(JSON.stringify(list, null, 2) + "\n");
  await ghPutFile(SONGS_JSON_PATH, contentB64, "Update songs.json", existing ? existing.sha : null);
}

function buildFilename(player, type, variant) {
  if (type === "entrance") return player + "등장.wav";
  const v = parseInt(variant, 10) || 1;
  return player + (v > 1 ? String(v) : "") + ".wav";
}

function setProgress(text) { uploadProgressEl.textContent = text; }

uploadBtn.addEventListener("click", async () => {
  const player = upNameEl.value.trim();
  const type = upTypeEl.value;
  const variant = upVariantEl.value;
  const file = upFileEl.files[0];

  if (!getToken()) { setProgress("GitHub 토큰을 먼저 입력하고 저장하세요."); return; }
  if (!/^[0-9A-Za-z가-힣]+$/.test(player)) { setProgress("선수 이름은 한글/영문/숫자만 입력하세요."); return; }
  if (!file) { setProgress("음원 파일을 선택하세요."); return; }

  uploadBtn.disabled = true;
  try {
    const filename = buildFilename(player, type, variant);
    setProgress("파일 읽는 중...");
    const base64 = await fileToBase64(file);

    setProgress("GitHub에 업로드 중...");
    const existingFile = await ghGetFile(filename);
    await ghPutFile(filename, base64, `Add cheer song: ${filename}`, existingFile ? existingFile.sha : null);

    setProgress("목록 갱신 중...");
    await updateManifest(list => (list.includes(filename) ? list : [...list, filename]));

    setProgress("등록 완료! GitHub Pages 반영까지 1분 정도 걸려요.");
    upFileEl.value = "";
    await refreshPlayers();
    renderAll();
  } catch (err) {
    console.error(err);
    setProgress(err.message || "등록 중 오류가 발생했어요.");
  } finally {
    uploadBtn.disabled = false;
  }
});

async function deleteSong(filename) {
  if (!getToken()) { alert("GitHub 토큰을 먼저 입력하세요."); return; }
  if (!confirm(`"${filename}" 응원가를 삭제할까요?`)) return;
  try {
    const existingFile = await ghGetFile(filename);
    if (existingFile) await ghDeleteFile(filename, `Remove cheer song: ${filename}`, existingFile.sha);
    await updateManifest(list => list.filter(f => f !== filename));
    await refreshPlayers();
    renderAll();
  } catch (err) {
    console.error(err);
    alert(err.message || "삭제 중 오류가 발생했어요.");
  }
}

// ---------- 토큰 UI ----------
function renderTokenStatus() {
  tokenStatusEl.textContent = getToken() ? "토큰이 저장되어 있어요 (이 브라우저에만 보관)." : "토큰이 없으면 등록/삭제를 할 수 없어요.";
}
tokenSaveBtn.addEventListener("click", () => {
  setToken(tokenInput.value.trim());
  tokenInput.value = "";
  renderTokenStatus();
});
upTypeEl.addEventListener("change", () => {
  upVariantField.style.display = upTypeEl.value === "entrance" ? "none" : "";
});
refreshBtn.addEventListener("click", async () => {
  refreshBtn.disabled = true;
  await refreshPlayers();
  lineup = normalizeAll(lineup);
  renderAll();
  refreshBtn.disabled = false;
});
function normalizeAll(l) {
  return {
    pitcher: normalizeSlot(l.pitcher),
    batters: l.batters.map(normalizeSlot)
  };
}

// ---------- 초기화 ----------
(async function init() {
  await refreshPlayers();
  lineup = normalizeAll(loadLineup());
  renderTokenStatus();
  renderAll();
})();
