import os
import json
import requests
import time
from datetime import datetime

# --- CONFIG ---
# Wir holen die Keys jetzt sicher aus den GitHub Secrets
API_KEY = os.environ["STEAM_API_KEY"]
GIST_ID = os.environ["GIST_ID"]
GIST_TOKEN = os.environ["GIST_TOKEN"]

# Deine IDs (Hardcoded ist okay)
STEAM_IDS = "76561199781733156,76561199230583606,76561199146918370,76561199092277456,76561199000574061,76561199834288937,76561198740913796"

def update_gist():
    # 1. Alte Daten aus dem Gist holen
    headers = {"Authorization": f"token {GIST_TOKEN}"}
    gist_url = f"https://api.github.com/gists/{GIST_ID}"
    
    try:
        r = requests.get(gist_url, headers=headers)
        r.raise_for_status()
        gist_data = r.json()
        # Den Inhalt der JSON-Datei im Gist lesen
        content_str = gist_data['files']['steam_activity_log.json']['content']
        existing_log = json.loads(content_str)
    except Exception as e:
        print(f"Konnte Gist nicht lesen (vielleicht leer?): {e}")
        existing_log = []

    # 2. Neue Daten von Steam holen
    url = f"http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key={API_KEY}&steamids={STEAM_IDS}"
    r = requests.get(url)
    data = r.json()
    players = data.get("response", {}).get("players", [])
    
    timestamp = datetime.now().isoformat()
    
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

    # Log kürzen (damit das Gist nicht platzt), behalte die letzten 2000 Einträge
    if len(existing_log) > 2000:
        existing_log = existing_log[-2000:]

    # 3. Daten zurück ins Gist schreiben (Update)
    new_content = json.dumps(existing_log, indent=2)
    
    payload = {
        "files": {
            "steam_activity_log.json": {
                "content": new_content
            }
        }
    }
    
    # PATCH request aktualisiert das Gist ohne Git-Commit!
    req = requests.patch(gist_url, headers=headers, json=payload)
    
    if req.status_code == 200:
        print("Gist erfolgreich aktualisiert! Keine Git-Commits nötig.")
    else:
        print(f"Fehler beim Speichern: {req.text}")

if __name__ == "__main__":
    update_gist()
