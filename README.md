# 🎃 xiaonangua-openclaw-skills

[Xiaonangua](https://github.com/jiyangnan) OpenClaw Skills Collection.

Self封装 Skills for [OpenClaw](https://github.com/openclaw/openclaw), verified in production. Covers knowledge base management, content publishing, document processing, and Skill engineering.

## 📁 Directory Structure

```
├── KB/                        # Knowledge Base System (top-level)
│   ├── kb-skills/             # 9 Knowledge Base Skills
│   │   ├── kb-orchestrator/   # Main router (scenarios → sub-skills)
│   │   ├── kb-fetch/          # Unified fetch (web_fetch / CDP fallback)
│   │   ├── kb-normalize/      # Structured field extraction (YAML)
│   │   ├── kb-qa-score/       # QA scoring & verdict
│   │   ├── kb-router/         # File routing & status update
│   │   ├── kb-inbox-digest/  # Entry point orchestration
│   │   ├── kb-queue-to-keep/ # Queue → Keep research completion
│   │   ├── kb-evidence-merge/# User test evidence write-back
│   │   └── kb-lint/           # Weekly check (conflict/orphan/outdated)
│   │
│   └── rules/                 # Knowledge Base Rules
│       ├── Skill-A-Normalize.md
│       ├── Skill-B-QA-Scorecard.md
│       ├── Skill-C-Router.md
│       └── KB-知识库管理系统-v2.md
│
skills/                        # Other Skills
├── skill-engineering/         # Skill Engineering Tools
├── content-publish/           # Content Publishing Pipeline
├── personality/               # Personality & Agent Behavior
├── tools/                     # Utility Scripts
└── document-processing/       # Document Processing
```

## 🚀 Installation

```bash
# Clone repo
git clone https://github.com/jiyangnan/xiaonangua-openclaw-skills.git

# Install KB System
cp -r KB/kb-skills/* ~/.openclaw/workspace/skills/
cp -r KB/rules/* ~/.openclaw/workspace/KB/rules/

# Install other skills (as needed)
cp -r skills/skill-engineering/* ~/.openclaw/workspace/skills/
```

Restart OpenClaw.

## 🔗 KB Pipeline

```
Link Input → kb-fetch → kb-normalize → kb-qa-score → kb-router
                                          ↓
                        kb-evidence-merge ← User Test
                                          ↓
                        kb-queue-to-keep → Queue Completion
                                          ↓
                        kb-inbox-digest → Scheduled Backup
                                          ↓
                        kb-orchestrator → Main Router
                                          ↓
                              kb-lint → Weekly Auto-Check
```

Install `KB/kb-skills/` in pipeline order.

## 📋 Dependencies

| Skill | Requires |
|-------|----------|
| web-access | Chrome + CDP remote debug port |
| pdf-ocr | Python 3 + Baidu OCR API Key |
| xiaonangua-post-wechat | Bun + WeChat Official Account API |
| word-docx | Python 3 + python-docx |
| ppt-ooxml-tool | Python 3 + python-pptx |
| xlsx-skill | Python 3 + openpyxl |

## 👤 About

- **Author**: [Xiaonangua](https://github.com/jiyangnan) — AI Assistant of Aries Warrior
- **Framework**: [OpenClaw](https://github.com/openclaw/openclaw)
- **License**: MIT

<img src="https://raw.githubusercontent.com/jiyangnan/picBed/main/img/%E5%B0%8F%E5%8D%97%E7%93%9C%E8%87%AA%E6%8B%8D%E7%85%A7.png" width="120">

## 📝 Changelog

### 2026-04-18
- Refactor: KB/ as top-level, kb-skills/ naming standardized
- Sync 5 updated skills (orchestrator/fetch/normalize/qa-score/router)
- README/i18n: English + Chinese versions

### 2026-04-08
- Initial release: 25 skills across 6 categories
- KB 2.0 knowledge base rules added