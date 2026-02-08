// ==========================================
// 1. KONFIGURATION (LINKS & SETTINGS)
// ==========================================
const GIST_BASE = 'https://gist.githubusercontent.com/MarianWillms-7/90383d1eeb8d52c4083a3542c8400ba4/raw/';
const DATA_URL = GIST_BASE + 'steam_activity_log.json';
const LIB_URL = GIST_BASE + 'steam_library.json';
const META_URL = GIST_BASE + 'steam_metadata.json'; // NEU für Performance

const MAX_TRACKER_DELAY_MINUTES = 120; 
const STEAM_LOGO_URL = 'https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg';
const DEFAULT_AVATAR = 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png';

// ==========================================
// 2. GLOBALE VARIABLEN
// ==========================================
let rawData = [];
let libDataAll = {}; 
let metadataCache = {};
let currentUser = null; 
let allUsers = []; 
let gameDataCache = {}; 

let myChart = null;
let myPieChart = null; 
let currentChartType = 'daily';
let currentTimeRange = 7; 
let currentGameId = null; 
let currentUnplayed = [];
let globalGameStats = {}; 

// Startet das Laden
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    loadData();
    updateVisitCounter();
});

// ==========================================
// 3. HAUPTFUNKTION: DATEN LADEN (MIT CACHING)
// ==========================================
async function loadData() {
    const loadingEl = document.getElementById('loading');
    if(loadingEl) loadingEl.style.display = 'block';

    // A) Caching prüfen (5 Minuten)
    const cachedData = localStorage.getItem('steam_tracker_cache');
    if (cachedData) {
        const parsed = JSON.parse(cachedData);
        if (Date.now() - parsed.timestamp < 300000) {
            console.log("Nutze Cache...");
            rawData = parsed.rawData;
            libDataAll = parsed.libDataAll;
            metadataCache = parsed.metadataCache || {};
            finalizeLoad();
            return;
        }
    }

    try {
        console.log("Lade frische Daten..."); 
        const [rLog, rLib, rMeta] = await Promise.all([
            fetch(DATA_URL + '?t=' + Date.now()),
            fetch(LIB_URL + '?t=' + Date.now()),
            fetch(META_URL + '?t=' + Date.now()).catch(() => null)
        ]);

        if (!rLog.ok) throw new Error("Fehler beim Laden des Logs");
        
        rawData = await rLog.json();
        if(rLib.ok) libDataAll = await rLib.json();
        if(rMeta && rMeta.ok) metadataCache = await rMeta.json();

        // Im LocalStorage speichern
        localStorage.setItem('steam_tracker_cache', JSON.stringify({
            timestamp: Date.now(),
            rawData, libDataAll, metadataCache
        }));

        finalizeLoad();
    } catch (e) { 
        console.error("KRITISCHER FEHLER:", e);
        if(loadingEl) loadingEl.innerText = "Fehler: " + e.message; 
    }
}

function finalizeLoad() {
    const userSet = new Set();
    rawData.forEach(e => userSet.add(e.name));
    allUsers = Array.from(userSet);
    
    const sel = document.getElementById('userSelect');
    const vs1 = document.getElementById('vsSelect1');
    const vs2 = document.getElementById('vsSelect2');

    if(sel) {
        sel.innerHTML = "";
        if(vs1) vs1.innerHTML = "<option value=''>Wählen...</option>";
        if(vs2) vs2.innerHTML = "<option value=''>Wählen...</option>";

        allUsers.forEach(u => {
            sel.appendChild(new Option(u, u));
            if(vs1) vs1.appendChild(new Option(u, u));
            if(vs2) vs2.appendChild(new Option(u, u));
        });
    }

    if(!currentUser && rawData.length > 0) {
        currentUser = rawData[rawData.length-1].name;
        if(sel) sel.value = currentUser;
    }

    renderOnlineBar(); 
    updateLeaderboard(); 
    processData();
    preloadGames();

    if(document.getElementById('loading')) document.getElementById('loading').style.display = 'none';
}

