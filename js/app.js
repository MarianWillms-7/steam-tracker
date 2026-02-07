// --- GLOBALE VARIABLEN ---
let rawData = [];
let libDataAll = {}; 
let currentUser = null; 
let allUsers = []; 

// CACHE FÜR SPIELDATEN
let gameDataCache = {}; 

let myChart = null;
let myPieChart = null; 
let currentChartType = 'daily';
let currentTimeRange = 7; 
let liveTimer = null; 
let currentGameId = null; 
let currentUnplayed = [];
let globalGameStats = {}; 

document.addEventListener("DOMContentLoaded", loadData);

// --- UX HELPERS ---
function openLightbox(imageUrl) { document.getElementById('lightboxImg').src = imageUrl; document.getElementById('lightbox').classList.add('active'); }
function closeLightbox() { document.getElementById('lightbox').classList.remove('active'); }
function showRecap() { calculateRecap(); document.getElementById('recapModal').classList.add('active'); confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#66c0f4', '#ffffff', '#1b2838'] }); }
function closeRecap() { document.getElementById('recapModal').classList.remove('active'); }
function openUserModal() { document.getElementById('userModal').classList.add('active'); }
function closeUserModal() { document.getElementById('userModal').classList.remove('active'); }
function showShame() { document.getElementById('shameModal').classList.add('active'); renderShameList(); }
function closeShame() { document.getElementById('shameModal').classList.remove('active'); }

// --- DATA LOAD ---
async function loadData() {
    document.getElementById('loading').style.display = 'block';
    try {
        // Activity Log laden (mit Cache-Buster ?t=...)
        const r1 = await fetch(DATA_URL + '?t=' + Date.now());
        if (!r1.ok) throw new Error("Fehler beim Laden (HTTP " + r1.status + ")");
        const textData = await r1.text();
        try { rawData = JSON.parse(textData); } 
        catch (jsonError) { throw new Error("Daten sind kein gültiges JSON. Link prüfen!"); }

        // Library laden
        try { 
            const r2 = await fetch(LIB_URL + '?t=' + Date.now()); 
            libDataAll = await r2.json(); 
        } catch(e) { console.log("Library konnte nicht geladen werden:", e); }

        const userSet = new Set();
        rawData.forEach(e => userSet.add(e.name));
        allUsers = Array.from(userSet);
        
        const sel = document.getElementById('userSelect');
        sel.innerHTML = "";
        allUsers.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u; opt.innerText = u;
            sel.appendChild(opt);
        });

        if(!currentUser && rawData.length > 0) {
            currentUser = rawData[rawData.length-1].name;
            sel.value = currentUser;
        }

        renderOnlineBar(); 
        updateLeaderboard(); 
        processData();
        
        // Preloading starten
        preloadGames();

        document.getElementById('loading').style.display = 'none';
    } catch (e) { 
        console.error(e);
        document.getElementById('loading').innerText = "Fehler: " + e.message; 
    }
}

// --- CACHE UND PRELOADING LOGIK ---
async function preloadGames() {
    let uniqueGameIds = new Set();
    rawData.forEach(e => { if(e.game_id) uniqueGameIds.add(e.game_id); });
    for (let id of uniqueGameIds) {
        if (!gameDataCache[id]) {
            await fetchGameDataInternal(id);
            await new Promise(r => setTimeout(r, 500));
        }
    }
}

async function fetchGameDataInternal(id) {
    if(gameDataCache[id]) return gameDataCache[id];
    const targetUrl = `https://store.steampowered.com/api/appdetails?appids=${id}&cc=de&l=german`;
    let data = null;
    const isValid = (j) => j && j[id] && j[id].success;

    try { 
        let r = await fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`);
        let j = await r.json(); 
        if(isValid(j)) data = j[id].data; 
    } catch(e) {}

    if(!data) {
        try { 
            let r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`);
            let j = await r.json(); 
            if(isValid(j)) data = j[id].data; 
        } catch(e) {}
    }
    if(data) gameDataCache[id] = data;
    return data;
}

