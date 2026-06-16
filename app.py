import os
import sys
import csv
import json
import urllib.request
import urllib.parse
import subprocess
import tempfile
import plistlib
import datetime
import time
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

app = FastAPI(title="MusicCue - Custom Apple Music Recommendation")

# Support PyInstaller absolute resource extraction directory path
if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    BASE_DIR = sys._MEIPASS
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

static_dir = os.path.join(BASE_DIR, "static")

CONFIG_DIR = os.path.expanduser('~/Library/Application Support/MusicCue')
CONFIG_FILE = os.path.join(CONFIG_DIR, 'config.json')
TASTE_PROFILE_FILE = os.path.join(CONFIG_DIR, 'taste_profile.json')

# Serve frontend files from the static directory
app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/", response_class=HTMLResponse)
async def get_index(response: Response):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>MusicCue Frontend Not Found. Please build frontend files.</h1>"


class SaveConfigReq(BaseModel):
    activeProvider: Optional[str] = None
    geminiApiKey: Optional[str] = None
    openaiApiKey: Optional[str] = None
    deepseekApiKey: Optional[str] = None
    shortcutName: Optional[str] = None
    volume: Optional[float] = None


@app.get("/api/config")
async def get_config():
    """
    Reads local configuration file JSON and returns it.
    """
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        print(f"Error reading config: {e}")
    return {
        "activeProvider": "gemini",
        "geminiApiKey": "",
        "openaiApiKey": "",
        "deepseekApiKey": "",
        "shortcutName": "MusicCue",
        "volume": 0.5
    }


@app.post("/api/config")
async def save_config(req: SaveConfigReq):
    """
    Saves or merges configuration into local JSON file.
    """
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        current_config = {}
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    current_config = json.load(f)
            except Exception:
                pass
                
        # Merge new parameters
        req_dict = req.dict(exclude_unset=True)
        for k, v in req_dict.items():
            current_config[k] = v
            
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(current_config, f, indent=4, ensure_ascii=False)
            
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存配置失败: {str(e)}")


@app.get("/api/taste-profile")
async def get_taste_profile():
    """
    Reads local taste profile JSON file and returns it.
    """
    try:
        if os.path.exists(TASTE_PROFILE_FILE):
            with open(TASTE_PROFILE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"status": "empty"}
    except Exception as e:
        print(f"Error reading taste profile: {e}")
        return {"status": "empty"}


@app.post("/api/taste-profile")
async def save_taste_profile(profile: dict):
    """
    Saves taste profile to local JSON file.
    """
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        with open(TASTE_PROFILE_FILE, "w", encoding="utf-8") as f:
            json.dump(profile, f, indent=4, ensure_ascii=False)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存听歌画像失败: {str(e)}")


@app.delete("/api/taste-profile")
async def delete_taste_profile():
    """
    Deletes the local taste profile JSON file.
    """
    try:
        if os.path.exists(TASTE_PROFILE_FILE):
            os.remove(TASTE_PROFILE_FILE)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"清除听歌画像失败: {str(e)}")


class RecommendRequest(BaseModel):
    apiKey: str
    scenario: str
    region: str = "us"
    limit: int = 15
    temperature: float = 0.7
    topArtists: List[str] = []
    topTracks: List[str] = []
    topGenres: List[str] = []
    provider: str = "gemini"
    excludeTracks: List[str] = []


def call_gemini_api(api_key: str, prompt: str, temperature: float) -> str:
    """
    Calls the Gemini API using the new google-genai SDK, with automatic retries.
    """
    max_retries = 3
    last_error = None
    
    for attempt in range(max_retries):
        try:
            from google import genai
            from google.genai import types
            
            client = genai.Client(api_key=api_key)
            
            # We enforce JSON response
            config = types.GenerateContentConfig(
                temperature=temperature,
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "properties": {
                        "recommendations": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "title": {"type": "STRING"},
                                    "original_title": {"type": "STRING"},
                                    "artist": {"type": "STRING"},
                                    "original_artist": {"type": "STRING"},
                                    "reason": {"type": "STRING"}
                                },
                                "required": ["title", "artist", "reason"]
                            }
                        }
                    },
                    "required": ["recommendations"]
                }
            )
            
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=config
            )
            return response.text
        except ImportError:
            # Fallback to direct HTTP request if google-genai import fails or has issues
            return call_gemini_api_http(api_key, prompt, temperature)
        except Exception as e:
            last_error = e
            print(f"Gemini API attempt {attempt + 1} failed: {e}. Retrying...")
            if attempt < max_retries - 1:
                time.sleep(1.5 * (attempt + 1))
                
    raise HTTPException(status_code=500, detail=f"Gemini API Error (after {max_retries} attempts): {str(last_error)}")