// ==========================================
// 4. THEME & UI LOGIK
// ==========================================
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const btn = document.getElementById('themeToggle');
    if (savedTheme === 'steam-blue') {
        document.body.classList.add('steam-blue-theme');
        if(btn) btn.innerText = "☀️ Light Mode";
    }
}

function toggleTheme() {
    document.body.classList.toggle('steam-blue-theme');
    const isBlue = document.body.classList.contains('steam-blue-theme');
    const btn = document.getElementById('themeToggle');
    if(btn) btn.innerText = isBlue ? "☀️ Light Mode" : "🌙 Dark Mode";
    localStorage.setItem('theme', isBlue ? 'steam-blue' : 'default');
}

function renderOnlineBar() {
    const container = document.getElementById('onlineBar');
    if(!container) return;
    container.innerHTML = "";
    
    let userStatusList = [];
    allUsers.forEach(user => {
        const userEntries = rawData.filter(e => e.name === user);
        if(userEntries.length > 0) userStatusList.push(userEntries[userEntries.length - 1]);
    });

    userStatusList.sort((a, b) => {
        let aScore = a.game ? 2 : (a.status !== 0 ? 1 : 0);
        let bScore = b.game ? 2 : (b.status !== 0 ? 1 : 0);
        return bScore - aScore;
    });

    userStatusList.forEach(u => {
        let statusClass = (u.game) ? "status-ingame" : (u.status !== 0 ? "status-online" : "status-offline");
        let avatarUrl = u.avatar || DEFAULT_AVATAR;
        let div = document.createElement('div');
        div.className = `online-user ${u.name === currentUser ? 'active' : ''}`;
        div.onclick = () => switchUser(u.name);
        div.innerHTML = `<div style="position:relative;"><img src="${avatarUrl}" class="online-avatar ${statusClass}"></div><span class="online-name">${u.name}</span>`;
        container.appendChild(div);
    });
}

function processData() {
    if (rawData.length === 0) return;
    const userLog = rawData.filter(e => e.name === currentUser);
    const lastEntry = userLog[userLog.length - 1] || {};
    
    // Header & Info Updates
    const timeEl = document.getElementById('lastUpdate');
    if(timeEl && lastEntry.time) {
        let t = lastEntry.time.endsWith("Z") ? lastEntry.time : lastEntry.time + "Z";
        timeEl.innerText = new Date(t).toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit'});
    }

    const headerImg = document.getElementById('userAvatar');
    if(headerImg) headerImg.src = lastEntry.avatar || DEFAULT_AVATAR;

    // Reset Completion
    let cb = document.getElementById('compRateVal'); if(cb) { cb.innerText="Start ↻"; cb.style.color="#fbbf24"; }

    updateBadgesDisplay(calculateBadges(userLog));
    const stats = calculateStats(userLog);
    globalGameStats = stats.gameStats;
    
    updateStatusDisplay(lastEntry);
    calculateTrends(userLog);
    
    if(document.getElementById('myChart')) updateBarChart(stats.filteredData, userLog);
    if(document.getElementById('myPieChart')) updatePieChart(stats.gameStats, stats.totalMins);
    
    renderHeatmap(userLog);
    calculateRecords(userLog);
    updateDynamicColors(lastEntry.game_id);

    if(lastEntry.game_id) {
        let bg = document.getElementById('dynamic-bg');
        if(bg) {
            bg.style.backgroundImage = `url('https://cdn.akamai.steamstatic.com/steam/apps/${lastEntry.game_id}/header.jpg')`;
            bg.style.opacity = "0.3";
        }
    }
}

function updateDynamicColors(gameId) {
    if (!gameId) return;
    const accentColor = metadataCache[gameId]?.color || '#66c0f4';
    document.documentElement.style.setProperty('--accent', accentColor);
}