// --- GLOBAL LEADERBOARD ---
function updateLeaderboard() {
    let weekStats = [];
    const now = new Date();
    const oneWeekAgo = new Date(); oneWeekAgo.setDate(now.getDate() - 7);
    
    allUsers.forEach(u => {
        let uLog = rawData.filter(e => e.name === u && new Date(e.time) >= oneWeekAgo);
        let mins = 0;
        uLog.forEach((e, i) => { if(e.status!==0 && uLog[i+1]) mins += getDuration(e, uLog[i+1]); });
        weekStats.push({name: u, val: mins});
    });
    weekStats.sort((a,b) => b.val - a.val);
    renderLBItem('lb-week', weekStats, 'Std', 60);

    let libStats = [];
    let shameStats = [];
    allUsers.forEach(u => {
        let entry = rawData.find(e => e.name === u);
        let sid = entry ? entry.steam_id : null;
        if(sid && libDataAll[sid]) {
            libStats.push({name: u, val: libDataAll[sid].length});
            let unplayed = libDataAll[sid].filter(g => g.playtime_forever < 120).length;
            shameStats.push({name: u, val: unplayed});
        }
    });
    libStats.sort((a,b) => b.val - a.val);
    renderLBItem('lb-lib', libStats, 'Spiele', 1);
    
    shameStats.sort((a,b) => b.val - a.val);
    renderLBItem('lb-shame', shameStats, 'Stück', 1);
}

function renderLBItem(id, data, unit, div) {
    let el = document.getElementById(id);
    if(!data.length) { el.innerHTML = '<div style="color:#666">Keine Daten</div>'; return; }
    
    let html = '';
    data.slice(0, 3).forEach((d, i) => {
        let userEntry = rawData.find(e => e.name === d.name);
        let avatar = userEntry ? (userEntry.avatar || DEFAULT_AVATAR) : DEFAULT_AVATAR;
        let crown = i===0 ? '👑' : (i===1 ? '🥈' : '🥉');
        html += `
        <div class="lb-item">
            <div class="lb-label">${crown} Platz ${i+1}</div>
            <div class="lb-winner">
                <img src="${avatar}" class="lb-avatar">
                <span class="lb-name">${d.name}</span>
                <span class="lb-val">${(d.val/div).toFixed(div===1?0:1)} ${unit}</span>
            </div>
        </div>`;
    });
    el.innerHTML = html;
}

// --- BADGES LOGIC ---
function calculateBadges(userLog) {
    let badges = [];
    if(!userLog || userLog.length === 0) return badges;
    let nightMins = 0, totalMins = 0;
    userLog.forEach((e, i) => {
        if(e.status!==0 && userLog[i+1]) {
            let d = getDuration(e, userLog[i+1]);
            totalMins += d;
            let h = new Date(e.time).getHours();
            if(h >= 2 && h < 6) nightMins += d;
        }
    });
    if(totalMins > 60 && (nightMins / totalMins) > 0.3) badges.push({icon:'🦉', title:'Nachteule: Spielt oft nachts'});
    let weekendMins = 0;
    userLog.forEach((e, i) => {
        if(e.status!==0 && userLog[i+1]) {
            let d = getDuration(e, userLog[i+1]);
            let day = new Date(e.time).getDay();
            if(day === 0 || day === 6) weekendMins += d;
        }
    });
    if(totalMins > 120 && (weekendMins / totalMins) > 0.6) badges.push({icon:'⚔️', title:'Weekend Warrior: Zockt fast nur am Wochenende'});
    let recentGames = new Set();
    const days30 = new Date(); days30.setDate(days30.getDate() - 30);
    userLog.filter(e => new Date(e.time) >= days30 && e.game).forEach(e => recentGames.add(e.game));
    if(recentGames.size === 1 && totalMins > 180) badges.push({icon:'💍', title:'Der Treue: Nur ein Spiel im letzten Monat'});
    let weekGames = new Set();
    const days7 = new Date(); days7.setDate(days7.getDate() - 7);
    userLog.filter(e => new Date(e.time) >= days7 && e.game).forEach(e => weekGames.add(e.game));
    if(weekGames.size >= 5) badges.push({icon:'📺', title:'Variety Streamer: Zockt alles querbeet'});
    return badges;
}

