// ==========================================
// 1. CONFIG & GLOBALS
// ==========================================
const DATA_URL = 'https://gist.githubusercontent.com/MarianWillms-7/90383d1eeb8d52c4083a3542c8400ba4/raw/steam_activity_log.json';
const LIB_URL = 'https://gist.githubusercontent.com/MarianWillms-7/90383d1eeb8d52c4083a3542c8400ba4/raw/steam_library.json';
const STEAM_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg';
const DEF_AVATAR = 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png';

let rawData = [], libDataAll = {}, currentUser = null, allUsers = [], gameDataCache = {};
let myChart = null, myPieChart = null;
let currentChartType = 'daily', currentTimeRange = 7, currentUnplayed = [], globalGameStats = {};

document.addEventListener("DOMContentLoaded", loadData);

// ==========================================
// 2. DATA LOADING
// ==========================================
async function loadData() {
    document.getElementById('loading').style.display = 'block';
    try {
        const r1 = await fetch(DATA_URL + '?t=' + Date.now());
        if (!r1.ok) throw new Error("Log-Datei nicht ladbar");
        rawData = JSON.parse(await r1.text());

        try { 
            const r2 = await fetch(LIB_URL + '?t=' + Date.now());
            if(r2.ok) libDataAll = await r2.json();
        } catch(e) { console.warn("Library Skip:", e); }

        const userSet = new Set();
        rawData.forEach(e => userSet.add(e.name));
        allUsers = Array.from(userSet);
        
        const sel = document.getElementById('userSelect');
        if(sel) {
            sel.innerHTML = "";
            allUsers.forEach(u => sel.appendChild(new Option(u, u)));
        }

        if(!currentUser && rawData.length > 0) {
            currentUser = rawData[rawData.length-1].name;
            if(sel) sel.value = currentUser;
        }

        renderOnlineBar(); 
        updateLeaderboard(); 
        processData();
        preloadGames();
        
        document.getElementById('loading').style.display = 'none';
    } catch (e) { 
        console.error(e);
        document.getElementById('loading').innerText = "Fehler: " + e.message; 
    }
}

// ==========================================
// 3. CORE LOGIC
// ==========================================
function processData() {
    if (rawData.length === 0) return;
    const userLog = rawData.filter(e => e.name === currentUser);
    const lastEntry = userLog[userLog.length - 1] || {};
    
    if (lastEntry.time) {
        let ts = lastEntry.time.endsWith("Z") ? lastEntry.time : lastEntry.time + "Z";
        document.getElementById('lastUpdate').innerText = new Date(ts).toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit'});
    } else { document.getElementById('lastUpdate').innerText = "-"; }

    document.getElementById('userAvatar').src = lastEntry.avatar || DEF_AVATAR;
    if (userLog.length > 0) document.getElementById('footerInfo').innerText = `Datensätze: ${userLog.length}`;

    updateBadgesDisplay(calculateBadges(userLog));
    const stats = calculateStats(userLog);
    globalGameStats = stats.gameStats;
    
    updateStatusDisplay(lastEntry);
    
    if(document.getElementById('myChart')) updateBarChart(stats.filteredData, userLog);
    if(document.getElementById('myPieChart')) updatePieChart(stats.gameStats, stats.totalMins);
    
    renderHeatmap(userLog);
    calculateRecords(userLog);
}

