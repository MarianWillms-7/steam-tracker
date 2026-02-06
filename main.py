import requests
import json
import datetime
import os
import re
import sys

# --- KONFIGURATION ---
LOG_FILE = "steam_activity_log.json"
LIB_FILE = "steam_library.json"

# Secrets sicher laden
try:
    API_KEY = os.environ["STEAM_API_KEY"]
    INPUT_IDS = os.environ["STEAM_ID"]
except KeyError as e:
    print(f"❌ FEHLER: Das Secret {e} fehlt in den GitHub Settings!")
    sys.exit(1)

def resolve_steam_id(input_str):
    input_str = str(input_str).strip()
    if not input_str: return None
    
    if input_str.isdigit(): return input_str
    
    if "steamcommunity.com" in input_str:
        if "/profiles/" in input_str:
            try: return re.findall(r'/profiles/(\d+)', input_str)[0]
            except: pass
        if "/id/" in input_str:
            try: return re.findall(r'/id/([^/]+)', input_str)[0]
            except: pass
            
    try:
        url = f"http://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key={API_KEY}&vanityurl={input_str}"
        r = requests.get(url, timeout=10)
        data = r.json()
        if data.get('response', {}).get('success') == 1:
            return data['response']['steamid']
    except: pass
    return None

def update_data():
    # Eingaben trennen
    raw_inputs = re.split(r'[,\n;\s]+', INPUT_IDS)
    raw_inputs = [x for x in raw_inputs if x]
    
    valid_ids = []
    print(f"🔍 Prüfe {len(raw_inputs)} User...")
    
    for inp in raw_inputs:
        sid = resolve_steam_id(inp)
        if sid and sid not in valid_ids: valid_ids.append(sid)
    
    if not valid_ids:
        print("❌ ABBRUCH: Keine gültigen IDs gefunden.")
        sys.exit(1)

    # 1. STATUS UPDATE
    ids_comma = ",".join(valid_ids)
    try:
        r = requests.get(f"http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key={API_KEY}&steamids={ids_comma}", timeout=10)
        if r.status_code != 200:
            print(f"❌ API Fehler: {r.status_code}")
            sys.exit(1)
            
        players = r.json().get('response', {}).get('players', [])
        
        if players:
            # Zeitstempel
            timestamp = (datetime.datetime.utcnow() + datetime.timedelta(hours=1)).isoformat()
            
            if os.path.exists(LOG_FILE):
                with open(LOG_FILE, 'r') as f:
                    try: log_data = json.load(f)
                    except: log_data = []
            else:
                log_data = []

            for p in players:
                entry = {
                    "time": timestamp,
                    "status": p.get('personastate', 0),
                    "name": p.get('personaname', 'Unknown'),
                    "steam_id": p.get('steamid'),
                    "avatar": p.get('avatarfull'),
                    "game": p.get('gameextrainfo', None),
                    "game_id": p.get('gameid', None)
                }
                log_data.append(entry)
                print(f"✅ Status: {p.get('personaname')}")

            with open(LOG_FILE, 'w') as f:
                json.dump(log_data, f, indent=4)

        # 2. LIBRARY UPDATE
        libraries = {}
        if os.path.exists(LIB_FILE):
             with open(LIB_FILE, 'r') as f:
                try: libraries = json.load(f)
                except: libraries = {}

        for sid in valid_ids:
            try:
                r_lib = requests.get(f"http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key={API_KEY}&steamid={sid}&include_appinfo=1&include_played_free_games=1", timeout=10)
                if r_lib.status_code == 200:
                    data = r_lib.json()
                    games = data.get('response', {}).get('games')
                    if games: libraries[sid] = games
            except: pass

        with open(LIB_FILE, 'w') as f:
            json.dump(libraries, f, indent=4)

    except Exception as e:
        print(f"❌ KRITISCHER FEHLER: {e}")
        sys.exit(1)

if __name__ == "__main__":
    update_data()