function updateBadgesDisplay(badges) {
    const container = document.getElementById('userBadges');
    container.innerHTML = "";
    badges.forEach(b => { container.innerHTML += `<span class="badge-icon" title="${b.title}">${b.icon}</span>`; });
}

// --- MAIN LOGIC ---
function renderOnlineBar() {
    const container = document.getElementById('onlineBar');
    container.innerHTML = "";
    let userStatusList = [];
    let userPlaytimes = {};
    let maxPlaytime = -1;
    let topUser = null;
    allUsers.forEach(user => {
        const userEntries = rawData.filter(e => e.name === user);
        if(userEntries.length > 0) userStatusList.push(userEntries[userEntries.length - 1]);
        let playtime = calculateTotalPlaytimeForUser(user);
        userPlaytimes[user] = playtime;
        if (playtime > maxPlaytime) { maxPlaytime = playtime; topUser = user; }
    });
    userStatusList.sort((a, b) => {
        let aScore = a.game ? 2 : (a.status !== 0 ? 1 : 0);
        let bScore = b.game ? 2 : (b.status !== 0 ? 1 : 0);
        return bScore - aScore;
    });
    userStatusList.forEach(u => {
        let statusClass = "status-offline";
        if (u.game) statusClass = "status-ingame";
        else if (u.status !== 0) statusClass = "status-online";
        let avatarUrl = u.avatar || DEFAULT_AVATAR;
        let div = document.createElement('div');
        div.className = `online-user ${u.name === currentUser ? 'active' : ''}`;
        let crownHtml = '';
        if (u.name === topUser && maxPlaytime > 0) crownHtml = '<span class="crown-overlay">👑</span>';
        div.onclick = () => { document.getElementById('userSelect').value = u.name; switchUser(u.name); };
        div.innerHTML = `<div style="position:relative;"><img src="${avatarUrl}" class="online-avatar ${statusClass}">${crownHtml}</div><span class="online-name">${u.name}</span>`;
        container.appendChild(div);
    });
}

function switchUser(name) { 
    currentUser = name; 
    document.getElementById('mainHeader').classList.remove('details-open');
    document.getElementById('gameDetailsExpanded').classList.remove('open');
    document.getElementById('gameDetailsContent').innerHTML = "";
    currentGameId = null;
    renderOnlineBar(); 
    processData(); 
}

function processData() {
    if (rawData.length === 0) return;
    const userLog = rawData.filter(e => e.name === currentUser);
    const lastEntry = userLog[userLog.length - 1] || {};
    
    // ZEIT FIX FÜR ANZEIGE
    if (lastEntry.time) {
        let timeString = lastEntry.time;
        if (!timeString.endsWith("Z")) timeString += "Z";
        let dateObj = new Date(timeString);
        document.getElementById('lastUpdate').innerText = dateObj.toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit'});
    } else {
        document.getElementById('lastUpdate').innerText = "-";
    }

    const headerImg = document.getElementById('userAvatar');
    headerImg.src = lastEntry.avatar || DEFAULT_AVATAR;

    if (userLog.length > 0) {
        document.getElementById('footerInfo').innerText = `Datensätze: ${userLog.length}`;
    }

    let badges = calculateBadges(userLog);
    updateBadgesDisplay(badges);

    const stats = calculateStats(userLog);
    globalGameStats = stats.gameStats;
    
    updateStatusDisplay(lastEntry);
    updateBarChart(stats.filteredData, userLog);
    updatePieChart(stats.gameStats, stats.totalMins);
    renderHeatmap(userLog);
    calculateRecords(userLog);
}

