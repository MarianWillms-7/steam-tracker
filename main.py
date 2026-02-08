import requests
import json
import os
import time
from datetime import datetime

# ==========================================
# 1. KONFIGURATION
# ==========================================
STEAM_API_KEY = os.environ.get('STEAM_API_KEY')
STEAM_USER_IDS = os.environ.get('STEAM_USER_IDS', '').split(',')

# Dateinamen (müssen mit deinem JS übereinstimmen)
LOG_FILE = 'steam_activity_log.json'
LIB_FILE = 'steam_library.json'
META_FILE = 'steam_metadata.json'

# ==========================================
# 2. STATUS & AKTIVITÄT ABRUFEN
# ==========================================
def get_steam_status():
    if not STEAM_API_KEY or not STEAM_USER_IDS:
        print("Fehler: API Key oder User IDs fehlen in den Secrets.")
        return []

    url = f"http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key={STEAM_API_KEY}&steamids={','.join(STEAM_USER_IDS)}"
    
    try:
        response = requests.get(url, timeout=10)
        data = response.json()
        players = data.get('response', {}).get('players', [])
        
        status_updates = []
        for p in players:
            status_updates.append({
                "name": p.get('personaname'),
                "steam_id": p.get('steamid'),
                "avatar": p.get('avatarfull'),
                "status": p.get('personastate'),
                "game": p.get('gameextrainfo'),
                "game_id": p.get('gameid'),
                "time": datetime.utcnow().isoformat() + "Z"
            })
        return status_updates
    except Exception as e:
        print(f"Fehler beim Status-Update: {e}")
        return []

# ==========================================
# 3. LIBRARIES & SPIELZEIT ABRUFEN
# ==========================================
def get_steam_libraries():
    all_libraries = {}
    for sid in STEAM_USER_IDS:
        if not sid: continue
        url = f"http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key={STEAM_API_KEY}&steamid={sid}&format=json&include_appinfo=true"
        try:
            r = requests.get(url, timeout=10)
            games = r.json().get('response', {}).get('games', [])
            all_libraries[sid] = [
                {
                    "appid": g.get("appid"),
                    "name": g.get("name"),
                    "playtime_forever": g.get("playtime_forever")
                } for g in games
            ]
            print(f"Library für {sid} geladen ({len(games)} Spiele).")
        except Exception as e:
            print(f"Fehler bei Library {sid}: {e}")
    return all_libraries

# ==========================================
# 4. METADATEN (GENRES/FARBEN) FÜR DASHBOARD
# ==========================================
def get_game_metadata(libraries):
    metadata = {}
    unique_game_ids = set()
    for sid in libraries:
        for game in libraries[sid]:
            unique_game_ids.add(game['appid'])
    
    # Wir holen Infos für die meistgespielten oder aktuellen Spiele
    # Um die API nicht zu sprengen, limitieren wir hier auf die wichtigsten
    for appid in list(unique_game_ids)[:50]: 
        try:
            url = f"https://store.steampowered.com/api/appdetails?appids={appid}&filters=genres"
            r = requests.get(url, timeout=10)
            data = r.json()
            if data and data.get(str(appid), {}).get('success'):
                genres = [g['description'] for g in data[str(appid)]['data'].get('genres', [])]
                metadata[str(appid)] = {
                    "genres": genres,
                    "color": "#66c0f4" # Standard Steam Blau
                }
        except:
            continue
        time.sleep(0.2) # Steam API Rate Limit Schutz
    return metadata

# ==========================================
# 5. HAUPTFUNKTION (LÖSCHT NICHTS, REPARIERT NUR)
# ==========================================
def main():
    print(f"Update gestartet: {datetime.now()}")

    # A) Aktivitäts-Log (Status)
    new_status = get_steam_status()
    if new_status:
        log_data = []
        if os.path.exists(LOG_FILE):
            with open(LOG_FILE, 'r', encoding='utf-8') as f:
                try: log_data = json.load(f)
                except: log_data = []
        
        log_data.extend(new_status)
        # Behalte die letzten 10.000 Einträge für die Historie (Heatmap braucht Daten!)
        log_data = log_data[-10000:]
        
        with open(LOG_FILE, 'w', encoding='utf-8') as f:
            json.dump(log_data, f, indent=4)

    # B) Libraries (Für Versus & Leaderboard)
    libraries = get_steam_libraries()
    if libraries:
        with open(LIB_FILE, 'w', encoding='utf-8') as f:
            json.dump(libraries, f, indent=4)

        # C) Metadaten (Für Tag-Cloud & Design)
        # Wir laden diese nur mit, damit dein JS nicht abstürzt
        metadata = get_game_metadata(libraries)
        with open(META_FILE, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=4)

    print("Update abgeschlossen.")

if __name__ == "__main__":
    main()
