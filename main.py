from flask import Flask, send_from_directory, jsonify
import requests
import os
import time

# --- HIER DEINE DATEN ---
API_KEY = "DFD0C92C5AD7124F7CA4AA7BDEB55632"
STEAM_IDS = "76561199781733156,76561199230583606,76561199146918370,76561199092277456,76561199000574061,76561199834288937,76561198740913796"
# ------------------------

app = Flask(__name__)

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

            # Eintrag bauen
            entry = {
                "timestamp": timestamp,
                "user": p.get("personaname"), 
                "status": status,
                "avatar": p.get("avatarfull"),
                "game": p.get("gameextrainfo", "")
            }
            formatted_list.append(entry)
        
        # WICHTIG: Das return steht jetzt HIER (auf gleicher Höhe wie 'for'), 
        # nicht mehr eingerückt. So wartet es, bis alle fertig sind.
        return formatted_list

    except Exception as e:
        print(f"Fehler: {e}")
        return []

@app.route('/')
def home():
    return send_from_directory('.', 'index.html')

@app.route('/steam_activity_log.json')
def serve_json():
    data = get_fake_json_data()
    return jsonify(data)

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('.', filename)

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