function calculateStats(userLog) {
    let totalMinutes = 0;
    let dayCounts = {};
    let gameStats = {}; 
    let filtered = userLog;
    
    let todayMinutes = 0;
    const startOfToday = new Date();
    startOfToday.setHours(0,0,0,0); 

    userLog.forEach((entry, idx) => {
        if (entry.status !== 0) {
            let duration = getDuration(entry, userLog[idx + 1]);
            if (new Date(entry.time) >= startOfToday) {
                todayMinutes += duration;
            }
        }
    });
    document.getElementById('todayHours').innerText = (todayMinutes / 60).toFixed(1) + "h";

    if (currentTimeRange === 0) { 
            filtered = userLog.filter(e => new Date(e.time) >= startOfToday);
    } else if (currentTimeRange !== 9999) {
        const cut = new Date(); cut.setDate(cut.getDate() - currentTimeRange);
        filtered = userLog.filter(e => new Date(e.time) >= cut);
    }

    for (let i = 0; i < filtered.length; i++) {
        let entry = filtered[i];
        if (entry.status !== 0) { 
            let globalIdx = userLog.indexOf(entry);
            let nextEntry = userLog[globalIdx + 1];
            let duration = getDuration(entry, nextEntry);
            totalMinutes += duration;
            let d = new Date(entry.time).toLocaleDateString('de-DE', {weekday: 'long'});
            dayCounts[d] = (dayCounts[d] || 0) + 1;
            let gName = entry.game || "Steam / Desktop"; 
            if (!gameStats[gName]) gameStats[gName] = { minutes: 0, id: entry.game_id, lastPlayed: entry.time, isDesktop: !entry.game };
            gameStats[gName].minutes += duration;
            gameStats[gName].lastPlayed = entry.time; 
        }
    }

    // --- GESAMT ONLINE ZEIT: VON STEAM HOLEN ---
    let entry = rawData.find(e => e.name === currentUser);
    let sid = entry ? entry.steam_id : null;
    if (sid && libDataAll[sid]) {
        let steamTotalMinutes = 0;
        libDataAll[sid].forEach(g => steamTotalMinutes += g.playtime_forever);
        document.getElementById('totalHours').innerText = (steamTotalMinutes / 60).toFixed(1) + " h";
    } else {
        document.getElementById('totalHours').innerText = (totalMinutes / 60).toFixed(1) + " h";
    }

    let maxDay="-", maxVal=0; for(let [k,v] of Object.entries(dayCounts)) if(v>maxVal){maxVal=v; maxDay=k;}
    document.getElementById('topDay').innerText = maxDay;

    renderLibraryList(gameStats);
    return { filteredData: filtered, gameStats: gameStats, totalMins: totalMinutes }; 
}

function calculateTotalPlaytimeForUser(userName) {
    let t = 0;
    let userLog = rawData.filter(e => e.name === userName);
    userLog.forEach((e, i) => {
        if (e.status !== 0 && userLog[i + 1]) t += getDuration(e, userLog[i + 1]);
    });
    return t;
}

function getDuration(e, next) {
    if(next) {
        let diff = (new Date(next.time) - new Date(e.time)) / 60000;
        return diff > MAX_TRACKER_DELAY_MINUTES + 10 ? 30 : diff;
    }
    let diff = (new Date() - new Date(e.time)) / 60000;
    return diff > MAX_TRACKER_DELAY_MINUTES ? 30 : diff;
}

function updateBarChart(data, fullLog) {
    const ctx = document.getElementById('myChart').getContext('2d');
    if (myChart) myChart.destroy();
    let labels = [], points = [];
    if(currentChartType==='hourly') {
        labels = Array.from({length:24},(_,i)=>i+"h"); points=new Array(24).fill(0);
        data.forEach(e => { if(e.status!==0) points[new Date(e.time).getHours()]++; });
    } else {
        let map = {};
        data.forEach(e => {
            if(e.status!==0) {
                let k = new Date(e.time).toLocaleDateString('de-DE', {day:'2-digit', month:'2-digit'});
                let dur = getDuration(e, fullLog[fullLog.indexOf(e)+1]);
                map[k] = (map[k]||0) + dur/60;
            }
        });
        labels = Object.keys(map); points = Object.values(map);
    }
    let gradient = ctx.createLinearGradient(0, 400, 0, 0);
    gradient.addColorStop(0, 'rgba(15, 23, 42, 0.4)'); gradient.addColorStop(1, 'rgba(56, 189, 248, 0.6)'); 
    myChart = new Chart(ctx, { type: 'bar', data: { labels: labels, datasets: [{ label: 'Stunden', data: points, backgroundColor: gradient, borderRadius: 4, hoverBackgroundColor: '#38bdf8' }] }, options: { responsive: true, maintainAspectRatio: false, plugins:{legend:{display:false}}, scales:{x:{display:false}, y:{beginAtZero:true, grid:{color:'rgba(255,255,255,0.05)'}}} } });
}