def call_gemini_api_http(api_key: str, prompt: str, temperature: float) -> str:
    """
    Direct HTTP fallback for calling Gemini API without relying on SDK structure, with automatic retries.
    """
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    headers = {"Content-Type": "application/json"}
    
    # Structure payload with JSON schema constraint
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "OBJECT",
                "properties": {
                    "recommendations": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "title": {"type": "STRING"},
                                "original_title": {"type": "STRING"},
                                "artist": {"type": "STRING"},
                                "original_artist": {"type": "STRING"},
                                "reason": {"type": "STRING"}
                            },
                            "required": ["title", "artist", "reason"]
                        }
                    }
                },
                "required": ["recommendations"]
            }
        }
    }
    
    max_retries = 3
    last_error = None
    
    for attempt in range(max_retries):
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                text = res_data["candidates"][0]["content"]["parts"][0]["text"]
                return text
        except Exception as e:
            last_error = e
            print(f"Gemini HTTP attempt {attempt + 1} failed: {e}. Retrying...")
            if attempt < max_retries - 1:
                time.sleep(1.5 * (attempt + 1))
                
    raise HTTPException(status_code=500, detail=f"Gemini HTTP Fallback Error (after {max_retries} attempts): {str(last_error)}")


def call_openai_compatible_api(api_key: str, prompt: str, temperature: float, base_url: str, model_name: str) -> str:
    """
    Calls an OpenAI-compatible API using standard urllib.request.
    """
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    payload = {
        "model": model_name,
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": temperature,
        "response_format": {"type": "json_object"}
    }
    
    max_retries = 3
    last_error = None
    
    for attempt in range(max_retries):
        req = urllib.request.Request(
            base_url, 
            data=json.dumps(payload).encode("utf-8"), 
            headers=headers, 
            method="POST"
        )
        try:
            with urllib.request.urlopen(req) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                text = res_data["choices"][0]["message"]["content"]
                return text
        except Exception as e:
            last_error = e
            print(f"API attempt {attempt + 1} for model {model_name} failed: {e}. Retrying...")
            if attempt < max_retries - 1:
                time.sleep(1.5 * (attempt + 1))
                
    raise HTTPException(status_code=500, detail=f"API Error for model {model_name} (after {max_retries} attempts): {str(last_error)}")


@app.post("/api/parse-file")
async def parse_file(file: UploadFile = File(...)):
    """
    Parses either Apple Music XML Library export or Play Activity CSV logs.
    """
    try:
        contents = await file.read()
        filename = file.filename.lower()
        
        if filename.endswith(".xml"):
            return parse_xml_library(contents)
        else:
            return parse_csv_data(contents)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/parse-csv")
async def parse_csv_legacy(file: UploadFile = File(...)):
    return await parse_file(file)


