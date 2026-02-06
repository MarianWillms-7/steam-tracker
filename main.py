from flask import Flask, render_template_string
import requests
import os

app = Flask(__name__)

# --- HIER DEINE DATEN REIN ---
API_KEY = "DFD0C92C5AD7124F7CA4AA7BDEB55632"
# IDs einfach mit Komma trennen
STEAM_IDS = "76561199781733156,76561199230583606,76561199146918370,76561199092277456,76561199000574061,76561199834288937,76561198740913796" 
# -----------------------------

def get_steam_data():
    url = f"http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key={API_KEY}&steamids={STEAM_IDS}"
    try:
        r = requests.get(url)
        data = r.json()
        players = data["response"]["players"]
        return players
    except Exception as e:
        print(e)
        return []

# Das hier ist das HTML-Design direkt im Code (einfachste Variante)
HTML_PAGE = """
<!DOCTYPE html>
<html>
<head>
    <title>Steam Tracker Live</title>
    <style>
        body { font-family: sans-serif; background-color: #1b2838; color: white; text-align: center; padding: 50px; }
        .card { background: #2a475e; padding: 20px; margin: 10px; border-radius: 10px; display: inline-block; width: 200px; }
        img { border-radius: 5px; }
        .online { color: #66c0f4; font-weight: bold; }
        .ingame { color: #a3cf06; font-weight: bold; }
        .offline { color: #898989; }
    </style>
</head>
<body>
    <h1>Steam Freunde Status</h1>
    {% for p in players %}
    <div class="card">
        <img src="{{ p.avatarfull }}" width="100"><br>
        <h3>{{ p.personaname }}</h3>
        
        {% if p.gameextrainfo %}
            <p class="ingame">Spielt: {{ p.gameextrainfo }}</p>
        {% elif p.personastate == 1 %}
            <p class="online">Online</p>
        {% else %}
            <p class="offline">Offline</p>
        {% endif %}
        
        <p><small>Letzte Aktivität: {{ p.lastlogoff }}</small></p>
    </div>
    {% endfor %}
</body>
</html>
"""

@app.route('/')
def home():
    # Wenn einer die Seite aufruft -> Daten von Steam holen -> Anzeigen
    players = get_steam_data()
    return render_template_string(HTML_PAGE, players=players)

if __name__ == '__main__':
    # Wichtig für Render: Port muss flexibel sein
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)