function updatePieChart(stats, totalMinutesCalculated) {
    const ctx = document.getElementById('myPieChart').getContext('2d');
    if (myPieChart) myPieChart.destroy();
    let labels=[], data=[], colors=[];
    let sorted = Object.entries(stats).sort((a,b)=>b[1].minutes-a[1].minutes);
    const pal = ['#66c0f4', '#c1e45e', '#f46666', '#a855f7', '#f59e0b', '#22d3ee'];
    let totalPlayedHours = totalMinutesCalculated / 60;
    let offlineHours = 24.0 - totalPlayedHours;
    if(offlineHours < 0) offlineHours = 0; 
    sorted.forEach(([n,s], i) => { if(s.minutes>5) { labels.push(n); data.push((s.minutes/60).toFixed(2)); colors.push(pal[i%pal.length]); } });
    if(offlineHours > 0.1) { labels.push("Offline / Reallife"); data.push(offlineHours.toFixed(2)); colors.push("rgba(255, 255, 255, 0.06)"); }
    let pct = ((totalPlayedHours/24)*100).toFixed(1); if(parseFloat(pct) > 100) pct = "100+";
    document.getElementById('dayPercentage').innerText = pct + "%";
    myPieChart = new Chart(ctx, { type: 'doughnut', data: { labels, datasets:[{data, backgroundColor:colors, borderWidth: 2, borderColor: '#1e293b', hoverOffset: 10}] }, options: { cutout: '60%', maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{color:'#94a3b8', usePointStyle:true, padding: 20}}} } });
}

function calculateRecap() {
    let totalHoursText = document.getElementById('totalHours').innerText;
    document.getElementById('recapTotalTime').innerText = totalHoursText;
    let userLog = rawData.filter(e => e.name === currentUser);
    if(!userLog || userLog.length === 0) return;
    let games={}, dayActivity = {};
    userLog.forEach((e,i)=>{ if(e.status!==0 && userLog[i+1]) { let d=getDuration(e,userLog[i+1]); let g=e.game||"PC"; games[g]=(games[g]||0)+d; let dayKey = new Date(e.time).toLocaleDateString('de-DE'); dayActivity[dayKey] = (dayActivity[dayKey] || 0) + d; } });
    let topGame = Object.entries(games).sort((a,b)=>b[1]-a[1])[0];
    let topDay = Object.entries(dayActivity).sort((a,b)=>b[1]-a[1])[0];
    document.getElementById('recapTopGame').innerText = topGame ? topGame[0] : "-";
    if(topDay) { document.getElementById('recapTopDay').innerText = topDay[0]; document.getElementById('recapTopDayVal').innerText = (topDay[1]/60).toFixed(1); } else { document.getElementById('recapTopDay').innerText = "-"; document.getElementById('recapTopDayVal').innerText = "0"; }
}

