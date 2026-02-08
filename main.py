import requests
import json
import os
import time
from datetime import datetime

# ==========================================
# 1. KONFIGURATION
# ==========================================
STEAM_API_KEY = os.environ.get('STEAM_API_KEY')
STEAM_USER_IDS = [x.strip() for x in os.environ.get('STEAM_USER_IDS', '').split(',') if x.strip()]
GIST_ID = os.environ.get('GIST_ID')
GIST_TOKEN = os.environ.get('GIST_TOKEN')

# Dateinamen im Gist
LOG_FILE = 'steam_activity_log.json'
LIB_FILE = 'steam_library.json'

# ==========================================
# 2. HELPER: GIST LADEN & SCHREIBEN
# ==========================================
def get_gist_content(filename):
    """Lädt den aktuellen Inhalt einer Datei aus dem Gist"""
    headers = {'Authorization': f'token {GIST_TOKEN}'}
    r = requests.get(f'https://api.github.com/gists/{GIST_ID}', headers=headers)
    if r.status_code == 200:
        files = r.json().get('files', {})
        if filename in files:
            content = files[filename].get('content', '[]')
            try:
                return json.loads(content)
            except:
                return []
    return []

def update_gist(files_content):
    """Sendet die neuen Daten an den Gist"""
    headers = {
        'Authorization': f'token {GIST_TOKEN}',
        'Accept': 'application/vnd.github.v3+json'
    }
    data = {"files": {}}
    for filename, content in files_content.items():
        data["files"][filename] = {"content": json.dumps(content, indent=2)}
    
    r = requests.patch(f'https://api.github.com/gists/{GIST_ID}', headers=headers, json=data)
    if r.status_code == 200:
        print("✅ Gist erfolgreich aktualisiert!")
    else:
        print(f"❌ Fehler beim Gist-Update: {r.status_code} - {r.text}")

# ==========================================
# 3. STEAM DATEN HOLEN
# ==========================================
def get_steam_status():
    if not STEAM_API_KEY or not STEAM_USER_IDS:
        print("❌ API Key oder User IDs fehlen!")
        return []
    
    ids_string = ','.join(STEAM_USER_IDS)
    url = f"http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key={STEAM_API_KEY}&steamids={ids_string}"
    
    try:
        response = requests.get(url, timeout=10)
        data = response.json()
        players = data.get('response', {}).get('players', [])
        
        updates = []
        for p in players:
            # Fallback für Game Name
            game_name = p.get('gameextrainfo')
            game_id = str(p.get('gameid')) if p.get('gameid') else None
            if game_id and not game_name: game_name = "Unbekanntes Spiel"

            updates.append({
                "name": p.get('personaname'),
                "steam_id": p.get('steamid'),
                "avatar": p.get('avatarfull'),
                "status": p.get('personastate', 0),
                "game": game_name,
                "game_id": game_id,
                "time": datetime.utcnow().isoformat() + "Z"
            })
        return updates
    except Exception as e:
        print(f"❌ Fehler bei Status: {e}")
        return []

def get_steam_libraries():
    libraries = {}
    for sid in STEAM_USER_IDS:
        url = f"http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key={STEAM_API_KEY}&steamid={sid}&format=json&include_appinfo=true"
        try:
            r = requests.get(url, timeout=10)
            games = r.json().get('response', {}).get('games', [])
            libraries[sid] = [
                {"appid": g.get("appid"), "name": g.get("name"), "playtime_forever": g.get("playtime_forever", 0)}
                for g in games
            ]
            print(f"📚 Library geladen für {sid}: {len(games)} Spiele.")
        except:
            pass
    return libraries

# ==========================================
# 4. MAIN
# ==========================================
def main():
    if not GIST_ID or not GIST_TOKEN:
        print("❌ GIST_ID oder GIST_TOKEN fehlen in den Secrets!")
        return

    print("🔄 Starte Update...")

    # 1. Bestehende Historie aus Gist laden
    current_log = get_gist_content(LOG_FILE)
    if not isinstance(current_log, list): current_log = []

    # 2. Neuen Status holen
    new_status = get_steam_status()
    
    # 3. Anfügen und Limitieren (max 8000 Einträge, damit der Gist nicht platzt)
    if new_status:
        current_log.extend(new_status)
        current_log = current_log[-8000:]
        print(f"✅ Neuer Status hinzugefügt. Total Einträge: {len(current_log)}")
    
    # 4. Libraries holen
    libraries = get_steam_libraries()
    
    # 5. Alles zurück an Gist senden
    files_to_update = {
        LOG_FILE: current_log
    }
    if libraries:
        files_to_update[LIB_FILE] = libraries
        
    update_gist(files_to_update)

if __name__ == "__main__":
    main()