def parse_xml_library(contents: bytes) -> dict:
    try:
        data = plistlib.loads(contents)
        tracks_dict = data.get("Tracks", {})
        
        artists = {}
        tracks = {}
        genres = {}
        total_plays = 0
        
        # Get current time in UTC
        now = datetime.datetime.now(datetime.timezone.utc)
        
        # Helper to convert dates to timezone-aware UTC
        def get_utc_date(dt):
            if dt is None:
                return None
            if dt.tzinfo is not None:
                return dt.astimezone(datetime.timezone.utc)
            # If naive, assume UTC as plist dates are UTC
            return dt.replace(tzinfo=datetime.timezone.utc)
        
        for track_id, track in tracks_dict.items():
            artist = track.get("Artist", "").strip()
            name = track.get("Name", "").strip()
            genre = track.get("Genre", "").strip()
            play_count = track.get("Play Count", 0)
            date_added_raw = track.get("Date Added")
            
            if not artist or not name:
                continue
                
            # Determine recency decay factor (Half-life = 120 days)
            recency_factor = 1.0
            date_added = get_utc_date(date_added_raw)
            if date_added:
                try:
                    days_ago = (now - date_added).days
                    if days_ago < 0:
                        days_ago = 0
                    # Exponential decay formula: 2 ^ (-days / 120)
                    recency_factor = 2.0 ** (-days_ago / 120.0)
                except Exception:
                    recency_factor = 1.0
                    
            # Base play count weight (minimum 1 so even newly added tracks have weight)
            base_weight = play_count if play_count > 0 else 1
            
            # Composite Weight
            weight = base_weight * recency_factor
            
            artists[artist] = artists.get(artist, 0.0) + weight
            track_key = f"{name} - {artist}"
            tracks[track_key] = tracks.get(track_key, 0.0) + weight
            if genre:
                genres[genre] = genres.get(genre, 0.0) + weight
            total_plays += play_count if play_count > 0 else 1
            
        # Sort and get top results
        top_artists = sorted(artists.items(), key=lambda x: x[1], reverse=True)[:30]
        top_tracks = sorted(tracks.items(), key=lambda x: x[1], reverse=True)[:30]
        top_genres = sorted(genres.items(), key=lambda x: x[1], reverse=True)[:15]

        return {
            "topArtists": [item[0] for item in top_artists],
            "topTracks": [item[0] for item in top_tracks],
            "topGenres": [item[0] for item in top_genres],
            "counts": {
                "artists": len(artists),
                "tracks": len(tracks),
                "totalPlays": total_plays
            }
        }
    except Exception as e:
        raise ValueError(f"Error parsing Apple Music Library XML: {str(e)}")


def parse_csv_data(contents: bytes) -> dict:
    try:
        # Decode contents to string
        try:
            csv_text = contents.decode("utf-8")
        except UnicodeDecodeError:
            csv_text = contents.decode("utf-8-sig", errors="ignore")

        reader = csv.reader(csv_text.splitlines())
        
        # Read header
        header = next(reader, None)
        if not header:
            raise ValueError("Empty CSV file")

        # Map column headers to indices
        col_map = {col.strip().lower(): idx for idx, col in enumerate(header)}
        
        artist_idx = col_map.get("artist name")
        track_idx = col_map.get("content name")
        genre_idx = col_map.get("genre")
        
        if artist_idx is None or track_idx is None:
            artist_idx = col_map.get("artist") or col_map.get("歌手")
            track_idx = col_map.get("title") or col_map.get("歌曲") or col_map.get("song")
            genre_idx = col_map.get("genre") or col_map.get("风格")
            
        if artist_idx is None or track_idx is None:
            raise ValueError("CSV must contain 'Artist Name' and 'Content Name' (or 'Artist' and 'Title') columns.")

        artists = {}
        tracks = {}
        genres = {}

        for row in reader:
            if not row or len(row) <= max(artist_idx, track_idx):
                continue
            
            artist = row[artist_idx].strip()
            track = row[track_idx].strip()
            genre = row[genre_idx].strip() if (genre_idx is not None and len(row) > genre_idx) else ""
            
            if not artist or not track:
                continue
            
            artists[artist] = artists.get(artist, 0) + 1
            track_key = f"{track} - {artist}"
            tracks[track_key] = tracks.get(track_key, 0) + 1
            if genre:
                genres[genre] = genres.get(genre, 0) + 1

        top_artists = sorted(artists.items(), key=lambda x: x[1], reverse=True)[:30]
        top_tracks = sorted(tracks.items(), key=lambda x: x[1], reverse=True)[:30]
        top_genres = sorted(genres.items(), key=lambda x: x[1], reverse=True)[:15]

        return {
            "topArtists": [item[0] for item in top_artists],
            "topTracks": [item[0] for item in top_tracks],
            "topGenres": [item[0] for item in top_genres],
            "counts": {
                "artists": len(artists),
                "tracks": len(tracks),
                "totalPlays": sum(artists.values())
            }
        }
    except Exception as e:
        raise ValueError(f"Error parsing CSV logs: {str(e)}")