function renderLibraryList(stats) {
    let list = document.getElementById('gameLibraryList'); 
    list.innerHTML = "";
    
    let entry = rawData.find(e => e.name === currentUser);
    let currentSteamId = entry ? entry.steam_id : null;
    let realLibrary = [];
    if (currentSteamId && libDataAll[currentSteamId]) { realLibrary = libDataAll[currentSteamId]; }

    if (realLibrary.length > 0) {
        realLibrary.sort((a, b) => b.playtime_forever - a.playtime_forever);
        realLibrary.forEach(g => {
            let hours = (g.playtime_forever / 60).toFixed(1);
            let img = `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/header.jpg`;
            list.innerHTML += `<div class="game-list-item" onclick="openGame(${g.appid})"><img src="${img}" class="lib-cover" onerror="this.src='${STEAM_LOGO_URL}'"><div class="lib-info"><div class="lib-name">${g.name}</div><div class="lib-last-played">Gesamtzeit auf Steam</div></div><div class="lib-time">${hours}h</div></div>`;
        });
    } else {
        let sorted = Object.entries(stats).sort((a,b)=>b[1].minutes-a[1].minutes);
        if(!sorted.length) { list.innerHTML="<div style='text-align:center;padding:20px;color:#888'>Keine Daten oder Profil privat.</div>"; return; }
        sorted.forEach(([n,s])=>{ let img = s.isDesktop ? STEAM_LOGO_URL : `https://cdn.akamai.steamstatic.com/steam/apps/${s.id}/header.jpg`; list.innerHTML += `<div class="game-list-item" onclick="openGame(${s.id})"><img src="${img}" class="lib-cover"><div class="lib-info"><div class="lib-name">${n}</div><div class="lib-last-played">Seit Tracking-Start</div></div><div class="lib-time">${(s.minutes/60).toFixed(1)}h</div></div>`; });
    }
}

function renderHeatmap(userLog) {
    let grid = document.getElementById('heatmapGrid'); grid.innerHTML="";
    if(!userLog.length) return;
    let start = new Date(userLog[0].time);
    let end = new Date();
    let map = {};
    userLog.forEach(e=>{ if(e.status!==0) { let k=new Date(e.time).toDateString(); map[k]=(map[k]||0)+getDuration(e, userLog[userLog.indexOf(e)+1]); } });
    for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)) { let m = map[d.toDateString()]||0; let c = document.createElement('div'); c.className='heatmap-cell'; if(m>0) c.className+=' h-l1'; if(m>60) c.className+=' h-l2'; if(m>120) c.className+=' h-l3'; if(m>300) c.className+=' h-l4'; c.title = `${d.toLocaleDateString()}: ${(m/60).toFixed(1)}h`; grid.appendChild(c); }
}

function calculateRecords(userLog) {
    let long=0, curr=0, night=0, day=0, dAct={};
    for(let i=0; i<userLog.length; i++){ let e=userLog[i]; if(e.status!==0) { let dur = getDuration(e, userLog[i+1]); curr+=dur; let h = new Date(e.time).getHours(); if(h>=22||h<6) night++; else day++; let ds = new Date(e.time).toLocaleDateString(); dAct[ds] = (dAct[ds]||0)+dur; } else { if(curr>long) long=curr; curr=0; } }
    if(curr>long) long=curr;
    document.getElementById('recLongest').innerText = (long/60).toFixed(1)+"h";
    document.getElementById('recType').innerText = night>day?"Nachteule":"Tagaktiv";
    let md="-", mv=0; for(let[k,v] of Object.entries(dAct)) if(v>mv){mv=v;md=k;}
    document.getElementById('recActiveDay').innerText = md;
}

async function renderShameList() {
    let entry = rawData.find(e => e.name === currentUser);
    let sid = (entry && entry.steam_id) ? entry.steam_id : (Object.keys(libDataAll).length > 0 ? Object.keys(libDataAll)[0] : null);
    if(!sid) { document.getElementById('shameCount').innerText = "Warte auf Update..."; return; }
    
    let myLib = libDataAll[sid] || [];
    let unplayed = myLib.filter(g => g.playtime_forever < 120); 
    
    document.getElementById('shameCount').innerText = unplayed.length;
    let list = document.getElementById('shameList'); list.innerHTML="";
    
    unplayed.forEach(g => { 
        let realHours = (g.playtime_forever / 60).toFixed(1);
        list.innerHTML += `<div class="shame-item"><span>${g.name}</span><span>${realHours}h</span></div>`; 
    });
    currentUnplayed = unplayed;
}

