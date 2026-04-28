---
name: episodic-index
version: 1.1
description: |
  Hybrid Vector-Graph episodic memory index. Stores episode summaries with
  entity extraction and dual retrieval: vector (semantic similarity) +
  graph (relational proximity via NetworkX). Works with any agent framework.
  Embedding provider configurable (GLM or OpenAI).
trigger: |
  Use when: (1) indexing a completed session/task as an "episode" for future
  recall, (2) searching past episodes by semantic query or entity relationship,
  (3) the user asks "what did we do about X?" or "have we encountered Y before?"
  where X/Y might span multiple sessions.
---

# Episodic Index — Hybrid Vector-Graph

## Architecture (first-principles derivation)

| Design Decision | Why (root reason) |
|----------------|-------------------|
| Dual index (vector + graph) | Their failure modes are orthogonal: vector misses structural relations, graph misses fuzzy semantics. Combining = coverage neither has alone. |
| Configurable embedding provider | No single provider works for all users. GLM default for cost; OpenAI as alternative. Swap via env var. |
| SQLite for episodes | Zero-config, single-file, ACID. No external DB server needed. |
| JSON for graph | Episodes < 10K → NetworkX in-memory is O(1) load. Simpler than graph DB. |
| Weighted fusion (default 0.7V + 0.3G) | Vector is primary signal; graph boosts structurally related but semantically distant results. |

## Configuration

All paths and providers are configurable via environment variables:

| Env Var | Default | Description |
|---------|---------|-------------|
| `COGNITIVE_KIT_HOME` | `~/.agent-cognitive-kit/data/episodic-index` | Base data directory |
| `COGNITIVE_KIT_EMBED_PROVIDER` | `glm` | Embedding provider: `glm` or `openai` |
| `COGNITIVE_KIT_EMBED_MODEL` | `embedding-3` (glm) / `text-embedding-3-small` (openai) | Model name |
| `COGNITIVE_KIT_EMBED_DIM` | `2048` (glm) / `1536` (openai) | Embedding dimensions |

The installer sets these automatically based on your framework.

## Commands

### Add an episode
```bash
ei add "SUMMARY" --entities "Entity1" "Entity2" --tags "tag1" "tag2" --source "session:YYYY-MM-DD"
# Or full path:
# python3 <COGNITIVE_KIT_HOME>/scripts/episodic_index.py add ...
```

### Search episodes
```bash
ei search "QUERY" --top-k 5 --vector-weight 0.7 --graph-weight 0.3
```

### Statistics
```bash
ei stats
```

### Reset (destructive)
```bash
ei reset
```

## Workflow: End-of-Session Indexing

At the end of each non-trivial session, index it:

1. **Summarize**: Write 1-2 sentence summary of what was accomplished/learned
2. **Extract entities**: Names, tools, projects, concepts involved
3. **Tag**: Category tags (debug, skill-design, preference, project, etc.)
4. **Add**: Run the add command

## Workflow: Episode Retrieval

When the user references past work or you need cross-session context:

1. **Query**: Run search with the natural language query
2. **Interpret**: Check vector_score vs graph_score — high vector = semantic match, high graph = relational match
3. **Cross-reference**: If results reference entities, consider doing a second search centered on those entities for graph expansion

## Pitfalls

- **Embedding API latency**: Each add/search requires an API call (~2-4s). Batch adds if possible.
- **Graph scores are 0 with few episodes**: Graph signal needs ≥ 5-10 episodes sharing entities to produce non-zero scores.
- **Entity naming must be consistent**: "Hermes Agent" ≠ "hermes-agent" in the graph. Use canonical names.
- **No incremental embedding updates**: Changing a summary requires deleting and re-adding.
- **API key search**: The script searches `~/.hermes/.env`, `~/.openclaw/.env`, `~/.claude/.env`, `~/.agent-cognitive-kit/.env` in order, plus system env vars.
- **Wrapper script `ei`**: Installed by install.sh, auto-sets `COGNITIVE_KIT_HOME` and `COGNITIVE_KIT_EMBED_PROVIDER`. Always use `ei` instead of the full python path.
- **GLM embedding-3 on z.ai**: Use this when OpenAI quota is exhausted. API: `https://api.z.ai/api/paas/v4/embeddings`, key: `GLM_API_KEY`.