@app.post("/api/recommend")
async def recommend(req: RecommendRequest):
    """
    Formulates a prompt for the AI provider and returns song recommendations in JSON format.
    """
    if not req.apiKey:
        raise HTTPException(status_code=400, detail=f"API Key is required for provider '{req.provider}'")

    # Construct the user taste profile string
    taste_profile = []
    if req.topArtists:
        taste_profile.append(f"Top Artists: {', '.join(req.topArtists[:15])}")
    if req.topTracks:
        taste_profile.append(f"Top Tracks: {', '.join(req.topTracks[:15])}")
    if req.topGenres:
        taste_profile.append(f"Top Genres: {', '.join(req.topGenres[:10])}")
        
    taste_str = "\n".join(taste_profile) if taste_profile else "No listening profile provided (starting fresh)."

    exclude_str = ""
    if req.excludeTracks:
        exclude_list = "\n".join([f"- {track}" for track in req.excludeTracks])
        exclude_str = f"\n\n[Exclude Tracks]\nDo NOT recommend any of the following songs (or close variations/covers) to ensure variety:\n{exclude_list}"

    prompt = f"""You are a professional music curator and recommendation expert.
The user wants a personalized playlist recommendation based on their music taste and a specific scenario.

[User Taste Profile]
{taste_str}

[Target Scenario/Vibe]
"{req.scenario}"{exclude_str}

[Apple Music Storefront Region]
{req.region.upper()} (User uses a {req.region.upper()} region account)

[Instructions]
1. Generate exactly {req.limit} song recommendations that fit the target scenario AND respect the user's music taste.
2. The user has specifically requested good recommendations for non-native English songs (e.g. Chinese, Japanese, Korean, French, Latin etc.) if it matches their vibe or taste. Do not bias only towards mainstream US pop unless the scenario/taste demands it.
3. Crucial storefront compatibility: Because the user storefront is {req.region.upper()}, non-English songs are often listed under translated names or pinyin/romanization in this storefront. For each recommended song:
   - Provide the English or Romanized/Pinyin title and artist name commonly used in the {req.region.upper()} store (in the `title` and `artist` fields).
   - If the track is in a non-English language (e.g., Chinese, Japanese), specify the original native title and native artist name in `original_title` and `original_artist` respectively. This is essential for search fallback.
4. For each song, provide a clear, one-sentence description (`reason`) explaining why this song fits the scenario and taste. Write the `reason` in Chinese (简体中文).
5. Crucial variety: If [Exclude Tracks] is provided, you MUST NOT recommend any of the songs listed there to ensure variety.

Return the recommendations as a JSON object matching this schema:
{{
    "recommendations": [
        {{
            "title": "English title or Romanized title as seen in the US Apple Music store",
            "original_title": "Original non-English title (e.g. 晴天). Leave blank or empty string if song is natively English.",
            "artist": "Artist name as seen in the US Apple Music store (e.g. Jay Chou)",
            "original_artist": "Original non-English artist name (e.g. 周杰伦). Leave blank or empty string if artist is English-speaking.",
            "reason": "为什么推荐这首歌（中文，不超过30字）"
        }}
    ]
}}
"""

    if req.provider == "gemini":
        response_text = call_gemini_api(req.apiKey, prompt, req.temperature)
    elif req.provider == "openai":
        response_text = call_openai_compatible_api(
            api_key=req.apiKey,
            prompt=prompt,
            temperature=req.temperature,
            base_url="https://api.openai.com/v1/chat/completions",
            model_name="gpt-4o-mini"
        )
    elif req.provider == "deepseek":
        response_text = call_openai_compatible_api(
            api_key=req.apiKey,
            prompt=prompt,
            temperature=req.temperature,
            base_url="https://api.deepseek.com/chat/completions",
            model_name="deepseek-chat"
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {req.provider}")
    
    try:
        data = json.loads(response_text)
        return data
    except Exception as e:
        # If parsing fails, return raw text as error context
        raise HTTPException(status_code=500, detail=f"Failed to parse {req.provider} JSON output: {str(e)}. Raw output: {response_text}")


@app.post("/api/search")
async def search_tracks(tracks: List[dict], region: str = "us"):
    """
    Takes a list of recommended songs, searches the iTunes API in parallel, and resolves metadata.
    """
    def search_single(item):
        title = item.get("title")
        artist = item.get("artist")
        original_title = item.get("original_title", "")
        original_artist = item.get("original_artist", "")
        reason = item.get("reason", "")

        # Try searching with primary title + artist
        result = query_itunes(title, artist, region)
        
        # Fallback to original title + artist if no results found
        if not result and (original_title or original_artist):
            search_title = original_title if original_title else title
            search_artist = original_artist if original_artist else artist
            result = query_itunes(search_title, search_artist, region)
            
        if result:
            result["reason"] = reason
            return result
        else:
            # Keep it as an unresolved track so user knows it wasn't found
            return {
                "trackName": title,
                "artistName": artist,
                "collectionName": f"未能在 Apple Music {region.upper()} 曲库中找到",
                "previewUrl": None,
                "artworkUrl": "/static/placeholder.svg",
                "trackViewUrl": None,
                "trackId": None,
                "reason": reason,
                "resolved": False
            }

    # Execute in parallel threads (limit to 10 concurrent threads)
    with ThreadPoolExecutor(max_workers=10) as executor:
        resolved_tracks = list(executor.map(search_single, tracks))
            
    return resolved_tracks


def query_itunes(title: str, artist: str, region: str) -> Optional[dict]:
    """
    Queries the iTunes Search API for a single track.
    """
    query = f"{artist} {title}"
    encoded_query = urllib.parse.quote(query)
    url = f"https://itunes.apple.com/search?term={encoded_query}&media=music&entity=song&limit=3&country={region}"
    
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode("utf-8"))
            results = data.get("results", [])
            
            # Find the best match (compare artist and title loosely)
            for track in results:
                # Basic matching to filter out completely wrong tracks
                ret_artist = track.get("artistName", "").lower()
                ret_title = track.get("trackName", "").lower()
                
                # Check if search artist name is in returned artist name, or vice versa
                if artist.lower() in ret_artist or ret_artist in artist.lower():
                    # High quality artwork (600x600 instead of 100x100)
                    art_url = track.get("artworkUrl100", "")
                    if art_url:
                        art_url = art_url.replace("100x100bb.jpg", "600x600bb.jpg")
                    
                    return {
                        "trackName": track.get("trackName"),
                        "artistName": track.get("artistName"),
                        "collectionName": track.get("collectionName"),
                        "previewUrl": track.get("previewUrl"),
                        "artworkUrl": art_url,
                        "trackViewUrl": track.get("trackViewUrl"),
                        "trackId": track.get("trackId"),
                        "resolved": True
                    }
            
            # If no strict match but we got something, return the first one as a loose match
            if results:
                track = results[0]
                art_url = track.get("artworkUrl100", "").replace("100x100bb.jpg", "600x600bb.jpg")
                return {
                    "trackName": track.get("trackName"),
                    "artistName": track.get("artistName"),
                    "collectionName": track.get("collectionName"),
                    "previewUrl": track.get("previewUrl"),
                    "artworkUrl": art_url,
                    "trackViewUrl": track.get("trackViewUrl"),
                    "trackId": track.get("trackId"),
                    "resolved": True
                }
    except Exception as e:
        print(f"Error querying iTunes: {e}")
        
    return None
