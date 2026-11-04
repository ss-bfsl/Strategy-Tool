import os
import ssl
import json
import calendar
import hashlib
import html
import re
import urllib.parse
from datetime import datetime, timezone
import yaml
import feedparser
from dotenv import load_dotenv
import asyncio
import websockets
from websockets.asyncio.server import serve
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SEEN_POSTS_PATH = os.path.join(BASE_DIR, "seen_posts.json")
HTML_OUTPUT_PATH = os.path.join(BASE_DIR, "news.html")
CONFIG_PATH = os.path.join(BASE_DIR, "config.yaml")

# WebSocket globals
connected_clients = set()
# WEBSOCKET_HOST = "0.0.0.0"  # Listen on all interfaces
# WEBSOCKET_PORT = int(os.getenv('WEBSOCKET_PORT', 8765))  # Allow environment override
WEBSOCKET_HOST = "0.0.0.0" 
WEBSOCKET_PORT = int(os.getenv("PORT", os.getenv("WEBSOCKET_PORT", 8765)))
FETCH_INTERVAL = 15 * 60  # Fetch every 15 minutes


def load_seen_posts():
    if not os.path.exists(SEEN_POSTS_PATH):
        return {}

    try:
        with open(SEEN_POSTS_PATH, "r", encoding="utf-8") as f:
            seen_posts = json.load(f)
            seen_posts = {
                post_id: item
                for post_id, item in seen_posts.items()
                if item.get("eligible") is True
            }
            return deduplicate_seen_posts(seen_posts)
    except (json.JSONDecodeError, OSError) as e:
        print(f"[WARN] Could not read {SEEN_POSTS_PATH}: {e}")
        return {}


def save_seen_posts(seen_posts):
    temp_path = f"{SEEN_POSTS_PATH}.tmp"
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(seen_posts, f, indent=2)
    os.replace(temp_path, SEEN_POSTS_PATH)


def make_id(source_name, entry):
    raw = entry.get("id") or entry.get("link") or entry.get("title", "")
    return hashlib.sha256(f"{source_name}:{raw}".encode("utf-8")).hexdigest()

def is_seen(seen_posts, post_id):
    return post_id in seen_posts

# def normalize_title(title):
#     return re.sub(r"\s+", " ", title.lower()).strip()

def normalize_title(title):
    # Strip out the publisher name at the end of RSS titles (e.g., " - Moneycontrol.com")
    title = re.sub(r"\s+-\s+[^-]+$", "", title)
    return re.sub(r"\s+", " ", title.lower()).strip()

def similar_title(first_title, second_title):
    first_tokens = title_tokens(first_title)
    second_tokens = title_tokens(second_title)
    shared_tokens = first_tokens & second_tokens
    smaller_title = min(len(first_tokens), len(second_tokens))
    
    # Lowered threshold to 0.50 (50% overlap of the smaller title)
    return len(shared_tokens) >= 4 and smaller_title > 0 and len(shared_tokens) / smaller_title >= 0.50

def title_tokens(title):
    stop_words = {"a", "an", "and", "as", "at", "by", "for", "from", "in", "of", "on", "the", "to", "with"}
    return {
        token
        for token in re.findall(r"[a-z0-9]+", normalize_title(title))
        if token not in stop_words and len(token) > 1
    }

def similar_title(first_title, second_title):
    first_tokens = title_tokens(first_title)
    second_tokens = title_tokens(second_title)
    shared_tokens = first_tokens & second_tokens
    smaller_title = min(len(first_tokens), len(second_tokens))
    return len(shared_tokens) >= 4 and smaller_title and len(shared_tokens) / smaller_title >= 0.60


def is_duplicate(seen_posts, post_id, title, link):
    if is_seen(seen_posts, post_id):
        return True

    normalized_title = normalize_title(title)
    return any(
        (link and item.get("link") == link)
        or normalize_title(item.get("title", "")) == normalized_title
        or similar_title(title, item.get("title", ""))
        for item in seen_posts.values()
    )


def deduplicate_seen_posts(seen_posts):
    unique_posts = {}
    for post_id, item in seen_posts.items():
        if not is_duplicate(
            unique_posts,
            post_id,
            item.get("title", ""),
            item.get("link", ""),
        ):
            unique_posts[post_id] = item
    return unique_posts


def remove_excluded_posts(seen_posts, excluded_keywords):
    return {
        post_id: item
        for post_id, item in seen_posts.items()
        if not any(
            phrase.lower() in normalize_title(item.get("title", ""))
            for phrase in excluded_keywords
        )
    }