function calculateStats(userLog) {
    let totalMinutes = 0, dayCounts = {}, gameStats = {}, filtered = userLog, todayMinutes = 0;
    const startOfToday = new Date(); startOfToday.setHours(0,0,0,0); 

    userLog.forEach((entry, idx) => {
        if (entry.status !== 0) {
            let dur = getDuration(entry, userLog[idx + 1]);
            if (new Date(entry.time) >= startOfToday) todayMinutes += dur;
        }
    });
    document.getElementById('todayHours').innerText = (todayMinutes / 60).toFixed(1) + "h";

    if (currentTimeRange !== 9999) {
        const cut = new Date(); 
        cut.setDate(cut.getDate() - (currentTimeRange === 0 ? 0 : currentTimeRange));
        if(currentTimeRange === 0) cut.setHours(0,0,0,0);
        filtered = userLog.filter(e => new Date(e.time) >= cut);
    }

    filtered.forEach((entry, i) => {
        if (entry.status !== 0) { 
            let dur = getDuration(entry, filtered[i+1]); // Simple diff logic
            // Use global log for accurate diff if needed, but simple is robust here
            let globalIdx = userLog.indexOf(entry);
            dur = getDuration(entry, userLog[globalIdx+1]);
            
            totalMinutes += dur;
            let d = new Date(entry.time).toLocaleDateString('de-DE', {weekday: 'long'});
            dayCounts[d] = (dayCounts[d] || 0) + 1;
            let gName = entry.game || "Steam / Desktop"; 
            if (!gameStats[gName]) gameStats[gName] = { minutes: 0, id: entry.game_id, lastPlayed: entry.time, isDesktop: !entry.game };
            gameStats[gName].minutes += dur;
            gameStats[gName].lastPlayed = entry.time; 
        }
    });

    // Total Time from Steam Library
    let entry = rawData.find(e => e.name === currentUser);
    let sid = entry ? entry.steam_id : null;
    let finalTotal = totalMinutes;
    if (sid && libDataAll[sid]) {
        let steamTotal = 0;
        libDataAll[sid].forEach(g => steamTotal += g.playtime_forever);
        finalTotal = steamTotal;
    }
    document.getElementById('totalHours').innerText = (finalTotal / 60).toFixed(1) + " h";

    let maxDay="-", maxVal=0; for(let [k,v] of Object.entries(dayCounts)) if(v>maxVal){maxVal=v; maxDay=k;}
    document.getElementById('topDay').innerText = maxDay;

    renderLibraryList(gameStats);
    return { filteredData: filtered, gameStats: gameStats, totalMins: totalMinutes }; 
}

// ==========================================
// 4. UI COMPONENTS (BAR, DETAILS, CHARTS)
// ==========================================
function renderOnlineBar() {
    const container = document.getElementById('onlineBar');
    if(!container) return;
    container.innerHTML = "";
    
    let list = [];
    allUsers.forEach(u => {
        let entries = rawData.filter(e => e.name === u);
        if(entries.length) list.push(entries[entries.length - 1]);
    });

    list.sort((a, b) => (b.game?2:(b.status!==0?1:0)) - (a.game?2:(a.status!==0?1:0)));

    list.forEach(u => {
        let st = "status-offline";
        if (u.game) st = "status-ingame"; else if (u.status !== 0) st = "status-online";
        
        let div = document.createElement('div');
        div.className = `online-user ${u.name === currentUser ? 'active' : ''}`;
        div.onclick = () => { document.getElementById('userSelect').value = u.name; switchUser(u.name); };
        div.innerHTML = `<div style="position:relative;"><img src="${u.avatar||DEF_AVATAR}" class="online-avatar ${st}"></div><span class="online-name">${u.name}</span>`;
        container.appendChild(div);
    });
}

function updateStatusDisplay(e) {
    const els = { cover:document.getElementById('gameCover'), name:document.getElementById('gameName'), arrow:document.getElementById('headerArrow'), wrapper:document.getElementById('statusWrapper'), status:document.getElementById('currentStatus'), dot:document.getElementById('statusDot') };
    if(!els.status) return;

    els.cover.style.display="none"; els.name.style.display="none"; els.arrow.style.display="none"; 
    els.wrapper.classList.remove('clickable'); currentGameId = null;

    if (!e || !e.time) return;
    let diff = (new Date() - new Date(e.time.endsWith("Z")?e.time:e.time+"Z"))/60000;

    if(diff > 90) { els.status.innerText="Inaktiv"; els.dot.style.backgroundColor="gray"; } 
    else if(e.game) { 
        els.status.innerText="Spielt"; els.dot.style.backgroundColor="#c1e45e"; 
        els.name.innerText=e.game; els.name.style.display="block"; 
        els.cover.src=`https://cdn.akamai.steamstatic.com/steam/apps/${e.game_id}/header.jpg`; els.cover.style.display="block"; 
        currentGameId=e.game_id; els.wrapper.classList.add('clickable'); els.arrow.style.display="block"; 
    } 
    else if(e.status !== 0) { 
        els.status.innerText="Online"; els.dot.style.backgroundColor="#4ade80"; 
        els.name.innerText="Steam"; els.name.style.display="block"; 
        els.cover.src=STEAM_LOGO; els.cover.style.display="block"; 
    } 
    else { els.status.innerText="Offline"; els.dot.style.backgroundColor="#f87171"; }
}