async function calculateShameValue() {
    if(!currentUnplayed || !currentUnplayed.length) return;
    document.getElementById('btnCalcShame').style.display = 'none';
    document.getElementById('shameProgressContainer').style.display = 'block';
    let total=0, sale=0, done=0;
    for(let g of currentUnplayed) { try { let p = await fetchPrice(g.appid); if(p) { total += p.initial/100; sale += p.final/100; } } catch(e){} done++; document.getElementById('shameBar').style.width = ((done/currentUnplayed.length)*100)+"%"; document.getElementById('shameStatus').innerText = `${done}/${currentUnplayed.length}`; document.getElementById('shameValueTotal').innerText = total.toLocaleString('de-DE', {style:'currency', currency:'EUR'}); document.getElementById('shameValueSale').innerText = sale.toLocaleString('de-DE', {style:'currency', currency:'EUR'}); await new Promise(r=>setTimeout(r, 100)); }
}

async function fetchPrice(id) { try { let r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent('https://store.steampowered.com/api/appdetails?appids='+id+'&filters=price_overview&cc=de')}`); let j = await r.json(); return j[id].data.price_overview; } catch(e) { try { let r2 = await fetch(`https://corsproxy.io/?${encodeURIComponent('https://store.steampowered.com/api/appdetails?appids='+id+'&filters=price_overview&cc=de')}`); let j2 = await r2.json(); return j2[id].data.price_overview; } catch(e2) { return null; } } }

async function openGame(id) { currentGameId = id; document.getElementById('mainHeader').scrollIntoView({behavior:'smooth'}); if(!document.getElementById('mainHeader').classList.contains('details-open')) toggleGameDetails(); else renderDetails(); }
async function toggleGameDetails() { document.getElementById('mainHeader').classList.toggle('details-open'); document.getElementById('gameDetailsExpanded').classList.toggle('open'); if(document.getElementById('gameDetailsExpanded').classList.contains('open')) renderDetails(); }

async function renderDetails() {
    if(!currentGameId) return;
    document.getElementById('gameDetailsContent').innerHTML = "<div class='details-loader' style='padding:40px;text-align:center;'>⏳ Lade Infos von Steam...</div>";
    let gameData = await fetchGameDataInternal(currentGameId);
    let myHours = calculateTotalPlaytimeForGame(currentGameId);

    if(gameData) {
        let d = gameData;
        let html = `<div class="details-grid"><div class="gallery-container">`;
        if(d.screenshots) d.screenshots.slice(0, 5).forEach(s=> html+=`<img src="${s.path_thumbnail}" class="gallery-img" onclick="openLightbox('${s.path_full}')">`);
        html += `</div><div class="info-container"><div style="font-size:1.5rem; font-weight:700; color:#fff;">${d.name}</div><div class="tag-row">`;
        if(d.genres) d.genres.forEach(g => html += `<span class="tag-badge">${g.description}</span>`);
        html += `</div><div class="playtime-display" style="font-size:1.1rem; margin-top:10px;">Gesamtzeit: <strong style="color:var(--accent)">${myHours} Std</strong></div>`;
        
        let priceSection = "";
        if(d.price_overview) {
            let p = d.price_overview; let priceVal = p.final / 100; let hoursVal = parseFloat(myHours);
            priceSection += `<div class="price-section"><div class="price-row">`;
            if(p.discount_percent > 0) priceSection += `<span class="price-discount">-${p.discount_percent}%</span><span class="price-original">${p.initial_formatted}</span>`;
            priceSection += `<span class="price-final">${p.final_formatted}</span></div>`;
            if(hoursVal < 1) { priceSection += `<div class="cost-per-hour" style="margin-top:5px; color:#94a3b8; font-size:0.9rem;">Kostet etwa <strong style="color:#fff">${p.final_formatted}</strong> (noch zu wenig Spielzeit)</div></div>`; } 
            else { let cp = (priceVal / hoursVal).toFixed(2) + "€"; let col = (priceVal / hoursVal) < 2 ? "#4ade80" : "#f87171"; priceSection += `<div class="cost-per-hour" style="margin-top:5px; color:#94a3b8; font-size:0.9rem;">Kostet dich <strong style="color:${col}">${cp}</strong> pro Stunde</div></div>`; }
        } else if (d.is_free) { priceSection += `<div class="price-section"><span style="color:var(--online); font-weight:700;">Kostenlos spielbar</span></div>`; }
        
        html += priceSection; 
        html += `<a href="https://store.steampowered.com/app/${currentGameId}" target="_blank" class="steam-store-btn">Im Steam Shop ansehen ↗</a></div></div>`;
        document.getElementById('gameDetailsContent').innerHTML = html;
    } else {
        let fallbackName = "Spiel-Details";
        let logEntry = rawData.find(e => e.game_id == currentGameId);
        if(logEntry && logEntry.game) fallbackName = logEntry.game;
        document.getElementById('gameDetailsContent').innerHTML = `<div style='padding:30px; text-align:center; background:rgba(255,255,255,0.05); border-radius:12px;'><h3 style="color:#fff;">${fallbackName}</h3><p style="color:#94a3b8; font-size:0.9rem;">Steam-Shop Infos nicht verfügbar (evtl. Altersbeschränkung).</p><div class="playtime-display" style="font-size:1.2rem; margin:20px 0;">Deine Zeit: <strong style="color:var(--accent)">${myHours} Std</strong></div><a href="https://store.steampowered.com/app/${currentGameId}" target="_blank" class="steam-store-btn">Im Steam Shop öffnen ↗</a></div>`;
    }
}

function calculateTotalPlaytimeForGame(id) {
    let t = 0;
    let userLog = rawData.filter(e => e.name === currentUser);
    userLog.forEach((e, i) => { if (e.game_id == id && e.status !== 0 && userLog[i + 1]) { t += getDuration(e, userLog[i + 1]); } });
    return (t / 60).toFixed(1);
}

function updateStatusDisplay(e) {
    document.getElementById('gameCover').style.display="none"; 
    document.getElementById('gameName').style.display="none"; 
    document.getElementById('headerArrow').style.display="none"; 
    document.getElementById('statusWrapper').classList.remove('clickable');
    currentGameId = null;

    // --- FIX: ZEITZONE FÜR STATUS-CHECK ---
    let timeString = e.time;
    if (timeString && !timeString.endsWith("Z")) {
        timeString += "Z";
    }
    let lastPlayed = new Date(timeString);
    let now = new Date();
    let diff = (now - lastPlayed)/60000;

    if(diff>90) { document.getElementById('currentStatus').innerText="Inaktiv"; document.getElementById('statusDot').style.backgroundColor="gray"; } 
    else if(e.game) { 
        document.getElementById('currentStatus').innerText="Spielt"; document.getElementById('statusDot').style.backgroundColor="#c1e45e"; document.getElementById('gameName').innerText=e.game; document.getElementById('gameName').style.display="block"; document.getElementById('gameCover').src=`https://cdn.akamai.steamstatic.com/steam/apps/${e.game_id}/header.jpg`; document.getElementById('gameCover').style.display="block"; 
        currentGameId=e.game_id; document.getElementById('statusWrapper').classList.add('clickable'); document.getElementById('headerArrow').style.display="block"; 
    } 
    else if(e.status !== 0) { 
        document.getElementById('currentStatus').innerText="Online"; document.getElementById('statusDot').style.backgroundColor="#4ade80"; document.getElementById('gameName').innerText="Steam"; document.getElementById('gameName').style.display="block"; document.getElementById('gameCover').src=STEAM_LOGO_URL; document.getElementById('gameCover').style.display="block"; 
    } 
    else { document.getElementById('currentStatus').innerText="Offline"; document.getElementById('statusDot').style.backgroundColor="#f87171"; }
}

function filterLibrary() { let q = document.getElementById('libSearch').value.toLowerCase(); document.querySelectorAll('.game-list-item').forEach(i=>i.style.display=i.innerText.toLowerCase().includes(q)?'flex':'none'); }
function sortLibrary() { renderLibraryList(globalGameStats); }
function setChartType(t) { currentChartType = t; loadData(); }
function setTimeRange(d) { currentTimeRange = d; document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active')); document.getElementById('btn-' + d).classList.add('active'); loadData(); }