def remove_inactive_sources(seen_posts, sources):
    active_source_names = {source["name"] for source in sources}
    return {
        post_id: item
        for post_id, item in seen_posts.items()
        if item.get("source") in active_source_names
    }


def remove_invalid_seen_posts(seen_posts, sources):
    required_by_source = {
        source["name"]: source.get("required_keywords", [])
        for source in sources
    }
    return {
        post_id: item
        for post_id, item in seen_posts.items()
        if not required_by_source.get(item.get("source"))
        or any(
            keyword.lower() in normalize_title(item.get("title", ""))
            for keyword in required_by_source[item["source"]]
        )
    }


def mark_seen(seen_posts, post_id, source, title, link, published_at):
    seen_posts.setdefault(
        post_id,
        {
            "source": source,
            "title": title,
            "link": link,
            "published_at": published_at,
            "seen_at": datetime.now(timezone.utc).isoformat(),
            "eligible": True,
        },
    )


def load_config():
    with open(CONFIG_PATH, "r") as f:
        return yaml.safe_load(f)


def google_news_url(query):
    """Builds a free, no-API-key Google News RSS search URL for a query string."""
    q = urllib.parse.quote_plus(query)
    return f"https://news.google.com/rss/search?q={q}&hl=en-IN&gl=IN&ceid=IN:en"


def build_source_list(config):
    """
    Turns the simple 'companies' / 'people' name lists in config.yaml into
    the actual list of RSS feeds to fetch (their own blog, if any, plus a
    Google News search for their name).
    """
    sources = []
    global_keywords = config.get("global_keywords", [])
    excluded_keywords = config.get("excluded_keywords", [])

    for company in config.get("companies", []):
        name = company["name"]

        if company.get("blog_rss"):
            sources.append({
                "name": f"{name} Blog",
                "url": company["blog_rss"],
                "keywords": company.get("blog_keywords", []),
                "excluded_keywords": excluded_keywords,
            })

        sources.append({
            "name": f"News: {name}",
            "url": google_news_url(
                f'"{name}"' + (
                    " (" + " OR ".join(
                        f'"{keyword}"'
                        for keyword in company.get("news_context_keywords", [])
                    ) + ")"
                    if company.get("news_context_keywords") else ""
                )
            ),
            "keywords": company.get("news_keywords", []),
            "required_keywords": company.get("news_context_keywords", []),
            "excluded_keywords": excluded_keywords,
        })

    for person in config.get("people", []):
        name = person["name"]
        company = person.get("company", "")
        kw_clause = " OR ".join(f'"{keyword}"' for keyword in global_keywords)
        query = f'"{name}"' + (f" ({kw_clause})" if kw_clause else "")

        sources.append({
            "name": f"News: {name}" + (f" ({company})" if company else ""),
            "url": google_news_url(query),
            "keywords": global_keywords,  # backup local filter, in case Google's
                                           # own query matching is loose
            "excluded_keywords": excluded_keywords,
        })

    # Broad industry searches catch relevant developments outside the broker
    # watchlist (for example fintech IPOs and capital-markets regulation).
    for topic in config.get("industry_topics", []):
        sources.append({
            "name": f"Industry: {topic['name']}",
            "url": google_news_url(topic["query"]),
            "required_keyword_groups": topic.get("required_keyword_groups", []),
            "excluded_keywords": excluded_keywords,
        })

    return sources


def matches_keywords(
    entry,
    keywords,
    required_keywords=None,
    excluded_keywords=None,
    required_keyword_groups=None,
):
    text = f"{entry.get('title', '')} {entry.get('summary', '')}".lower()
    if is_excluded(entry, excluded_keywords):
        return False
    if required_keywords and not any(
        phrase.lower() in text for phrase in required_keywords
    ):
        return False
    if required_keyword_groups and not all(
        any(phrase.lower() in text for phrase in group)
        for group in required_keyword_groups
    ):
        return False
    if not keywords:
        return True
    return any(phrase.lower() in text for phrase in keywords)


def is_excluded(entry, excluded_keywords):
    text = f"{entry.get('title', '')} {entry.get('summary', '')}".lower()
    return any(phrase.lower() in text for phrase in (excluded_keywords or []))


def is_recent(entry, recent_days):
    published = entry.get("published_parsed") or entry.get("updated_parsed")
    if not published:
        return False

    published_at = datetime.fromtimestamp(calendar.timegm(published), tz=timezone.utc)
    age_days = (datetime.now(timezone.utc) - published_at).total_seconds() / 86400
    return 0 <= age_days <= recent_days