async function renderDetails() {
    if(!currentGameId) return;
    const content = document.getElementById('gameDetailsContent');
    content.innerHTML = "<div class='details-loader' style='padding:40px;text-align:center;'>⏳ Lade Infos...</div>";
    
    let myHours = 0;
    let entry = rawData.find(e => e.name === currentUser);
    let sid = entry ? entry.steam_id : null;
    if (sid && libDataAll[sid]) {
        let g = libDataAll[sid].find(x => x.appid == currentGameId);
        if (g) myHours = (g.playtime_forever / 60).toFixed(1);
    }
    if (myHours == 0) myHours = calculateTotalPlaytimeForGame(currentGameId);

    let d = await fetchGameDataInternal(currentGameId);

    if(d) {
        let ageHtml = (d.required_age && d.required_age >= 16) ? `<span class="age-badge" style="background:#ef4444;color:#fff;padding:2px 6px;border-radius:4px;font-size:0.8rem;margin-left:10px;">USK ${d.required_age}</span>` : "";
        let html = `<div class="details-grid"><div class="gallery-container">`;
        if(d.screenshots) d.screenshots.slice(0, 5).forEach(s=> html+=`<img src="${s.path_thumbnail}" class="gallery-img" onclick="openLightbox('${s.path_full}')">`);
        html += `</div><div class="info-container"><div style="font-size:1.5rem; font-weight:700; color:#fff;">${d.name} ${ageHtml}</div><div class="tag-row">`;
        if(d.genres) d.genres.forEach(g => html += `<span class="tag-badge">${g.description}</span>`);
        html += `</div><div class="playtime-display" style="font-size:1.1rem; margin-top:10px;">Gesamtzeit: <strong style="color:var(--accent)">${myHours} Std</strong></div>`;
        
        if(d.price_overview) {
            let p = d.price_overview;
            html += `<div class="price-section"><div class="price-row">`;
            if(p.discount_percent>0) html += `<span class="price-discount">-${p.discount_percent}%</span><span class="price-original">${p.initial_formatted}</span>`;
            html += `<span class="price-final">${p.final_formatted}</span></div>`;
            if(parseFloat(myHours) > 1) {
                let cost = (p.final/100 / parseFloat(myHours)).toFixed(2);
                html += `<div class="cost-per-hour" style="margin-top:5px; color:#94a3b8; font-size:0.9rem;">Kostet dich <strong style="color:${cost<2?'#4ade80':'#f87171'}">${cost}€</strong> pro Stunde</div></div>`;
            } else { html += `</div>`; }
        } else if (d.is_free) { html += `<div class="price-section"><span style="color:var(--online); font-weight:700;">Kostenlos</span></div>`; }
        
        html += `<a href="https://store.steampowered.com/app/${currentGameId}" target="_blank" class="steam-store-btn">Im Steam Shop ansehen ↗</a></div></div>`;
        content.innerHTML = html;
    } else {
        content.innerHTML = `<div style='padding:30px;text-align:center;'><h3 style="color:#fff;">Infos nicht verfügbar</h3><p style="color:#f87171;">Steam-Shop blockiert.</p><div style="font-size:1.2rem;margin:20px;">Zeit: <strong style="color:var(--accent)">${myHours} Std</strong></div></div>`;
    }
}

// --- FETCH & PROXY ---
async function fetchGameDataInternal(id) {
    if(gameDataCache[id]) return gameDataCache[id];
    let d = await tryFetch(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=de&l=german`, id);
    if (!d) d = await tryFetch(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=us&l=english`, id);
    if(d) gameDataCache[id] = d;
    return d;
}

async function tryFetch(url, id) {
    try { 
        let r = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
        let j = await r.json(); if(j && j[id] && j[id].success) return j[id].data;
    } catch(e) {}
    try { 
        let r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
        let j = await r.json(); if(j && j[id] && j[id].success) return j[id].data;
    } catch(e) {}
    return null;
}

