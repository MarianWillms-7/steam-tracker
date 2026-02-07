import os
import json
import requests
import time
from datetime import datetime

# --- CONFIG ---
API_KEY = os.environ["STEAM_API_KEY"]
GIST_ID = os.environ["GIST_ID"]
GIST_TOKEN = os.environ["GIST_TOKEN"]

# Deine IDs (Hardcoded)
STEAM_IDS = "76561199781733156,76561199230583606,76561199146918370,76561199092277456,76561199000574061,76561199834288937,76561198740913796"
ID_LIST = STEAM_IDS.split(",")

def get_gist_content(filename):
    headers = {"Authorization": f"token {GIST_TOKEN}"}
    gist_url = f"https://api.github.com/gists/{GIST_ID}"
    try:
        r = requests.get(gist_url, headers=headers)
        r.raise_for_status()
        files = r.json()['files']
        if filename in files:
            return json.loads(files[filename]['content'])
    except Exception as e:
        print(f"Ladefehler bei {filename}: {e}")
    return [] if filename == "steam_activity_log.json" else {}

def update_data():
    # 1. Alte Daten laden
    existing_log = get_gist_content("steam_activity_log.json")
    # Library laden (falls schon vorhanden, sonst leer)
    library_data = get_gist_content("steam_library.json") 
    if isinstance(library_data, list): library_data = {} # Fallback falls Format falsch war

    # 2. LIVE STATUS (Wer ist online?)
    url_status = f"http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key={API_KEY}&steamids={STEAM_IDS}"
    r_status = requests.get(url_status)
    players = r_status.json().get("response", {}).get("players", [])
    
    timestamp = datetime.now().isoformat()
    
    # Log Entry erstellen
    for p in players:
        entry = {
            "time": timestamp,
            "steam_id": p.get("steamid"),
            "name": p.get("personaname"),
            "status": p.get("personastate", 0),
            "game": p.get("gameextrainfo", None),
            "game_id": p.get("gameid", None),
            "avatar": p.get("avatarfull")
        }
        existing_log.append(entry)

    # Log kürzen (max 2500 Einträge)
    if len(existing_log) > 2500:
        existing_log = existing_log[-2500:]

    # 3. BIBLIOTHEK & ECHTE SPIELZEIT HOLEN (Das behebt dein Problem!)
    # Wir machen das für jeden User in der Liste
    print("Update Bibliotheken...")
    for sid in ID_LIST:
        try:
            # Holt ALLE Spiele + Gesamtspielzeit von Steam
            url_lib = f"http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key={API_KEY}&steamid={sid}&include_appinfo=1&include_played_free_games=1"
            r_lib = requests.get(url_lib)
            data_lib = r_lib.json().get("response", {})
            
            if "games" in data_lib:
                # Wir speichern die Spiele unter der SteamID
                # playtime_forever ist in Minuten -> wir lassen es so, JS rechnet es um
                library_data[sid] = data_lib["games"]
            else:
                print(f"Keine Spiele gefunden für {sid} (Profil privat?)")
                
        except Exception as e:
            print(f"Fehler bei Library Update für {sid}: {e}")
        
        time.sleep(1) # Kurz warten um API nicht zu spammen

    # 4. ALLES HOCHLADEN (Activity Log UND Library)
    headers = {"Authorization": f"token {GIST_TOKEN}"}
    gist_url = f"https://api.github.com/gists/{GIST_ID}"
    
    payload = {
        "files": {
            "steam_activity_log.json": {
                "content": json.dumps(existing_log, indent=2)
            },
            "steam_library.json": {
                "content": json.dumps(library_data, indent=2)
            }
        }
    }
    
    req = requests.patch(gist_url, headers=headers, json=payload)
    print(f"Upload Status: {req.status_code}")

if __name__ == "__main__":
    update_data()
