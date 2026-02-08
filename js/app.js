// ==========================================
// 1. KONFIGURATION
// ==========================================
const GIST_BASE = 'https://gist.githubusercontent.com/MarianWillms-7/90383d1eeb8d52c4083a3542c8400ba4/raw/';
const DATA_URL = GIST_BASE + 'steam_activity_log.json';
const LIB_URL = GIST_BASE + 'steam_library.json';
const META_URL = GIST_BASE + 'steam_metadata.json';

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

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    loadData();
    updateVisitCounter();
});

// ==========================================
// 3. DATEN LADEN & RENDERN
// ==========================================
async function loadData() {
    const loadingEl = document.getElementById('loading');
    if(loadingEl) loadingEl.style.display = 'block';

    try {
        console.log("Lade Daten..."); 
        const [rLog, rLib, rMeta] = await Promise.all([
            fetch(DATA_URL + '?t=' + Date.now()).then(r => r.json()),
            fetch(LIB_URL + '?t=' + Date.now()).then(r => r.json()).catch(() => ({})),
            fetch(META_URL + '?t=' + Date.now()).then(r => r.json()).catch(() => ({}))
        ]);

        rawData = rLog;
        libDataAll = rLib;
        metadataCache = rMeta;

        // User Setup
        const userSet = new Set();
        rawData.forEach(e => userSet.add(e.name));
        allUsers = Array.from(userSet);
        
        if(!currentUser && allUsers.length > 0) {
            currentUser = allUsers[allUsers.length - 1];
        }

        renderAll();

    } catch (e) { 
        console.error("Fehler:", e);
        if(loadingEl) loadingEl.innerText = "Ladefehler!"; 
    }
}

function renderAll() {
    setupUserSelects();
    renderOnlineBar(); 
    updateLeaderboard(); 
    processData();
    if(document.getElementById('loading')) document.getElementById('loading').style.display = 'none';
}

function setupUserSelects() {
    const sel = document.getElementById('userSelect');
    const vs1 = document.getElementById('vsSelect1');
    const vs2 = document.getElementById('vsSelect2');

    if(sel) {
        sel.innerHTML = "";
        allUsers.forEach(u => sel.appendChild(new Option(u, u)));
        sel.value = currentUser;
    }
    if(vs1) {
        vs1.innerHTML = "<option value=''>Wählen...</option>";
        allUsers.forEach(u => vs1.appendChild(new Option(u, u)));
    }
    if(vs2) {
        vs2.innerHTML = "<option value=''>Wählen...</option>";
        allUsers.forEach(u => vs2.appendChild(new Option(u, u)));
    }
}

// ==========================================
// 4. UI FUNKTIONEN
// ==========================================
function renderOnlineBar() {
    const container = document.getElementById('onlineBar');
    if(!container) return;
    container.innerHTML = "";
    
    allUsers.forEach(user => {
        const uEntries = rawData.filter(e => e.name === user);
        const u = uEntries[uEntries.length - 1];
        if(!u) return;

        let statusClass = u.game ? "status-ingame" : (u.status !== 0 ? "status-online" : "status-offline");
        let div = document.createElement('div');
        div.className = `online-user ${u.name === currentUser ? 'active' : ''}`;
        div.onclick = () => switchUser(u.name);
        div.innerHTML = `<img src="${u.avatar || DEFAULT_AVATAR}" class="online-avatar ${statusClass}"><span class="online-name">${u.name}</span>`;
        container.appendChild(div);
    });
}

function processData() {
    const userLog = rawData.filter(e => e.name === currentUser);
    const lastEntry = userLog[userLog.length - 1] || {};
    
    // Status Display
    updateStatusDisplay(lastEntry);

    // Stats berechnen
    const stats = calculateStats(userLog);
    globalGameStats = stats.gameStats;
    
    // Diagramme
    updateBarChart(stats.filteredData, userLog);
    updatePieChart(stats.gameStats, stats.totalMins);
    
    // Sonstiges
    renderHeatmap(userLog);
    calculateRecords(userLog);
    updateBadgesDisplay(calculateBadges(userLog));
    calculateTrends(userLog);

    // Background
    if(lastEntry.game_id) {
        document.getElementById('dynamic-bg').style.backgroundImage = `url('https://cdn.akamai.steamstatic.com/steam/apps/${lastEntry.game_id}/header.jpg')`;
        document.getElementById('dynamic-bg').style.opacity = "0.3";
    }
}

// ==========================================
// 5. BUTTON FUNKTIONEN (FIXED)
// ==========================================
function toggleTheme() {
    document.body.classList.toggle('steam-blue-theme');
    const isBlue = document.body.classList.contains('steam-blue-theme');
    document.getElementById('themeToggle').innerText = isBlue ? "☀️ Light Mode" : "🌙 Dark Mode";
    localStorage.setItem('theme', isBlue ? 'steam-blue' : 'default');
}

function initTheme() {
    if (localStorage.getItem('theme') === 'steam-blue') {
        document.body.classList.add('steam-blue-theme');
        if(document.getElementById('themeToggle')) document.getElementById('themeToggle').innerText = "☀️ Light Mode";
    }
}

function showRecap() {
    const userLog = rawData.filter(e => e.name === currentUser);
    const totalHours = document.getElementById('totalHours').innerText;
    document.getElementById('recapTotalTime').innerText = totalHours;

    let games = {}, days = {};
    userLog.forEach((e, i) => {
        if(e.status !== 0 && userLog[i+1]) {
            let d = (new Date(userLog[i+1].time) - new Date(e.time)) / 60000;
            if(d > 130) d = 30;
            games[e.game || "PC"] = (games[e.game || "PC"] || 0) + d;
            let date = new Date(e.time).toLocaleDateString();
            days[date] = (days[date] || 0) + d;
        }
    });

    const topG = Object.entries(games).sort((a,b) => b[1]-a[1])[0];
    const topD = Object.entries(days).sort((a,b) => b[1]-a[1])[0];

    document.getElementById('recapTopGame').innerText = topG ? topG[0] : "-";
    document.getElementById('recapTopDay').innerText = topD ? topD[0] : "-";
    document.getElementById('recapTopDayVal').innerText = topD ? (topD[1]/60).toFixed(1) + " Std" : "0";

    generateTagCloud();
    document.getElementById('recapModal').classList.add('active');
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
}

// ... (Restliche Hilfsfunktionen wie calculateStats, updateBarChart etc. aus deinem funktionierenden Backup einfügen)
