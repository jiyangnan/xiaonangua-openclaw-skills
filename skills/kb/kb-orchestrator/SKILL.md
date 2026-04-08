---
name: kb-orchestrator
description: Orchestrate the modular KB workflow by routing requests to sub-skills: kb-fetch, kb-inbox-digest, kb-queue-to-keep, and kb-evidence-merge. Use when the user says “跑KB工作流/开始处理/把这套流程跑起来/模块化工作流/按规则来”.
---

# KB Orchestrator（总控编排器）

目标：把 KB 工作流模块化成一组可替换的子技能，并用路由规则串起来。

## 子技能清单（当前版本）
- `kb-fetch`：统一抓取（web_fetch + browser 回退）
- `kb-inbox-digest`：链接→沉淀（Normalize/QA/Router + notes/queue + 摘要）
- `kb-queue-to-keep`：queue→keep（补全研究/对比验证 Phase 1）
- `kb-evidence-merge`：把白羊武士实测证据写回 notes（Phase 2）

## 路由规则（触发词 → 子技能）

### A) 收到链接（或用户说“处理一下这个链接”）
→ 调用 `kb-inbox-digest`

### B) 用户说“把 queue 推到 keep / 做对比验证 / 补全这条”
→ 调用 `kb-queue-to-keep`

### C) 用户说“我实测了/我把截图发你/把证据写回KB/更新结论”
→ 调用 `kb-evidence-merge`

### D) 抓取失败排查（微信/X 抓不到）
→ 优先调用 `kb-fetch`，并把抓取结果（错误原因/是否需登录）反馈给用户，再决定是否入 queue。

## 编排原则
- **小事用子技能**：不要把所有逻辑堆在一个技能里。
- **总控只管路由**：不在这里重复子技能的细节。
- **省钱铁律继承**：工具对比实测由白羊武士执行，代理只做结构化对比与证据写回。