// --- ACHIEVEMENTS FIX (JSON MODE) ---
async function toggleLibraryDetails(appId, steamId, element) {
    let drop = document.getElementById(`lib-drop-${appId}`);
    if(drop.classList.contains('active')) { drop.classList.remove('active'); return; }
    document.querySelectorAll('.achievement-dropdown').forEach(d => d.classList.remove('active'));
    drop.classList.add('active');

    try {
        // USE JSON MODE TO AVOID CORS
        let target = `https://steamcommunity.com/profiles/${steamId}/stats/${appId}/?xml=1`;
        let r = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(target)}`);
        let json = await r.json();
        
        if (!json.contents || json.contents.length < 50) throw new Error("Empty");
        
        let parser = new DOMParser();
        let xml = parser.parseFromString(json.contents, "text/xml");
        let achs = xml.querySelectorAll('achievement');
        
        if(achs.length === 0) { drop.innerHTML = "<div style='text-align:center; color:#aaa;'>Keine Erfolge/Privat</div>"; return; }
        
        let done = 0, listHtml = "";
        achs.forEach(a => {
            let closed = a.getAttribute('closed') === "1";
            if(closed) done++;
            let name = a.querySelector('name').textContent;
            let icon = closed ? a.querySelector('iconClosed').textContent : a.querySelector('iconOpen').textContent;
            listHtml += `<div class="ach-item ${closed?'done':'locked'}"><img src="${icon}" class="ach-icon"><div class="ach-text"><span class="ach-name">${name}</span></div></div>`;
        });
        drop.innerHTML = `<div class="ach-title">Fortschritt: ${done} / ${achs.length}</div><div class="ach-list">${listHtml}</div>`;
    } catch(e) {
        drop.innerHTML = "<div style='text-align:center; color:#f87171;'>Fehler beim Laden (API).</div>";
    }
}

// --- HELPERS ---
function switchUser(name) { currentUser = name; document.getElementById('mainHeader').classList.remove('details-open'); document.getElementById('gameDetailsExpanded').classList.remove('open'); document.getElementById('gameDetailsContent').innerHTML = ""; currentGameId = null; renderOnlineBar(); processData(); }
function calculateTotalPlaytimeForGame(id) { let t = 0; rawData.filter(e => e.name === currentUser).forEach((e, i, arr) => { if (e.game_id == id && e.status !== 0 && arr[i+1]) t += getDuration(e, arr[i+1]); }); return (t/60).toFixed(1); }
function calculateTotalPlaytimeForUser(u) { let t = 0; rawData.filter(e => e.name === u).forEach((e, i, arr) => { if (e.status !== 0 && arr[i+1]) t += getDuration(e, arr[i+1]); }); return t; }
function getDuration(e, next) { if(next) { let diff = (new Date(next.time) - new Date(e.time)) / 60000; return diff > MAX_TRACKER_DELAY_MINUTES + 10 ? 30 : diff; } let diff = (new Date() - new Date(e.time)) / 60000; return diff > MAX_TRACKER_DELAY_MINUTES ? 30 : diff; }
function calculateBadges(log) { let b=[]; let t=0, n=0, w=0; log.forEach((e,i)=>{if(e.status!==0 && log[i+1]){let d=getDuration(e,log[i+1]); t+=d; let h=new Date(e.time).getHours(); if(h>=2&&h<6)n+=d; let day=new Date(e.time).getDay(); if(day===0||day===6)w+=d;}}); if(t>60 && n/t>0.3) b.push({icon:'🦉',title:'Nachteule'}); if(t>120 && w/t>0.6) b.push({icon:'⚔️',title:'Weekend Warrior'}); return b; }
function updateBadgesDisplay(b) { document.getElementById('userBadges').innerHTML = b.map(x=>`<span class="badge-icon" title="${x.title}">${x.icon}</span>`).join(''); }
function updateLeaderboard() { let w=[]; let now=new Date(); let wk=new Date(); wk.setDate(now.getDate()-7); allUsers.forEach(u=>{ let t=0; rawData.filter(e=>e.name===u && new Date(e.time)>=wk).forEach((e,i,arr)=>{if(e.status!==0 && arr[i+1]) t+=getDuration(e,arr[i+1]);}); w.push({name:u,val:t}); }); w.sort((a,b)=>b.val-a.val); renderLBItem('lb-week', w, 'Std', 60); let l=[], s=[]; allUsers.forEach(u=>{ let entry=rawData.find(e=>e.name===u); let sid=entry?entry.steam_id:null; if(sid && libDataAll[sid]) { l.push({name:u, val:libDataAll[sid].length}); s.push({name:u, val:libDataAll[sid].filter(g=>g.playtime_forever<120).length}); } }); l.sort((a,b)=>b.val-a.val); renderLBItem('lb-lib', l, 'Spiele', 1); s.sort((a,b)=>b.val-a.val); renderLBItem('lb-shame', s, 'Stück', 1); }
function renderLBItem(id, d, unit, div) { document.getElementById(id).innerHTML = d.slice(0,3).map((x,i)=>`<div class="lb-item"><div class="lb-label">${i===0?'👑':(i===1?'🥈':'🥉')} Platz ${i+1}</div><div class="lb-winner"><img src="${(rawData.find(e=>e.name===x.name)||{}).avatar||DEF_AVATAR}" class="lb-avatar"><span class="lb-name">${x.name}</span><span class="lb-val">${(x.val/div).toFixed(div===1?0:1)} ${unit}</span></div></div>`).join('') || "Keine Daten"; }
function renderLibraryList(stats) { let list = document.getElementById('gameLibraryList'); list.innerHTML = ""; let entry = rawData.find(e => e.name === currentUser); let sid = entry ? entry.steam_id : null; let lib = (sid && libDataAll[sid]) ? libDataAll[sid] : []; if(lib.length){ lib.sort((a,b)=>b.playtime_forever-a.playtime_forever); lib.forEach(g=>{ list.innerHTML += `<div class="game-list-item" onclick="toggleLibraryDetails(${g.appid}, '${sid}', this)"><img src="https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/header.jpg" class="lib-cover" onerror="this.src='${STEAM_LOGO}'"><div class="lib-info"><div class="lib-name">${g.name}</div><div class="lib-last-played">▼ Erfolge</div></div><div class="lib-time">${(g.playtime_forever/60).toFixed(1)}h</div></div><div id="lib-drop-${g.appid}" class="achievement-dropdown">Lade...</div>`; }); } else { list.innerHTML="<div style='padding:20px;text-align:center;color:#888'>Keine Daten</div>"; } }
function calculateRecords(log) { let l=0, c=0, n=0, d=0, da={}; log.forEach((e,i)=>{ if(e.status!==0 && log[i+1]) { let dur=getDuration(e,log[i+1]); c+=dur; let h=new Date(e.time).getHours(); if(h>=22||h<6)n++; else d++; let ds=new Date(e.time).toDateString(); da[ds]=(da[ds]||0)+dur; } else { if(c>l)l=c; c=0; } }); if(c>l)l=c; document.getElementById('recLongest').innerText=(l/60).toFixed(1)+"h"; document.getElementById('recType').innerText=n>d?"Nachteule":"Tagaktiv"; let md="-", mv=0; for(let[k,v] of Object.entries(da))if(v>mv){mv=v;md=k;} document.getElementById('recActiveDay').innerText=md; }
function renderHeatmap(log) { let grid=document.getElementById('heatmapGrid'); grid.innerHTML=""; if(!log.length)return; let map={}; log.forEach((e,i)=>{if(e.status!==0 && log[i+1]){let k=new Date(e.time).toDateString(); map[k]=(map[k]||0)+getDuration(e,log[i+1]);}}); let start=new Date(log[0].time); let end=new Date(); for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)) { let m=map[d.toDateString()]||0; let c=document.createElement('div'); c.className='heatmap-cell'; if(m>0)c.classList.add('h-l1'); if(m>60)c.classList.add('h-l2'); if(m>120)c.classList.add('h-l3'); if(m>300)c.classList.add('h-l4'); c.title=`${d.toLocaleDateString()}: ${(m/60).toFixed(1)}h`; grid.appendChild(c); } }
async function preloadGames() { let ids=new Set(); rawData.forEach(e=>{if(e.game_id)ids.add(e.game_id)}); for(let id of ids) { if(!gameDataCache[id]) { await fetchGameDataInternal(id); await new Promise(r=>setTimeout(r,300)); } } }
function updateBarChart(data, fullLog) { const ctx=document.getElementById('myChart'); if(ctx && window.Chart) { if(myChart)myChart.destroy(); let map={}; data.forEach((e,i)=>{if(e.status!==0 && fullLog[fullLog.indexOf(e)+1]){let k=new Date(e.time).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}); map[k]=(map[k]||0)+getDuration(e,fullLog[fullLog.indexOf(e)+1])/60;}}); myChart=new Chart(ctx.getContext('2d'),{type:'bar',data:{labels:Object.keys(map),datasets:[{label:'Stunden',data:Object.values(map),backgroundColor:'#38bdf8',borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{display:false},y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.05)'}}}}}); } }
function updatePieChart(stats, total) { const ctx=document.getElementById('myPieChart'); if(ctx && window.Chart) { if(myPieChart)myPieChart.destroy(); let l=[], d=[], c=[]; let s=Object.entries(stats).sort((a,b)=>b[1].minutes-a[1].minutes); let off=24-(total/60); if(off<0)off=0; s.forEach(([n,v],i)=>{if(v.minutes>5){l.push(n);d.push((v.minutes/60).toFixed(2));c.push(['#66c0f4','#c1e45e','#f46666','#a855f7'][i%4]);}}); if(off>0.1){l.push('Offline');d.push(off.toFixed(2));c.push('rgba(255,255,255,0.06)');} document.getElementById('dayPercentage').innerText=((total/60/24)*100).toFixed(1)+'%'; myPieChart=new Chart(ctx.getContext('2d'),{type:'doughnut',data:{labels:l,datasets:[{data:d,backgroundColor:c,borderWidth:2,borderColor:'#1e293b'}]},options:{cutout:'60%',maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#94a3b8',usePointStyle:true}}}}}); } }
function openLightbox(url) { document.getElementById('lightboxImg').src=url; document.getElementById('lightbox').classList.add('active'); }
function closeLightbox() { document.getElementById('lightbox').classList.remove('active'); }
function showRecap() { calculateRecap(); document.getElementById('recapModal').classList.add('active'); confetti({particleCount:100,spread:70,origin:{y:0.6}}); }
function closeRecap() { document.getElementById('recapModal').classList.remove('active'); }
function openUserModal() { document.getElementById('userModal').classList.add('active'); }
function closeUserModal() { document.getElementById('userModal').classList.remove('active'); }
function showShame() { document.getElementById('shameModal').classList.add('active'); renderShameList(); }
function closeShame() { document.getElementById('shameModal').classList.remove('active'); }
function filterLibrary() { let q=document.getElementById('libSearch').value.toLowerCase(); document.querySelectorAll('.game-list-item').forEach(i=>i.style.display=i.innerText.toLowerCase().includes(q)?'flex':'none'); }
function sortLibrary() { renderLibraryList(globalGameStats); }
function setChartType(t) { currentChartType=t; loadData(); }
function setTimeRange(d) { currentTimeRange=d; document.querySelectorAll('.time-btn').forEach(b=>b.classList.remove('active')); document.getElementById('btn-'+d).classList.add('active'); loadData(); }
async function openGame(id) { currentGameId=id; document.getElementById('mainHeader').scrollIntoView({behavior:'smooth'}); if(!document.getElementById('mainHeader').classList.contains('details-open'))toggleGameDetails(); else renderDetails(); }
async function toggleGameDetails() { document.getElementById('mainHeader').classList.toggle('details-open'); document.getElementById('gameDetailsExpanded').classList.toggle('open'); if(document.getElementById('gameDetailsExpanded').classList.contains('open'))renderDetails(); }
async function calculateShameValue() { if(!currentUnplayed.length)return; document.getElementById('btnCalcShame').style.display='none'; document.getElementById('shameProgressContainer').style.display='block'; let t=0,s=0,d=0; for(let g of currentUnplayed){ let p=await fetchGameDataInternal(g.appid); if(p && p.price_overview){t+=p.price_overview.initial/100; s+=p.price_overview.final/100;} d++; document.getElementById('shameBar').style.width=((d/currentUnplayed.length)*100)+'%'; document.getElementById('shameStatus').innerText=`${d}/${currentUnplayed.length}`; document.getElementById('shameValueTotal').innerText=t.toLocaleString('de-DE',{style:'currency',currency:'EUR'}); document.getElementById('shameValueSale').innerText=s.toLocaleString('de-DE',{style:'currency',currency:'EUR'}); await new Promise(r=>setTimeout(r,100)); } }
function calculateRecap() { let h=document.getElementById('totalHours').innerText; document.getElementById('recapTotalTime').innerText=h; }

// --- ENDE DER DATEI ---
