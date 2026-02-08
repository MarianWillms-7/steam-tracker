// ==========================================
// 1. KONFIGURATION
// ==========================================
// TRAGE HIER DEINE DATEN EIN:
const GIST_ID = '90383d1eeb8d52c4083a3542c8400ba4'; 
// (User Name wird hier nicht mehr zwingend gebraucht, aber schadet nicht)

const STEAM_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg';
const DEF_AVATAR = 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png';
const MAX_TRACKER_DELAY_MINUTES = 120; 

let rawData = [], libDataAll = {}, currentUser = null, allUsers = [], gameDataCache = {};
let myChart = null, myPieChart = null;
let currentChartType = 'daily', currentTimeRange = 7, currentGameId = null, currentUnplayed = [], globalGameStats = {};

document.addEventListener("DOMContentLoaded", () => {
    if(GIST_ID.includes('HIER_')) {
        document.getElementById('loading').innerText = "FEHLER: Bitte GIST_ID in js/app.js eintragen!";
        return;
    }
    loadData();
    updateVisitCounter();
});

// ==========================================
// 2. DATA LOADING (VIA API - KEIN 404 MEHR DURCH FALSCHE LINKS)
// ==========================================
async function loadData() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('loading').innerText = "Frage GitHub nach Dateien...";

    try {
        // 1. Wir fragen den Gist: "Welche Dateien hast du und wo liegen sie?"
        const metaResponse = await fetch(`https://api.github.com/gists/${GIST_ID}`);
        if (!metaResponse.ok) throw new Error("Gist nicht gefunden! ID prüfen.");
        
        const metaData = await metaResponse.json();
        const files = metaData.files;

        // Prüfen, ob die Datei existiert
        if (!files || !files['steam_activity_log.json']) {
            throw new Error("Die Datei 'steam_activity_log.json' existiert noch nicht im Gist! Warte auf das Python-Script.");
        }

        // 2. Den ECHTEN Link zur Datei holen (Raw URL)
        const logUrl = files['steam_activity_log.json'].raw_url;
        let libUrl = null;
        if (files['steam_library.json']) libUrl = files['steam_library.json'].raw_url;

        console.log("Lade Daten von:", logUrl);

        // 3. Daten laden
        const r1 = await fetch(logUrl);
        if (!r1.ok) throw new Error("Konnte Inhalt nicht laden.");
        rawData = await r1.json();

        if (libUrl) {
            try {
                const r2 = await fetch(libUrl);
                if(r2.ok) libDataAll = await r2.json();
            } catch(e) { console.warn("Library Skip:", e); }
        }

        // --- Ab hier normaler Ablauf ---
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
        
        document.getElementById('loading').style.display = 'none';

    } catch (e) { 
        console.error(e);
        document.getElementById('loading').innerHTML = `<div style="color:#ef4444; background:rgba(0,0,0,0.8); padding:20px; border-radius:10px; border:1px solid #ef4444;">
            <strong>Fehler:</strong><br>${e.message}<br><br>
            <small>Tipp: Schaue in deinem GitHub Repository unter "Actions", ob der letzte Durchlauf grün war.</small>
        </div>`; 
    }
}

// ==========================================
// 3. CORE LOGIC (UNVERÄNDERT)
// ==========================================
function processData() {
    if (rawData.length === 0) return;
    const userLog = rawData.filter(e => e.name === currentUser);
    const lastEntry = userLog[userLog.length - 1] || {};
    
    if (lastEntry.time) {
        let ts = lastEntry.time.endsWith("Z") ? lastEntry.time : lastEntry.time + "Z";
        let dateObj = new Date(ts);
        document.getElementById('lastUpdate').innerText = dateObj.toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit'});
    }
    document.getElementById('userAvatar').src = lastEntry.avatar || DEF_AVATAR;
    if(userLog.length) document.getElementById('footerInfo').innerText = `Datensätze: ${userLog.length}`;

    updateBadgesDisplay(calculateBadges(userLog));
    const stats = calculateStats(userLog);
    globalGameStats = stats.gameStats;
    
    updateStatusDisplay(lastEntry);
    calculateTrends(userLog);
    
    if(document.getElementById('myChart')) updateBarChart(stats.filteredData, userLog);
    if(document.getElementById('myPieChart')) updatePieChart(stats.gameStats, stats.totalMins);
    
    renderHeatmap(userLog);
    calculateRecords(userLog);

    if(lastEntry.game_id) {
        let bg = document.getElementById('dynamic-bg');
        bg.style.backgroundImage = `url('https://cdn.akamai.steamstatic.com/steam/apps/${lastEntry.game_id}/header.jpg')`;
        bg.style.opacity = "0.3";
    } else {
        document.getElementById('dynamic-bg').style.opacity = "0";
    }
}

