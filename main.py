import time
import json
import requests
import threading
import os
from datetime import datetime
from flask import Flask, send_from_directory, jsonify

# --- KONFIGURATION ---
API_KEY = "DFD0C92C5AD7124F7CA4AA7BDEB55632"
# IDs ohne Leerzeichen
STEAM_IDS_RAW = "76561199781733156,76561199230583606,76561199146918370,76561199092277456,76561199000574061,76561199834288937,76561198740913796"
STEAM_IDS = STEAM_IDS_RAW.replace(" ", "")

# Dateinamen
LOG_FILE = "steam_activity_log.json"
LIB_FILE = "steam_library.json"

app = Flask(__name__)

# --- HINTERGRUND-UPDATER ---
def update_steam_data():
    """Diese Funktion läuft endlos im Hintergrund und speichert Daten alle 5 Min."""
    print("Starte Hintergrund-Tracker...")
    while True:
        try:
            # 1. Aktivitäts-Log abrufen
            url_summary = f"http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key={API_KEY}&steamids={STEAM_IDS}"
            r = requests.get(url_summary)
            data = r.json()
            players = data.get("response", {}).get("players", [])

            # Bestehende Logs laden, damit die Historie bleibt
            existing_log = []
            if os.path.exists(LOG_FILE):
                try:
                    with open(LOG_FILE, "r") as f:
                        existing_log = json.load(f)
                except:
                    existing_log = []

            # Neuen Eintrag erstellen
            timestamp = datetime.now().isoformat()
            
            for p in players:
                # Status Logik
                status_code = p.get("personastate", 0)
                game_name = p.get("gameextrainfo", None)
                game_id = p.get("gameid", None)
                
                new_entry = {
                    "time": timestamp,
                    "steam_id": p.get("steamid"),
                    "name": p.get("personaname"),
                    "status": status_code,
                    "game": game_name,
                    "game_id": game_id,
                    "avatar": p.get("avatarfull")
                }
                existing_log.append(new_entry)

            # Speichern
            with open(LOG_FILE, "w") as f:
                json.dump(existing_log, f, indent=2)
            
            print(f"Log aktualisiert: {timestamp}")

            # 2. Bibliothek abrufen (für "Pile of Shame")
            # Das machen wir etwas seltener oder einfach jedes Mal mit
            library_data = {}
            id_list = STEAM_IDS.split(",")
            
            for sid in id_list:
                try:
                    url_games = f"http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key={API_KEY}&steamid={sid}&include_appinfo=1&include_played_free_games=1"
                    rg = requests.get(url_games)
                    gdata = rg.json()
                    games = gdata.get("response", {}).get("games", [])
                    library_data[sid] = games
                except:
                    pass
            
            with open(LIB_FILE, "w") as f:
                json.dump(library_data, f, indent=2)

        except Exception as e:
            print(f"Fehler beim Update: {e}")

        # 5 Minuten warten (300 Sekunden)
        time.sleep(300)

# --- WEBSERVER ---
@app.route('/')
def home():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def serve_files(filename):
    return send_from_directory('.', filename)

# Startet den Tracker in einem separaten Thread, damit die Website nicht blockiert
if __name__ == '__main__':
    # Falls die JSON Dateien noch nicht existieren, lege leere an
    if not os.path.exists(LOG_FILE):
        with open(LOG_FILE, "w") as f: json.dump([], f)
    if not os.path.exists(LIB_FILE):
        with open(LIB_FILE, "w") as f: json.dump({}, f)

    # Thread starten
    tracker_thread = threading.Thread(target=update_steam_data)
    tracker_thread.daemon = True
    tracker_thread.start()

    # Webserver starten
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)