def is_recent_timestamp(timestamp, recent_days):
    try:
        published_at = datetime.fromisoformat(timestamp)
    except (TypeError, ValueError):
        return False

    age_days = (datetime.now(timezone.utc) - published_at).total_seconds() / 86400
    return 0 <= age_days <= recent_days


def fetch_new_items(seen_posts, sources, recent_days=1):
    """
    Only eligible entries are stored in the JSON history. This prevents
    irrelevant feed items from blocking a later matching alert.
    """
    new_items = []
    for source in sources:
        name = source["name"]
        url = source["url"]
        keywords = source.get("keywords", [])
        required_keywords = source.get("required_keywords", [])
        required_keyword_groups = source.get("required_keyword_groups", [])
        excluded_keywords = source.get("excluded_keywords", [])
        try:
            feed = feedparser.parse(url)
            if feed.bozo and not feed.entries:
                print(f"[WARN] Could not parse feed for '{name}': {feed.bozo_exception}")
                continue
        except Exception as e:
            print(f"[WARN] Failed to fetch '{name}': {e}")
            continue

        for entry in feed.entries:
            if not is_recent(entry, recent_days):
                continue

            title = entry.get("title", "(no title)")
            link = entry.get("link", "")
            published = entry.get("published_parsed") or entry.get("updated_parsed")
            published_at = datetime.fromtimestamp(
                calendar.timegm(published),
                tz=timezone.utc,
            ).isoformat()
            post_id = make_id(name, entry)
            if is_duplicate(seen_posts, post_id, title, link):
                continue

            if is_excluded(entry, excluded_keywords):
                continue

            if matches_keywords(
                entry,
                keywords,
                required_keywords,
                excluded_keywords,
                required_keyword_groups,
            ):
                mark_seen(seen_posts, post_id, name, title, link, published_at)
                new_items.append(
                    {
                        "source": name,
                        "title": title,
                        "link": link,
                        "summary": (entry.get("summary", "") or "")[:400],
                    }
                )
    return new_items


# def summarize_with_claude(items):
    """Optional: adds a one-line AI summary per item if ANTHROPIC_API_KEY is set."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return items

    import anthropic

    client = anthropic.Anthropic(api_key=api_key)

    for item in items:
        try:
            prompt = (
                f"Title: {item['title']}\nSnippet: {item['summary']}\n\n"
                "In one short sentence, explain what this news item is about, "
                "written for someone at a stock brokerage tracking competitor "
                "activity in the Indian BFSI/broking industry."
            )
            resp = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=100,
                messages=[{"role": "user", "content": prompt}],
            )
            item["ai_summary"] = resp.content[0].text.strip()
        except Exception as e:
            print(f"[WARN] Claude summarization failed for '{item['title']}': {e}")
            item["ai_summary"] = None
    return items


def save_html_report(seen_posts, recent_days):
    items = sorted(
        (
            item for item in seen_posts.values()
            if is_recent_timestamp(item.get("published_at"), recent_days)
        ),
        key=lambda item: item.get("seen_at", ""),
        reverse=True,
    )
    cards = []
    for item in items:
        title = html.escape(item.get("title", "(no title)"))
        source = html.escape(item.get("source", "Unknown source"))
        link = html.escape(item.get("link", ""), quote=True)
        cards.append(
            f'<article><p class="source">{source}</p>'
            f'<h2><a href="{link}" target="_blank" rel="noopener">{title}</a></h2>'
            f'<p class="date">Processed: {html.escape(item.get("seen_at", ""))}</p>'
            "</article>"
        )

    report = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>News Alerts</title>
  <style>
    body {{ max-width: 900px; margin: 40px auto; padding: 0 20px; font: 16px/1.5 system-ui, sans-serif; color: #202124; background: #f5f7fa; }}
    header {{ margin-bottom: 24px; }}
    article {{ margin: 12px 0; padding: 18px 22px; background: white; border: 1px solid #dfe3e8; border-radius: 8px; }}
    h1 {{ margin-bottom: 4px; }}
    h2 {{ margin: 4px 0; font-size: 1.1rem; }}
    a {{ color: #1558a6; }}
    .source {{ margin: 0; color: #52606d; font-size: .9rem; font-weight: 600; }}
    .date {{ margin: 8px 0 0; color: #697586; font-size: .8rem; }}
    .empty {{ color: #52606d; }}
  </style>
</head>
<body>
  <header><h1>News Alerts</h1><p>Filtered matching news: {len(items)}</p></header>
  {''.join(cards) or '<p class="empty">No matching news found.</p>'}
</body>
</html>
"""
    temp_path = f"{HTML_OUTPUT_PATH}.tmp"
    with open(temp_path, "w", encoding="utf-8") as f:
        f.write(report)
    os.replace(temp_path, HTML_OUTPUT_PATH)
    print(f"[OK] Updated HTML report: {HTML_OUTPUT_PATH} ({len(items)} item(s)).")


