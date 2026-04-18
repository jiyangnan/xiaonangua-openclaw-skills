---
name: kb-router
description: Route KB items to Obsidian Vault notes/queue based on QA verdict, write files using canonical templates.

## Use When
- 用户说"入库"、"路由"、"写入 notes"、"写入 queue"、"更新 processed"、"更新状态"
- 需要把通过 QA 的内容写入 Obsidian 时
- 需要更新 KB 状态防重复时

## Don't Use When
- 还没走 Normalize + QA 流程（必须先打分）
- verdict=discard 的内容（不应入库）
- 文件名已存在需要覆盖（先确认用户）
- 目标路径没有写入权限（检查路径或换路径）
- 批量入库但没有逐个确认 QA 结果（需要每条都有 verdict）
- 用户只想预览不想写入（用 read 工具先看）
---

# KB Router（落盘/状态更新）

把 Normalize+QA 的结果写入 Obsidian Vault，并更新防重复状态。

## 输入
- `normalize`（kb-normalize 输出 YAML）
- `qa`（kb-qa-score 输出 YAML）
- `title`（可由抓取/正文推断；需要用于文件命名）
- `text`（可选：写入 notes 的正文摘录/关键段落）

## 固定路径
- Notes：`/Users/ferdinandji/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Vault/KB/notes/`
- Queue：`/Users/ferdinandji/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Vault/KB/queue/`
- Processed list：`/Users/ferdinandji/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Vault/KB/inputs/processed-links.md`
- State：`/Users/ferdinandji/.openclaw/workspace/KB/state/digest.json`

## 路由规则（硬规则）
- verdict=keep → 写入 notes
- verdict=queue/needs_context → 写入 queue
- verdict=discard → 不入库（只在摘要里说明原因即可）

## 人在回路（每个关键节点暂停确认）

### Step 1: 入库前确认
```
→ 展示：文件名、目标路径、verdict
→ 询问用户："确认写入？Y/N"
IF 用户确认:
  → 继续写入
ELSE:
  → 跳过本次，询问修改后重新处理
```

### Step 2: 写入后确认
```
→ 写入成功后，展示：
  - 文件路径
  - 字数/行数
  - 摘要
→ 询问："需要查看内容/修改/重新写？"
```

### Step 3: 异常处理
```
IF 写入失败（权限/磁盘满/路径不存在）:
  → 记录错误详情
  → 询问用户："手动创建/换路径/跳过？"
  → 根据用户选择处理
```

## 文件命名
- notes：`YYYY-MM-DD-<简短主题>-note.md`
- queue：`YYYY-MM-DD-<简短主题>-queue.md`

## 写入内容要求
- notes 必须包含：来源 URL、summary_one_line、claim、why_it_matters、evidence、actions。
- queue 必须包含：卡点（issues）+ 需要 boss 做什么（questions_for_boss）。

## 状态更新
- processed-links.md：追加一行（日期|标题|verdict|url）
- digest.json：追加 processed 记录（url, processed_at, verdict, title, reason 可选）

## 依赖
- 抓取统一走 `kb-fetch`；结构化与打分分别走 `kb-normalize` 与 `kb-qa-score`。