function renderOnlineBar() {
    const bar = document.getElementById('onlineBar');
    if(!bar) return;
    bar.innerHTML = '';
    let lastStatus = {};
    rawData.forEach(e => { lastStatus[e.name] = e; });
    Object.values(lastStatus).forEach(u => {
        let statusClass = 'status-offline';
        if (u.game) statusClass = 'status-ingame';
        else if (u.status !== 0) statusClass = 'status-online';
        let div = document.createElement('div');
        div.className = `online-user ${u.name === currentUser ? 'active' : ''}`;
        div.onclick = () => { document.getElementById('userSelect').value = u.name; switchUser(u.name); };
        div.innerHTML = `<img src="${u.avatar}" class="online-avatar ${statusClass}"><span class="online-name">${u.name}</span>`;
        bar.appendChild(div);
    });
}

function calculateBadges(log) {
    let badges = [];
    if(log.length > 1000) badges.push({icon:'💾', title:'Daten-Sammler (1k+ Einträge)'});
    let weekMins = 0;
    let cut = new Date(); cut.setDate(cut.getDate()-7);
    log.forEach((e, i) => { if(new Date(e.time) > cut && e.status!==0 && log[i+1]) weekMins += getDuration(e, log[i+1]); });
    if(weekMins > 40*60) badges.push({icon:'🔥', title:'Hardcore Gamer (40h+/Woche)'});
    let night = log.filter(e => { let h=new Date(e.time).getHours(); return (h>=0 && h<5 && e.status!==0); }).length;
    if(night > 20) badges.push({icon:'🦉', title:'Nachteule'});
    return badges;
}

// --- NEW FEATURES ---
function toggleVsPanel() { document.getElementById('vsPanel').classList.toggle('active'); document.getElementById('vsOverlay').classList.toggle('active'); }
function closeVsPanel() { document.getElementById('vsPanel').classList.remove('active'); document.getElementById('vsOverlay').classList.remove('active'); }
function updateVsStats() {
    let p1 = document.getElementById('vsSelect1').value;
    let p2 = document.getElementById('vsSelect2').value;
    let grid = document.getElementById('vsResultGrid');
    if(!p1 || !p2) { grid.innerHTML = "<div style='grid-column:1/-1; color:#666; margin-top:20px;'>Wähle zwei Spieler aus.</div>"; return; }
    let t1 = calculateTotalPlaytimeForUser(p1);
    let t2 = calculateTotalPlaytimeForUser(p2);
    let sid1 = rawData.find(e => e.name === p1)?.steam_id;
    let sid2 = rawData.find(e => e.name === p2)?.steam_id;
    let l1 = (sid1 && libDataAll[sid1]) ? libDataAll[sid1].length : 0;
    let l2 = (sid2 && libDataAll[sid2]) ? libDataAll[sid2].length : 0;
    grid.innerHTML = `<div class="vs-label-row">Spielzeit (Getrackt)</div><div class="vs-val ${t1>=t2?'winner':'loser'}">${(t1/60).toFixed(1)}h</div><div class="vs-val ${t2>t1?'winner':'loser'}">${(t2/60).toFixed(1)}h</div><div class="vs-label-row">Bibliothek Größe</div><div class="vs-val ${l1>=l2?'winner':'loser'}">${l1}</div><div class="vs-val ${l2>l1?'winner':'loser'}">${l2}</div>`;
}

function calculateTrends(log) {
    let el = document.getElementById('trendTotal'); if(!el) return;
    let now = new Date();
    let week1 = new Date(); week1.setDate(now.getDate() - 7);
    let week2 = new Date(); week2.setDate(now.getDate() - 14);
    let m1 = 0, m2 = 0;
    log.forEach((e, i) => { if(e.status !== 0 && log[i+1]) { let d = getDuration(e, log[i+1]); let t = new Date(e.time); if(t >= week1) m1 += d; else if(t >= week2) m2 += d; } });
    if(m2 === 0) { el.innerHTML = ""; return; }
    let pct = (((m1 - m2) / m2) * 100).toFixed(0);
    el.innerHTML = pct > 0 ? `<span class="trend-up">▲ +${pct}%</span>` : `<span class="trend-down">▼ ${pct}%</span>`;
}

