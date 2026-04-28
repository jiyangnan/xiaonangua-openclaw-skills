#!/usr/bin/env python3
"""
Episodic Index — Hybrid Vector-Graph
=====================================
Episodic memory indexing with dual retrieval:
  - Vector: semantic similarity via embeddings
  - Graph: relational proximity via entity graph (NetworkX)

Storage: SQLite for episodes + vectors, JSON for graph edges

Framework-agnostic: paths and embedding provider are configurable
via environment variables or CLI defaults.
"""

import os
import sys
import json
import sqlite3
import hashlib
import time
import argparse
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import httpx

# ── Config (all overridable via env vars) ───────────────────

# Base directory: env var > default
_DEFAULT_BASE = os.environ.get(
    "COGNITIVE_KIT_HOME",
    os.path.join(os.path.expanduser("~"), ".agent-cognitive-kit", "data", "episodic-index")
)
INDEX_DIR = Path(_DEFAULT_BASE)
DB_PATH = INDEX_DIR / "db" / "episodes.db"
GRAPH_PATH = INDEX_DIR / "db" / "graph.json"

# Embedding provider: glm | openai
EMBED_PROVIDER = os.environ.get("COGNITIVE_KIT_EMBED_PROVIDER", "glm")

if EMBED_PROVIDER == "openai":
    EMBED_MODEL = os.environ.get("COGNITIVE_KIT_EMBED_MODEL", "text-embedding-3-small")
    EMBED_DIM = int(os.environ.get("COGNITIVE_KIT_EMBED_DIM", "1536"))
    EMBED_URL = "https://api.openai.com/v1/embeddings"
    EMBED_KEY_ENV = "OPENAI_API_KEY"
else:  # glm default
    EMBED_MODEL = os.environ.get("COGNITIVE_KIT_EMBED_MODEL", "embedding-3")
    EMBED_DIM = int(os.environ.get("COGNITIVE_KIT_EMBED_DIM", "2048"))
    EMBED_URL = "https://api.z.ai/api/paas/v4/embeddings"
    EMBED_KEY_ENV = "GLM_API_KEY"

EMBED_BATCH_SIZE = 16

# Env file search paths (checked in order)
_ENV_FILE_SEARCH = [
    os.path.expanduser("~/.hermes/.env"),
    os.path.expanduser("~/.openclaw/.env"),
    os.path.expanduser("~/.claude/.env"),
    os.path.expanduser("~/.agent-cognitive-kit/.env"),
]

# ── Embedding ───────────────────────────────────────────────

def _get_api_key():
    """Find API key from env var, then from known .env files."""
    key = os.environ.get(EMBED_KEY_ENV, "")
    if key:
        return key

    # Search .env files
    for env_path in _ENV_FILE_SEARCH:
        p = Path(env_path)
        if p.exists():
            for line in p.read_text().splitlines():
                if line.startswith(f"{EMBED_KEY_ENV}="):
                    return line.strip().split("=", 1)[1]

    raise RuntimeError(
        f"{EMBED_KEY_ENV} not found. Set it as env var or in one of: "
        f"{', '.join(_ENV_FILE_SEARCH)}"
    )