@app.get("/api/shortcuts")
async def get_shortcuts():
    """
    Lists all available macOS shortcuts.
    """
    try:
        check_cmd = subprocess.run(["which", "shortcuts"], capture_output=True, text=True)
        if check_cmd.returncode != 0:
            return {"status": "error", "message": "Shortcuts CLI not available", "shortcuts": []}
            
        list_cmd = subprocess.run(["shortcuts", "list"], capture_output=True, text=True)
        if list_cmd.returncode == 0:
            # Parse shortcuts list
            shortcuts = [line.strip() for line in list_cmd.stdout.splitlines() if line.strip()]
            return {"status": "success", "shortcuts": shortcuts}
        return {"status": "error", "message": "Failed to list shortcuts", "shortcuts": []}
    except Exception as e:
        return {"status": "error", "message": str(e), "shortcuts": []}


@app.post("/api/install-shortcut")
async def install_shortcut():
    """
    Triggers macOS to open the packaged .shortcut file, invoking the system import flow.
    """
    try:
        shortcut_path = os.path.join(BASE_DIR, "resources", "shortcuts", "MusicCue.shortcut")
        if not os.path.exists(shortcut_path):
            raise HTTPException(status_code=404, detail="快捷指令打包文件未找到。")
        
        # Trigger macOS 'open' command which imports the .shortcut file
        subprocess.run(["open", shortcut_path])
        return {"status": "success", "message": "已打开快捷指令安装界面，请在系统弹窗中确认添加。"}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"无法启动安装程序: {str(e)}")