async function generateTagCloud() {
    let c = document.getElementById('tagCloud'); if(!c) return;
    c.innerHTML = "Lade Genres...";
    let tags = {};
    let topGames = Object.values(globalGameStats).sort((a,b) => b.minutes - a.minutes).slice(0, 5);
    for(let g of topGames) { if(g.id) { let d = await fetchGameDataInternal(g.id); if(d && d.genres) d.genres.forEach(gen => tags[gen.description] = (tags[gen.description] || 0) + g.minutes); } }
    let sorted = Object.entries(tags).sort((a,b) => b[1] - a[1]);
    if(!sorted.length) { c.innerHTML = "Keine Daten"; return; }
    let max = sorted[0][1];
    c.innerHTML = sorted.map(([t, v]) => { let s = v > max * 0.7 ? "tag-l" : (v > max * 0.4 ? "tag-m" : "tag-s"); return `<span class="tag-cloud-item ${s}">${t}</span>`; }).join('');
}

// --- STANDARD FUNCTIONS ---
function updateStatusDisplay(e) {
    const els = { cv: document.getElementById('gameCover'), nm: document.getElementById('gameName'), ar: document.getElementById('headerArrow'), wp: document.getElementById('statusWrapper'), st: document.getElementById('currentStatus'), dt: document.getElementById('statusDot') };
    if(!els.st) return; els.cv.style.display="none"; els.nm.style.display="none"; els.wp.classList.remove('clickable'); currentGameId = null;
    let diff = 0;
    if(e.time) diff = (new Date() - new Date(e.time.endsWith("Z")?e.time:e.time+"Z"))/60000;
    if(diff > 45) { els.st.innerText="Abwesend / Offline"; els.dt.style.backgroundColor="gray"; }
    else if(e.game) { els.st.innerText="Spielt"; els.dt.style.backgroundColor="#c1e45e"; els.nm.innerText=e.game; els.nm.style.display="block"; els.cv.src=`https://cdn.akamai.steamstatic.com/steam/apps/${e.game_id}/header.jpg`; els.cv.style.display="block"; currentGameId=e.game_id; els.wp.classList.add('clickable'); }
    else if(e.status !== 0) { els.st.innerText="Online"; els.dt.style.backgroundColor="#4ade80"; els.nm.innerText="Steam"; els.nm.style.display="block"; els.cv.src=STEAM_LOGO; els.cv.style.display="block"; }
    else { els.st.innerText="Offline"; els.dt.style.backgroundColor="#f87171"; }
}