// ==========================================
// 5. HELFER & RECAP (KORRIGIERT)
// ==========================================
function calculateRecap() {
    const totalHoursText = document.getElementById('totalHours')?.innerText || "0h";
    const recapTotal = document.getElementById('recapTotalTime');
    if(recapTotal) recapTotal.innerText = totalHoursText;

    const userLog = rawData.filter(e => e.name === currentUser);
    if(!userLog.length) return;

    let games = {}, dayActivity = {};
    userLog.forEach((e, i) => {
        if(e.status !== 0 && userLog[i + 1]) {
            let d = getDuration(e, userLog[i + 1]);
            let g = e.game || "PC / Desktop";
            games[g] = (games[g] || 0) + d;
            let dayKey = new Date(e.time).toLocaleDateString('de-DE');
            dayActivity[dayKey] = (dayActivity[dayKey] || 0) + d;
        }
    });

    const topGame = Object.entries(games).sort((a, b) => b[1] - a[1])[0];
    const topDay = Object.entries(dayActivity).sort((a, b) => b[1] - a[1])[0];

    if(document.getElementById('recapTopGame')) document.getElementById('recapTopGame').innerText = topGame ? topGame[0] : "-";
    if(document.getElementById('recapTopDay')) document.getElementById('recapTopDay').innerText = topDay ? topDay[0] : "-";
    if(document.getElementById('recapTopDayVal')) document.getElementById('recapTopDayVal').innerText = topDay ? (topDay[1] / 60).toFixed(1) + " Std" : "0 Std";

    generateTagCloud();
}

async function generateTagCloud() {
    const c = document.getElementById('tagCloud'); if(!c) return;
    c.innerHTML = "Analysiere Genres...";
    let tags = {};
    
    const userLog = rawData.filter(e => e.name === currentUser);
    userLog.forEach(e => {
        if(e.game_id && metadataCache[e.game_id]) {
            metadataCache[e.game_id].genres.forEach(g => {
                tags[g] = (tags[g] || 0) + 1;
            });
        }
    });

    let sorted = Object.entries(tags).sort((a,b) => b[1] - a[1]);
    if(!sorted.length) { c.innerHTML = "Keine Daten"; return; }
    
    let max = sorted[0][1];
    c.innerHTML = sorted.slice(0, 10).map(([t, val]) => {
        let size = val > max * 0.7 ? "tag-l" : (val > max * 0.4 ? "tag-m" : "tag-s");
        return `<span class="tag-cloud-item ${size}">${t}</span>`;
    }).join('');
}

function getDuration(e, next) { 
    if(next) { 
        let diff = (new Date(next.time) - new Date(e.time)) / 60000; 
        return diff > MAX_TRACKER_DELAY_MINUTES + 10 ? 30 : diff; 
    } 
    return 30; 
}

// ... Hier folgen deine restlichen Funktionen (updateStatusDisplay, calculateStats, updateBarChart, etc.) ...
// Alle Leaderboard- und Library-Funktionen aus deiner Vorlage bleiben unverändert erhalten.

function switchUser(name) { 
    currentUser = name; 
    const sel = document.getElementById('userSelect');
    if(sel) sel.value = name;
    document.getElementById('mainHeader').classList.remove('details-open'); 
    processData(); 
    renderOnlineBar();
}

async function updateVisitCounter() {
    let el = document.getElementById('visitCounter');
    let url = "https://api.counterapi.dev/v1/marianwillms-7-steam-activity/views/up";
    try {
        let r = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`);
        let j = await r.json();
        if(el) el.innerText = j.count;
    } catch(e) { if(el) el.innerText = "(Blockiert)"; }
}

function openLightbox(imageUrl) { document.getElementById('lightboxImg').src = imageUrl; document.getElementById('lightbox').classList.add('active'); }
function closeLightbox() { document.getElementById('lightbox').classList.remove('active'); }
function showRecap() { calculateRecap(); document.getElementById('recapModal').classList.add('active'); confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } }); }
function closeRecap() { document.getElementById('recapModal').classList.remove('active'); }
function showShame() { document.getElementById('shameModal').classList.add('active'); renderShameList(); }
function closeShame() { document.getElementById('shameModal').classList.remove('active'); }