def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts via the configured embedding provider."""
    key = _get_api_key()
    results = []
    for i in range(0, len(texts), EMBED_BATCH_SIZE):
        batch = texts[i:i+EMBED_BATCH_SIZE]
        r = httpx.post(
            EMBED_URL,
            headers={"Authorization": f"Bearer {key}"},
            json={"model": EMBED_MODEL, "input": batch},
            timeout=30
        )
        if r.status_code != 200:
            raise RuntimeError(f"Embedding API error: {r.status_code} {r.text[:200]}")
        data = r.json()
        sorted_data = sorted(data["data"], key=lambda x: x["index"])
        results.extend([d["embedding"] for d in sorted_data])
    return results

# ── SQLite ──────────────────────────────────────────────────

def _get_db():
    db = sqlite3.connect(str(DB_PATH))
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    return db

def _init_db(db):
    db.executescript("""
        CREATE TABLE IF NOT EXISTS episodes (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            summary TEXT NOT NULL,
            entities TEXT NOT NULL DEFAULT '[]',
            tags TEXT NOT NULL DEFAULT '[]',
            source TEXT,
            raw_ref TEXT,
            embedding BLOB
        );
        CREATE INDEX IF NOT EXISTS idx_episodes_ts ON episodes(timestamp);
        CREATE INDEX IF NOT EXISTS idx_episodes_tags ON episodes(tags);
    """)
    db.commit()

# ── Graph ───────────────────────────────────────────────────

def _load_graph():
    if GRAPH_PATH.exists():
        return json.loads(GRAPH_PATH.read_text())
    return {"nodes": {}, "edges": []}

def _save_graph(graph):
    GRAPH_PATH.write_text(json.dumps(graph, ensure_ascii=False, indent=2))

def _update_graph(graph, episode_id, entities, tags):
    """Add episode node and link to entities/tags."""
    graph["nodes"][episode_id] = {
        "type": "episode",
        "entities": entities,
        "tags": tags
    }

    for entity in entities:
        if entity not in graph["nodes"]:
            graph["nodes"][entity] = {"type": "entity"}
        graph["edges"].append({
            "source": episode_id,
            "target": entity,
            "relation": "involves",
            "weight": 1.0
        })

    for tag in tags:
        tag_key = f"tag:{tag}"
        if tag_key not in graph["nodes"]:
            graph["nodes"][tag_key] = {"type": "tag", "label": tag}
        graph["edges"].append({
            "source": episode_id,
            "target": tag_key,
            "relation": "has_tag",
            "weight": 1.0
        })

    for i, e1 in enumerate(entities):
        for e2 in entities[i+1:]:
            graph["edges"].append({
                "source": e1,
                "target": e2,
                "relation": "co_occurs",
                "weight": 0.5
            })

    _save_graph(graph)

def _graph_neighbors(graph, node_id, depth=2):
    """Get episode IDs reachable within `depth` hops from a node."""
    adj = {}
    for edge in graph["edges"]:
        s, t = edge["source"], edge["target"]
        adj.setdefault(s, []).append(t)
        adj.setdefault(t, []).append(s)

    visited = set()
    current = {node_id}
    episode_ids = set()

    for _ in range(depth):
        next_layer = set()
        for n in current:
            if n in visited:
                continue
            visited.add(n)
            for neighbor in adj.get(n, []):
                if neighbor not in visited:
                    next_layer.add(neighbor)
                    if neighbor in graph["nodes"] and graph["nodes"][neighbor].get("type") == "episode":
                        episode_ids.add(neighbor)
        current = next_layer

    return episode_ids

# ── Index Operations ────────────────────────────────────────

def add_episode(summary, entities=None, tags=None, source=None, raw_ref=None):
    """Add a new episode to the index."""
    entities = entities or []
    tags = tags or []

    content = f"{summary}:{','.join(entities)}:{','.join(tags)}:{time.time()}"
    eid = hashlib.sha256(content.encode()).hexdigest()[:16]
    ts = datetime.now(timezone.utc).isoformat()

    embedding = embed_texts([summary])[0]
    emb_blob = np.array(embedding, dtype=np.float32).tobytes()

    db = _get_db()
    _init_db(db)
    db.execute(
        "INSERT OR REPLACE INTO episodes (id, timestamp, summary, entities, tags, source, raw_ref, embedding) VALUES (?,?,?,?,?,?,?,?)",
        (eid, ts, summary, json.dumps(entities, ensure_ascii=False), json.dumps(tags, ensure_ascii=False), source, raw_ref, emb_blob)
    )
    db.commit()
    db.close()

    graph = _load_graph()
    _update_graph(graph, eid, entities, tags)

    return eid


def search(query, top_k=10, vector_weight=0.7, graph_weight=0.3, graph_depth=2):
    """Hybrid search: vector similarity + graph proximity."""
    query_emb = np.array(embed_texts([query])[0], dtype=np.float32)

    db = _get_db()
    _init_db(db)
    rows = db.execute("SELECT id, summary, entities, tags, source, timestamp, embedding FROM episodes").fetchall()
    db.close()

    if not rows:
        return []

    vector_scores = {}
    for row in rows:
        emb = np.frombuffer(row["embedding"], dtype=np.float32)
        sim = float(np.dot(query_emb, emb) / (np.linalg.norm(query_emb) * np.linalg.norm(emb) + 1e-8))
        vector_scores[row["id"]] = sim

    if vector_scores:
        v_min = min(vector_scores.values())
        v_max = max(vector_scores.values())
        v_range = v_max - v_min if v_max > v_min else 1.0
        vector_scores = {k: (v - v_min) / v_range for k, v in vector_scores.items()}

    graph = _load_graph()
    graph_scores = {}

    top_vector_ids = sorted(vector_scores, key=vector_scores.get, reverse=True)[:top_k]
    for eid in top_vector_ids:
        if eid in graph["nodes"]:
            neighbors = _graph_neighbors(graph, eid, depth=graph_depth)
            for nid in neighbors:
                if nid not in graph_scores:
                    graph_scores[nid] = 0.0
                graph_scores[nid] += vector_scores.get(eid, 0.0)

    if graph_scores:
        g_min = min(graph_scores.values())
        g_max = max(graph_scores.values())
        g_range = g_max - g_min if g_max > g_min else 1.0
        graph_scores = {k: (v - g_min) / g_range for k, v in graph_scores.items()}

    all_ids = set(vector_scores.keys()) | set(graph_scores.keys())
    hybrid = {}
    for eid in all_ids:
        v = vector_scores.get(eid, 0.0)
        g = graph_scores.get(eid, 0.0)
        hybrid[eid] = vector_weight * v + graph_weight * g

    id_to_row = {row["id"]: row for row in rows}
    results = []
    for eid in sorted(hybrid, key=hybrid.get, reverse=True)[:top_k]:
        if eid in id_to_row:
            row = id_to_row[eid]
            results.append({
                "id": eid,
                "score": round(hybrid[eid], 4),
                "vector_score": round(vector_scores.get(eid, 0.0), 4),
                "graph_score": round(graph_scores.get(eid, 0.0), 4),
                "summary": row["summary"],
                "entities": json.loads(row["entities"]),
                "tags": json.loads(row["tags"]),
                "source": row["source"],
                "timestamp": row["timestamp"]
            })

    return results


def stats():
    """Return index statistics."""
    db = _get_db()
    _init_db(db)
    count = db.execute("SELECT COUNT(*) FROM episodes").fetchone()[0]
    db.close()

    graph = _load_graph()
    entity_count = sum(1 for n in graph["nodes"].values() if n.get("type") == "entity")
    edge_count = len(graph["edges"])

    return {
        "episodes": count,
        "entities": entity_count,
        "edges": edge_count,
        "embed_provider": EMBED_PROVIDER,
        "embed_model": EMBED_MODEL,
        "embed_dim": EMBED_DIM,
        "db_path": str(DB_PATH),
        "graph_path": str(GRAPH_PATH)
    }


def reset():
    """Delete all index data."""
    if DB_PATH.exists():
        DB_PATH.unlink()
    if GRAPH_PATH.exists():
        GRAPH_PATH.unlink()
    return "Index reset complete"


# ── CLI ─────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Episodic Index — Hybrid Vector-Graph")
    sub = parser.add_subparsers(dest="cmd")

    # add
    add_p = sub.add_parser("add", help="Add an episode")
    add_p.add_argument("summary", help="Episode summary")
    add_p.add_argument("--entities", nargs="*", default=[], help="Entity names")
    add_p.add_argument("--tags", nargs="*", default=[], help="Tags")
    add_p.add_argument("--source", default=None, help="Source reference")
    add_p.add_argument("--raw-ref", default=None, help="Raw data reference")

    # search
    search_p = sub.add_parser("search", help="Hybrid search")
    search_p.add_argument("query", help="Search query")
    search_p.add_argument("--top-k", type=int, default=5)
    search_p.add_argument("--vector-weight", type=float, default=0.7)
    search_p.add_argument("--graph-weight", type=float, default=0.3)

    # stats
    sub.add_parser("stats", help="Index statistics")

    # reset
    sub.add_parser("reset", help="Delete all index data")

    args = parser.parse_args()

    if args.cmd == "add":
        eid = add_episode(args.summary, args.entities, args.tags, args.source, args.raw_ref)
        print(json.dumps({"id": eid, "status": "indexed"}))
    elif args.cmd == "search":
        results = search(args.query, args.top_k, args.vector_weight, args.graph_weight)
        print(json.dumps(results, ensure_ascii=False, indent=2))
    elif args.cmd == "stats":
        print(json.dumps(stats(), indent=2))
    elif args.cmd == "reset":
        print(reset())
    else:
        parser.print_help()
