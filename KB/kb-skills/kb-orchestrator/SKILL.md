---
name: kb-orchestrator
description: Orchestrate the modular KB workflow by routing requests to sub-skills: kb-fetch, kb-inbox-digest, kb-queue-to-keep, and kb-evidence-merge. Use when the user says "跑KB工作流/开始处理/把这套流程跑起来/模块化工作流/按规则来".
---

# KB Orchestrator（总控编排器）

目标：把 KB 工作流模块化成一组可替换的子技能，并用路由规则串起来。

## 子技能清单（当前版本）
- `kb-fetch`：统一抓取（web_fetch + browser 回退）
- `kb-inbox-digest`：链接→沉淀（Normalize/QA/Router + notes/queue + 摘要）
- `kb-queue-to-keep`：queue→keep（补全研究/对比验证 Phase 1）
- `kb-evidence-merge`：把白羊武士实测证据写回 notes（Phase 2）

## 路由规则（触发词 → 子技能）

### A) 收到链接（或用户说"处理一下这个链接"）
→ 调用 `kb-inbox-digest`

### B) 用户说"把 queue 推到 keep / 做对比验证 / 补全这条"
→ 调用 `kb-queue-to-keep`

### C) 用户说"我实测了/我把截图发你/把证据写回KB/更新结论"
→ 调用 `kb-evidence-merge`

### D) 抓取失败排查（微信/X 抓不到）
→ 优先调用 `kb-fetch`，并把抓取结果（错误原因/是否需登录）反馈给用户，再决定是否入 queue。

## 完整工作流（详细步骤）

### Step 1: 接收输入
```
IF 用户发了链接:
  → 提取 URL，记录到 KB/inputs/inbox-links.md
ELIF 用户发了文本/文件:
  → 直接进入 Normalize
ELIF 用户说"跑工作流":
  → 检查 KB/inputs/inbox-links.md 待处理列表
```

### Step 2: 抓取（kb-fetch）
```
→ 调用 kb-fetch
IF 抓取成功:
  → 提取 text, title, author, published_at
ELSE:
  → 记录失败原因
  → 询问用户是否继续或手动提供内容
```

### Step 3: 结构化（kb-normalize）
```
→ 调用 kb-normalize
→ 输出 YAML：source, summary_one_line, claim, why_it_matters, evidence, actions, risks, tags
```

### Step 4: 质量打分（kb-qa-score）
```
→ 调用 kb-qa-score
→ 输出：total score, verdict (keep/queue/discard/needs_context)
IF verdict=keep:
  → 进入 Step 5a
ELIF verdict=queue:
  → 进入 Step 5b
ELIF verdict=discard:
  → 记录到日志，结束
ELIF verdict=needs_context:
  → 询问用户补充信息
```

### Step 5a: 写入 Notes（keep）
```
→ 生成文件名：YYYY-MM-DD-<主题>-note.md
→ 写入 KB/notes/
→ 更新 KB/index.md（追加到分类下）
→ 更新 KB/recent.md（追加到顶部，保留10条）
→ 追加到 KB/inputs/processed-links.md（防重复）
→ 追加到 KB/log.md
```

### Step 5b: 写入 Queue（queue）
```
→ 生成文件名：YYYY-MM-DD-<主题>-queue.md
→ 写入 KB/queue/
→ 记录需要补充的 issues + questions_for_boss
```

### Step 6: 结果汇报
```
→ 汇总：处理了N条，keep M条，queue X条，discard Y条
→ 列出需要用户确认的修复项（如有）
```

## 编排原则
- **小事用子技能**：不要把所有逻辑堆在一个技能里。
- **总控只管路由**：不在这里重复子技能的细节。
- **省钱铁律继承**：工具对比实测由白羊武士执行，代理只做结构化对比与证据写回。
- **人在回路**：每个关键节点后暂停，确认用户再继续下一步
