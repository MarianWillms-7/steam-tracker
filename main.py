import os
import json
import requests
import time
from datetime import datetime

# --- CONFIG ---
API_KEY = os.environ["STEAM_API_KEY"]
GIST_ID = os.environ["GIST_ID"]
GIST_TOKEN = os.environ["GIST_TOKEN"]

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
    return [] if "log" in filename or "archive" in filename else {}

def fetch_game_metadata(game_id):
    if not game_id: return None
    try:
        url = f"https://store.steampowered.com/api/appdetails?appids={game_id}&l=german"
        r = requests.get(url)
        data = r.json()
        if data and data[str(game_id)]['success']:
            game_data = data[str(game_id)]['data']
            return {
                "name": game_data.get("name"),
                "genres": [g['description'] for g in game_data.get("genres", [])]
            }
    except: return None
    return None

def update_data():
    existing_log = get_gist_content("steam_activity_log.json")
    library_data = get_gist_content("steam_library.json")
    metadata_cache = get_gist_content("steam_metadata.json")
    if isinstance(library_data, list): library_data = {}

    url_status = f"http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key={API_KEY}&steamids={STEAM_IDS}"
    players = requests.get(url_status).json().get("response", {}).get("players", [])
    timestamp = datetime.now().isoformat()
    
    for p in players:
        g_id = p.get("gameid")
        entry = {
            "time": timestamp,
            "steam_id": p.get("steamid"),
            "name": p.get("personaname"),
            "status": p.get("personastate", 0),
            "game": p.get("gameextrainfo", None),
            "game_id": g_id,
            "avatar": p.get("avatarfull")
        }
        existing_log.append(entry)
        
        if g_id and str(g_id) not in metadata_cache:
            meta = fetch_game_metadata(g_id)
            if meta: metadata_cache[str(g_id)] = meta
            time.sleep(1)

    # Multi-Gist / Archivierung
    if len(existing_log) > 2500:
        archive = get_gist_content("steam_activity_archive.json")
        archive.extend(existing_log[:-2500])
        existing_log = existing_log[-2500:]
        archive_content = json.dumps(archive)
    else:
        archive_content = None

    for sid in ID_LIST:
        try:
            url_lib = f"http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key={API_KEY}&steamid={sid}&include_appinfo=1&include_played_free_games=1"
            data_lib = requests.get(url_lib).json().get("response", {})
            if "games" in data_lib: library_data[sid] = data_lib["games"]
        except: pass
        time.sleep(1)

    headers = {"Authorization": f"token {GIST_TOKEN}"}
    files_payload = {
        "steam_activity_log.json": {"content": json.dumps(existing_log, indent=2)},
        "steam_library.json": {"content": json.dumps(library_data, indent=2)},
        "steam_metadata.json": {"content": json.dumps(metadata_cache, indent=2)}
    }
    if archive_content:
        files_payload["steam_activity_archive.json"] = {"content": archive_content}
    
    requests.patch(f"https://api.github.com/gists/{GIST_ID}", headers=headers, json={"files": files_payload})

if __name__ == "__main__":
    update_data()