async function tryFetch(url, id) {
    const isValid = (j) => j && j[id] && j[id].success;
    try { let r = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`); let j = await r.json(); if(isValid(j)) return j[id].data; } catch(e) {}
    try { let r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`); let j = await r.json(); if(isValid(j)) return j[id].data; } catch(e) {}
    return null;
}
async function fetchGameDataInternal(id) { if(gameDataCache[id]) return gameDataCache[id]; let d = await tryFetch(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=de&l=german`, id); if(d) gameDataCache[id] = d; return d; }
function calculateStats(log) { let tot=0, day={}, game={}, filt=log, today=0; const start = new Date(); start.setHours(0,0,0,0); log.forEach((e,i) => { if(e.status!==0) { let d=getDuration(e, log[i+1]); if(new Date(e.time)>=start) today+=d; } }); document.getElementById('todayHours').innerText = (today/60).toFixed(1) + "h"; if (currentTimeRange!==9999) { const cut=new Date(); cut.setDate(cut.getDate()-currentTimeRange); filt=log.filter(e=>new Date(e.time)>=cut); } filt.forEach((e,i) => { if(e.status!==0) { let d=getDuration(e, log[log.indexOf(e)+1]); tot+=d; let k=new Date(e.time).toLocaleDateString('de-DE',{weekday:'long'}); day[k]=(day[k]||0)+1; let gn=e.game||"PC/Desktop"; if(!game[gn]) game[gn]={minutes:0,id:e.game_id}; game[gn].minutes+=d; }}); let entry=rawData.find(e=>e.name===currentUser), sid=entry?entry.steam_id:null; let finalT=tot; if(sid&&libDataAll[sid]){let st=0; libDataAll[sid].forEach(g=>st+=g.playtime_forever); finalT=st;} document.getElementById('totalHours').innerText=(finalT/60).toFixed(1)+" h"; let md="-", mv=0; for(let[k,v] of Object.entries(day)) if(v>mv){mv=v;md=k;} document.getElementById('topDay').innerText=md; renderLibraryList(game); return { filteredData: filt, gameStats: game, totalMins: tot }; }
async function calcCompletion() { let el=document.getElementById('compRateVal'), sub=document.getElementById('compSub'); if(!el) return; el.innerText="Lade..."; let entry=rawData.find(e=>e.name===currentUser), sid=entry?entry.steam_id:null; if(!sid||!libDataAll[sid]){el.innerText="Keine Daten";return;} let games=libDataAll[sid].sort((a,b)=>b.playtime_forever-a.playtime_forever).slice(0,3); let totalP=0, count=0; for(let g of games){ sub.innerText=`Scanne: ${g.name}...`; try{ let url=`https://steamcommunity.com/profiles/${sid}/stats/${g.appid}/?xml=1`; let r=await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`); let txt=await r.text(); if(txt&&!txt.includes("<error>")){ let xml=new DOMParser().parseFromString(txt,"text/xml"), achs=xml.querySelectorAll('achievement'); if(achs.length){ let d=0; achs.forEach(a=>{if(a.getAttribute('closed')==="1")d++;}); totalP+=(d/achs.length)*100; count++; } } }catch(e){} await new Promise(r=>setTimeout(r,600)); } if(count>0){ el.innerText=(totalP/count).toFixed(0)+"%"; sub.innerText=`Schnitt (Top ${count})`; confetti({particleCount:50,spread:60,origin:{y:0.6}}); } else{ el.innerText="Error"; sub.innerText="Private Profil?"; } }
async function toggleLibraryDetails(appId, steamId, element) { let drop = document.getElementById(`lib-drop-${appId}`); if(drop.classList.contains('active')) { drop.classList.remove('active'); return; } document.querySelectorAll('.achievement-dropdown').forEach(d => d.classList.remove('active')); drop.classList.add('active'); try { let url = `https://steamcommunity.com/profiles/${steamId}/stats/${appId}/?xml=1`; let r = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`); let text = await r.text(); let xml = new DOMParser().parseFromString(text,"text/xml"), achs=xml.querySelectorAll('achievement'); if(!achs.length) throw new Error("Keine Daten"); let done=0, html=""; achs.forEach(a=>{ let cl=a.getAttribute('closed')==="1"; if(cl) done++; let nm=a.querySelector('name').textContent; let ic=cl?a.querySelector('iconClosed').textContent:a.querySelector('iconOpen').textContent; html+=`<div class="ach-item ${cl?'done':'locked'}"><img src="${ic}" class="ach-icon"><div class="ach-text"><span class="ach-name">${nm}</span></div></div>`; }); drop.innerHTML = `<div class="ach-title">Fortschritt: ${done} / ${achs.length}</div><div class="ach-list">${html}</div>`; } catch(e) { drop.innerHTML = `<div style='text-align:center;padding:10px;'><a href="https://steamcommunity.com/profiles/${steamId}/stats/${appId}/?tab=achievements" target="_blank" style="color:var(--accent);text-decoration:underline;">Auf Steam ansehen ↗</a></div>`; } }
function showRecap() { document.getElementById('recapModal').classList.add('active'); calculateRecap(); }
function closeRecap() { document.getElementById('recapModal').classList.remove('active'); }
function showShame() { document.getElementById('shameModal').classList.add('active'); renderShameList(); }
function closeShame() { document.getElementById('shameModal').classList.remove('active'); }
function calculateRecap() { let h=document.getElementById('totalHours').innerText; document.getElementById('recapTotalTime').innerText=h; let log=rawData.filter(e=>e.name===currentUser); if(!log.length)return; let gs={}, da={}; log.forEach((e,i)=>{if(e.status!==0&&log[i+1]){let d=getDuration(e,log[i+1]); let g=e.game||"PC"; gs[g]=(gs[g]||0)+d; let k=new Date(e.time).toLocaleDateString('de-DE'); da[k]=(da[k]||0)+d;}}); let tg=Object.entries(gs).sort((a,b)=>b[1]-a[1])[0], td=Object.entries(da).sort((a,b)=>b[1]-a[1])[0]; document.getElementById('recapTopGame').innerText=tg?tg[0]:"-"; document.getElementById('recapTopDay').innerText=td?td[0]:"-"; generateTagCloud(); }
function calculateTotalPlaytimeForUser(u) { let t=0; let log=rawData.filter(e=>e.name===u); log.forEach((e,i)=>{if(e.status!==0&&log[i+1])t+=getDuration(e,log[i+1]);}); return t; }
function getDuration(e, next) { if(next){let d=(new Date(next.time)-new Date(e.time))/60000; return d>MAX_TRACKER_DELAY_MINUTES?30:d;} return 30; }
function switchUser(n) { currentUser=n; document.getElementById('mainHeader').classList.remove('details-open'); processData(); renderOnlineBar(); }
function updateBadgesDisplay(b) { const c=document.getElementById('userBadges'); if(c){c.innerHTML=""; b.forEach(x=>c.innerHTML+=`<span class="badge-icon" title="${x.title}">${x.icon}</span>`);} }
function updateLeaderboard() { let w=[], now=new Date(), wk=new Date(); wk.setDate(now.getDate()-7); allUsers.forEach(u=>{ let t=0; rawData.filter(e=>e.name===u&&new Date(e.time)>=wk).forEach((e,i,a)=>{if(e.status!==0&&a[i+1])t+=getDuration(e,a[i+1])}); w.push({name:u,val:t}); }); w.sort((a,b)=>b.val-a.val); renderLBItem('lb-week',w,'Std',60); let l=[], s=[]; allUsers.forEach(u=>{ let e=rawData.find(x=>x.name===u), sid=e?e.steam_id:null; if(sid&&libDataAll[sid]){ l.push({name:u,val:libDataAll[sid].length}); s.push({name:u,val:libDataAll[sid].filter(g=>g.playtime_forever<120).length}); } }); l.sort((a,b)=>b.val-a.val); renderLBItem('lb-lib',l,'Spiele',1); s.sort((a,b)=>b.val-a.val); renderLBItem('lb-shame',s,'Stück',1); }
function renderLBItem(id,d,u,div) { document.getElementById(id).innerHTML = d.slice(0,3).map((x,i)=>`<div class="lb-item"><div class="lb-label">${i===0?'👑':(i===1?'🥈':'🥉')} Platz ${i+1}</div><div class="lb-winner"><img src="${(rawData.find(e=>e.name===x.name)||{}).avatar||DEF_AVATAR}" class="lb-avatar"><span class="lb-name">${x.name}</span><span class="lb-val">${(x.val/div).toFixed(div===1?0:1)} ${u}</span></div></div>`).join('')||"Keine Daten"; }
function renderLibraryList(stats) { let l=document.getElementById('gameLibraryList'); if(!l)return; l.innerHTML=""; let e=rawData.find(x=>x.name===currentUser), sid=e?e.steam_id:null, lib=(sid&&libDataAll[sid])?libDataAll[sid]:[]; if(lib.length){ lib.sort((a,b)=>b.playtime_forever-a.playtime_forever); lib.forEach(g=>{ l.innerHTML+=`<div class="game-list-item" onclick="toggleLibraryDetails(${g.appid},'${sid}',this)"><img src="https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/header.jpg" class="lib-cover" onerror="this.src='${STEAM_LOGO}'"><div class="lib-info"><div class="lib-name">${g.name}</div><div class="lib-last-played">▼ Erfolge anzeigen</div></div><div class="lib-time">${(g.playtime_forever/60).toFixed(1)}h</div></div><div id="lib-drop-${g.appid}" class="achievement-dropdown">Lade...</div>`; }); } else l.innerHTML="<div style='padding:20px;text-align:center;color:#888'>Keine Daten</div>"; }
function calculateRecords(log) { let l=0,c=0,n=0,d=0,da={}; log.forEach((e,i)=>{if(e.status!==0&&log[i+1]){let dur=getDuration(e,log[i+1]);c+=dur; let h=new Date(e.time).getHours(); if(h>=22||h<6)n++;else d++; let ds=new Date(e.time).toLocaleDateString('de-DE', {weekday:'long', day:'numeric', month:'long'}); da[ds]=(da[ds]||0)+dur;}else{if(c>l)l=c;c=0;}}); if(c>l)l=c; document.getElementById('recLongest').innerText=(l/60).toFixed(1)+"h"; document.getElementById('recType').innerText=n>d?"Nachteule":"Tagaktiv"; let md="-",mv=0;for(let[k,v]of Object.entries(da))if(v>mv){mv=v;md=k;} document.getElementById('recActiveDay').innerText=md; }
function renderHeatmap(log) { let g=document.getElementById('heatmapGrid'); if(!g)return; g.innerHTML=""; if(!log.length)return; let map={}; log.forEach((e,i)=>{if(e.status!==0&&log[i+1]){let k=new Date(e.time).toDateString(); map[k]=(map[k]||0)+getDuration(e,log[i+1]);}}); let s=new Date(log[0].time), e=new Date(); for(let d=new Date(s); d<=e; d.setDate(d.getDate()+1)){ let m=map[d.toDateString()]||0, c=document.createElement('div'); c.className='heatmap-cell'; if(m>0)c.classList.add('h-l1'); if(m>60)c.classList.add('h-l2'); if(m>120)c.classList.add('h-l3'); if(m>300)c.classList.add('h-l4'); c.title=`${d.toLocaleDateString()}: ${(m/60).toFixed(1)}h`; g.appendChild(c); } }
async function preloadGames() { let ids=new Set(); rawData.forEach(e=>{if(e.game_id)ids.add(e.game_id)}); for(let id of ids) { if(!gameDataCache[id]) { await fetchGameDataInternal(id); await new Promise(r=>setTimeout(r,300)); } } }

// --- Chart Colors & Transparency ---
function updateBarChart(data, fullLog) { 
    const ctx=document.getElementById('myChart'); 
    if(ctx && window.Chart) { 
        if(myChart)myChart.destroy(); 
        let map={}, labels=[], points=[]; 
        if(currentChartType==='hourly'){ 
            for(let i=0;i<24;i++)points[i]=0; 
            labels=Array.from({length:24},(_,i)=>i+"h"); 
            data.forEach(e=>{if(e.status!==0)points[new Date(e.time).getHours()]++}); 
        } else{ 
            data.forEach(e=>{if(e.status!==0 && fullLog[fullLog.indexOf(e)+1]){let k=new Date(e.time).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}); map[k]=(map[k]||0)+getDuration(e,fullLog[fullLog.indexOf(e)+1])/60;}}); 
            labels=Object.keys(map); 
            points=Object.values(map); 
        } 
        myChart=new Chart(ctx.getContext('2d'),{
            type:'bar',
            data:{
                labels,
                datasets:[{
                    label:'Stunden',
                    data:points,
                    backgroundColor:'rgba(56, 189, 248, 0.5)', // Transparent Blue
                    borderColor: 'rgba(56, 189, 248, 1)',
                    borderWidth: 1,
                    borderRadius:4
                }]
            },
            options:{
                responsive:true,
                maintainAspectRatio:false,
                plugins:{legend:{display:false}},
                scales:{
                    x:{display:false},
                    y:{beginAtZero:true, grid:{color:'rgba(255,255,255,0.05)'}}
                }
            }
        }); 
    } 
}

function updatePieChart(stats, total) { 
    const ctx=document.getElementById('myPieChart'); 
    if(ctx && window.Chart) { 
        if(myPieChart)myPieChart.destroy(); 
        let l=[],d=[],c=[], s=Object.entries(stats).sort((a,b)=>b[1].minutes-a[1].minutes), off=24-(total/60); 
        if(off<0)off=0; 
        s.forEach(([n,v],i)=>{
            if(v.minutes>5){
                l.push(n);
                d.push((v.minutes/60).toFixed(2));
                // Transparente Farben
                c.push(['rgba(102, 192, 244, 0.7)', 'rgba(193, 228, 94, 0.7)', 'rgba(244, 102, 102, 0.7)', 'rgba(168, 85, 247, 0.7)'][i%4]);
            }
        }); 
        if(off>0.1){
            l.push('Offline');
            d.push(off.toFixed(2));
            c.push('rgba(255,255,255,0.05)');
        } 
        document.getElementById('dayPercentage').innerText=((total/60/24)*100).toFixed(1)+'%'; 
        myPieChart=new Chart(ctx.getContext('2d'),{
            type:'doughnut',
            data:{
                labels:l,
                datasets:[{
                    data:d,
                    backgroundColor:c,
                    borderWidth:1,
                    borderColor:'rgba(255,255,255,0.1)'
                }]
            },
            options:{
                cutout:'60%',
                maintainAspectRatio:false,
                plugins:{
                    legend:{
                        position:'bottom',
                        labels:{color:'#94a3b8', usePointStyle:true}
                    }
                }
            }
        }); 
    } 
}

function generateShareCard() { let node=document.getElementById('captureArea'); if(!node)return; html2canvas(node,{backgroundColor:"#0f172a",useCORS:true,allowTaint:true}).then(canvas=>{let link=document.createElement('a');link.download='stats.png';link.href=canvas.toDataURL();link.click();}).catch(e=>alert("Screenshot Error")); }
async function updateVisitCounter() { let el=document.getElementById('visitCounter'); let url="https://api.counterapi.dev/v1/marianwillms-7-steam-activity/views/up"; try{let r=await fetch(url);let j=await r.json();if(el)el.innerText=j.count;}catch(e){try{let r=await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`);let j=await r.json();if(el)el.innerText=j.count;}catch(e2){if(el)el.innerText="(Blockiert)";}}}
function calculateTotalPlaytimeForGame(id) { let t=0; rawData.filter(e=>e.name===currentUser).forEach((e,i,arr)=>{if(e.game_id==id && e.status!==0 && arr[i+1]) t+=getDuration(e,arr[i+1]);}); return (t/60).toFixed(1); }
async function fetchPrice(id) { try{let r=await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent('https://store.steampowered.com/api/appdetails?appids='+id+'&filters=price_overview&cc=de')}`);let j=await r.json();return j[id].data.price_overview;}catch(e){return null;}}
function openUserModal() { document.getElementById('userModal').classList.add('active'); }
function closeUserModal() { document.getElementById('userModal').classList.remove('active'); }
function renderShameList() { let entry=rawData.find(e=>e.name===currentUser), sid=entry?entry.steam_id:null; if(!sid)return; let lib=libDataAll[sid]||[]; let unplayed=lib.filter(g=>g.playtime_forever<120); document.getElementById('shameCount').innerText=unplayed.length; let list=document.getElementById('shameList'); list.innerHTML=""; unplayed.forEach(g=>list.innerHTML+=`<div class="shame-item"><span>${g.name}</span><span>${(g.playtime_forever/60).toFixed(1)}h</span></div>`); currentUnplayed=unplayed; }
function filterLibrary() { let q=document.getElementById('libSearch').value.toLowerCase(); document.querySelectorAll('.game-list-item').forEach(i=>i.style.display=i.innerText.toLowerCase().includes(q)?'flex':'none'); }
function sortLibrary() { renderLibraryList(globalGameStats); }
function setChartType(t) { currentChartType=t; loadData(); }
function setTimeRange(d) { currentTimeRange=d; document.querySelectorAll('.time-btn').forEach(b=>b.classList.remove('active')); document.getElementById('btn-'+d).classList.add('active'); loadData(); }
async function openGame(id) { currentGameId=id; toggleGameDetails(); }
async function toggleGameDetails() { document.getElementById('mainHeader').classList.toggle('details-open'); document.getElementById('gameDetailsExpanded').classList.toggle('open'); if(document.getElementById('gameDetailsExpanded').classList.contains('open')) renderDetails(); }
async function calculateShameValue() { if(!currentUnplayed.length)return; document.getElementById('btnCalcShame').style.display='none'; document.getElementById('shameProgressContainer').style.display='block'; let t=0,s=0,d=0; for(let g of currentUnplayed){ let p=await fetchPrice(g.appid); if(p){t+=p.initial/100; s+=p.final/100;} d++; document.getElementById('shameBar').style.width=((d/currentUnplayed.length)*100)+'%'; document.getElementById('shameStatus').innerText=`${d}/${currentUnplayed.length}`; document.getElementById('shameValueTotal').innerText=t.toLocaleString('de-DE',{style:'currency',currency:'EUR'}); document.getElementById('shameValueSale').innerText=s.toLocaleString('de-DE',{style:'currency',currency:'EUR'}); await new Promise(r=>setTimeout(r,100)); } }