class SyncRequest(BaseModel):
    playlistName: str = "MusicCue"
    tracks: List[str]  # List of "Song Name - Artist Name" or Apple Music URLs


@app.post("/api/sync")
async def sync_playlist(req: SyncRequest):
    """
    Executes the macOS Shortcut to add songs to Apple Music.
    """
    if not req.tracks:
        raise HTTPException(status_code=400, detail="Track list is empty")
        
    # Write track entries to temporary file
    # We will pass this file as input to macOS Shortcuts
    try:
        # Generate temporary text file with tracks
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as f:
            f.write("\n".join(req.tracks))
            temp_path = f.name
            
        # Execute macOS Shortcut command:
        # shortcuts run "MusicCue" -i /path/to/temp.txt
        # (We use the user-provided shortcut name or default to MusicCue)
        # Note: If the shortcut expects the playlist name, we can also pass it.
        # But we'll design a standard Shortcut that handles this.
        shortcut_name = req.playlistName
        
        # Verify if shortcuts tool is available
        check_cmd = subprocess.run(["which", "shortcuts"], capture_output=True, text=True)
        if check_cmd.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail="macOS 'shortcuts' CLI tool is not available. Please run this app on macOS."
            )
            
        # First verify if the shortcut exists
        list_cmd = subprocess.run(["shortcuts", "list"], capture_output=True, text=True)
        if shortcut_name not in list_cmd.stdout:
            # We fail gracefully with a specific error prompting the user to create the shortcut
            raise HTTPException(
                status_code=400,
                detail=f"Shortcut '{shortcut_name}' not found. Please create a macOS shortcut named '{shortcut_name}' first."
            )
            
        # Run the shortcut
        run_cmd = subprocess.run(
            ["shortcuts", "run", shortcut_name, "-i", temp_path],
            capture_output=True,
            text=True
        )
        
        # Remove temporary file
        os.unlink(temp_path)
        
        if run_cmd.returncode == 0:
            return {"status": "success", "message": f"Successfully triggered '{shortcut_name}' shortcut!"}
            
        raise HTTPException(
            status_code=500,
            detail=f"Shortcut execution failed: {run_cmd.stderr or run_cmd.stdout}"
        )
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Sync error: {str(e)}")


if __name__ == "__main__":
    import threading
    import socket
    import time
    import uvicorn
    import webview

    def find_free_port():
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(('127.0.0.1', 0))
        port = s.getsockname()[1]
        s.close()
        return port

    port = find_free_port()

    def run_server():
        uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")

    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # Dynamic port polling to check when server is active (checks every 20ms, up to 1.5s max)
    start_time = time.time()
    for _ in range(75):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.02)
                s.connect(('127.0.0.1', port))
                break
        except Exception:
            time.sleep(0.02)

    webview.create_window(
        title="MusicCue",
        url=f"http://127.0.0.1:{port}",
        width=1280,
        height=800,
        min_size=(1000, 700),
        background_color='#FAFAF9'
    )
    storage_dir = os.path.expanduser('~/Library/Application Support/MusicCue')
    try:
        os.makedirs(storage_dir, exist_ok=True)
    except Exception as e:
        print(f"Failed to create storage directory: {e}")
        storage_dir = None

    webview.start(storage_path=storage_dir, private_mode=False)