async def broadcast_to_clients(message):
    """Broadcast a message to all connected WebSocket clients."""
    if connected_clients:
        disconnected = set()
        for client in connected_clients:
            try:
                await client.send(json.dumps(message))
            except websockets.exceptions.ConnectionClosed:
                disconnected.add(client)
            except Exception as e:
                print(f"[WARN] Failed to send to client: {e}")
                disconnected.add(client)
        
        # Remove disconnected clients
        connected_clients.difference_update(disconnected)


async def handle_websocket(websocket):
    """Handle a new WebSocket connection."""
    connected_clients.add(websocket)
    print(f"[INFO] Client connected. Total clients: {len(connected_clients)}")
    
    try:
        # Send initial data when client connects
        seen_posts = load_seen_posts()
        recent_days = load_config().get("recent_days", 1)
        items = sorted(
            (
                item for item in seen_posts.values()
                if is_recent_timestamp(item.get("published_at"), recent_days)
            ),
            key=lambda item: item.get("seen_at", ""),
            reverse=True,
        )
        await websocket.send(json.dumps({
            "type": "initial",
            "items": items[:50]  # Send last 50 items
        }))
        
        # Keep connection open
        async for message in websocket:
            pass
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        connected_clients.discard(websocket)
        print(f"[INFO] Client disconnected. Total clients: {len(connected_clients)}")


async def fetch_periodically(config):
    """Continuously fetch news at intervals and broadcast to clients."""
    excluded_keywords = config.get("excluded_keywords", [])
    recent_days = config.get("recent_days", 1)
    sources = build_source_list(config)
    
    print(f"[INFO] Starting continuous news fetcher (interval: {FETCH_INTERVAL}s)")
    first_run = True
    
    while True:
        try:
            if not first_run:
                await asyncio.sleep(FETCH_INTERVAL)
            first_run = False
            
            print(f"[INFO] Fetching feeds at {datetime.now(timezone.utc).isoformat()}...")
            
            seen_posts = remove_excluded_posts(load_seen_posts(), excluded_keywords)
            seen_posts = remove_inactive_sources(seen_posts, sources)
            seen_posts = remove_invalid_seen_posts(seen_posts, sources)
            
            new_items = fetch_new_items(seen_posts, sources, recent_days)
            
            if new_items:
                save_seen_posts(seen_posts)
                save_html_report(seen_posts, recent_days)
                
                # Broadcast new items to all connected clients
                for item in new_items:
                    await broadcast_to_clients({
                        "type": "new_item",
                        "data": item
                    })
                
                print(f"[OK] {len(new_items)} new item(s) found and broadcast to {len(connected_clients)} client(s)")
            else:
                print(f"[INFO] No new items found")
            
        except Exception as e:
            print(f"[ERROR] In fetch_periodically: {e}")
            await asyncio.sleep(FETCH_INTERVAL)


async def start_websocket_server():
    """Start the HTTP API used by the static frontend."""
    class NewsApiHandler(BaseHTTPRequestHandler):
        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def do_GET(self):
            if self.path not in ("/api/news", "/news"):
                self.send_error(404, "Not found")
                return

            config = load_config()
            recent_days = config.get("recent_days", 1)
            items = sorted(
                (
                    item for item in load_seen_posts().values()
                    if is_recent_timestamp(item.get("published_at"), recent_days)
                ),
                key=lambda item: item.get("seen_at", ""),
                reverse=True,
            )[:50]
            payload = json.dumps({"items": items}).encode("utf-8")

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, format, *args):
            return

    server = ThreadingHTTPServer((WEBSOCKET_HOST, WEBSOCKET_PORT), NewsApiHandler)
    print(f"[INFO] News API running on http://{WEBSOCKET_HOST}:{WEBSOCKET_PORT}/api/news")
    await asyncio.to_thread(server.serve_forever)


async def main_async():
    """Main async function to run server and fetcher concurrently."""
    config = load_config()
    
    # Start both the WebSocket server and the periodic fetcher
    await asyncio.gather(
        start_websocket_server(),
        fetch_periodically(config)
    )


def main():
    """Wrapper for async main."""
    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        print("\n[INFO] Shutting down...")


if __name__ == "__main__":
    main()
