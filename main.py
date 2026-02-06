from flask import Flask, send_from_directory, jsonify
import requests
import os
import time

# --- HIER DEINE DATEN EINTRAGEN ---
API_KEY = "DFD0C92C5AD7124F7CA4AA7BDEB55632"
STEAM_IDS = "76561199781733156,76561199230583606,76561199146918370,76561199092277456,76561199000574061,76561199834288937,76561198740913796"
# ----------------------------------

app = Flask(__name__)

# Hilfsfunktion: Holt Daten von Steam und baut sie so um, 
# als kämen sie aus deiner alten JSON-Datei
def get_fake_json_data():
    url = f"http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key={API_KEY}&steamids={STEAM_IDS}"
    try:
        r = requests.get(url)
        data = r.json()
        players = data.get("response", {}).get("players", [])
        
        formatted_list = []
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        
        for p in players:
            # Status bestimmen
            status = "Offline"
            if p.get("personastate", 0) > 0:
                status = "Online"
            if p.get("gameextrainfo"):
                status = f"Spielt: {p['gameextrainfo']}"

            # Eintrag bauen (genau so, wie deine index.html es erwartet)
            entry = {
                "timestamp": timestamp,
                "user": p.get("personaname"), 
                "status": status,
                "avatar": p.get("avatarfull"),
                "game": p.get("gameextrainfo", "")
            }
            formatted_list.append(entry)
            
        return formatted_list
    except Exception as e:
        print(f"Fehler: {e}")
        return []

# 1. Das Wichtigste: Zeige deine index.html an!
@app.route('/')
def home():
    # Sucht im aktuellen Ordner nach der index.html
    return send_from_directory('.', 'index.html')

# 2. Der Trick: Wenn deine Website die JSON-Datei sucht...
@app.route('/steam_activity_log.json')
def serve_json():
    # ...geben wir ihr stattdessen frische Live-Daten zurück!
    data = get_fake_json_data()
    return jsonify(data)

# 3. Damit auch CSS, Bilder und JS funktionieren
@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('.', filename)

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
