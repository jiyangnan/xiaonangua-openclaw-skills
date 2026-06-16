---
name: kb-queue-to-keep
description: Turn KB queue items into keep-worthy notes by running structured gap-filling research: infer what is missing (intent, comparison, scenarios, verification), fetch additional sources, optionally verify via local browser for login-walled pages, and produce an upgraded Obsidian Vault note with clear decision and next actions. Use when the user says “把 queue 的补全做起来 / queue 推到 keep / 补全这篇 / 做对比调研 / 给结论 / upgrade this queue item”.
---

# KB Queue → Keep（补全研究子流程）

目标：把 `Obsidian Vault/KB/queue/` 里“半成品”变成 `KB/notes/` 里“可复用结论”。

## 输入
- 一个 queue 条目文件（路径或标题）
- 或者：一篇链接被判定 queue，需要补全研究

## 输出（必须做到）
- 写入一篇 notes（keep）：`KB/notes/YYYY-MM-DD-<主题>-note.md`
- 同时在原 queue 文件中把 `status` 标为 done，并写上 notes 链接（可追加 `related_notes`）
- 给白羊武士一个**简短结论**：推荐/不推荐/观望 + 理由 + 下一步

> 若属于“工具对比且需要实测”的场景：
> - Phase 1 只产出“结构化对比 + 最小验证清单 + 需要白羊武士实测的 2-3 项指标”，notes 中必须标注 `recommendation: watch`（待证据）。
> - 等白羊武士回传实测证据后，再更新 notes（evidence/verification）并把 recommendation 改为 recommend/reject。

## 固定路径
- Queue：`/Users/ferdinandji/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Vault/KB/queue/`
- Notes：`/Users/ferdinandji/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Vault/KB/notes/`
- 规则库（执行用）：`/Users/ferdinandji/.openclaw/workspace/KB/rules/`

## 核心原则
1) **默认走 B（补全研究）**：不要强迫用户补事实，只在需要“决策意图/优先级”时问一句。
2) **可验证优先**：能用链接/截图/实际跑通来验证的，别靠想象。
3) **只补“对决策有用”的缺口**：别写长论文。
4) **工具对比省钱铁律（两段式）**：
   - Phase 1（默认）：只做“纸面/结构化对比”+ 最小验证清单；**禁止**为了对比去调用 Claude Code/Codex 等昂贵工具跑测试，避免烧 token。
   - Phase 2（需用户实测回传）：由白羊武士在本地真实操作对比并回传结果（可含截图/图片）。收到证据后，才把结论写入 notes 作为 evidence 并更新 recommendation。

## 补全类型（先分类再动手）
对每个 queue，先判断它缺的是哪种：

- **Type 1：缺意图（A）**：不知道为什么存
  - 处理：问用户一句话意图；若用户忙，先按“默认目标=三层架构/内容生产线”推断但要标注不确定。

- **Type 2：缺对比（Comparison）**：例如“它比 Claudesidian 好在哪？”
  - 处理：收集 2-3 个替代方案；输出对比表（优劣/适用场景/迁移成本/成本）。

- **Type 3：缺场景（Use cases）**：教程有了，但“什么时候用它”不清楚
  - 处理：产出 3 个具体场景（谁/什么任务/为什么非它不可）。

- **Type 4：缺验证（Verification）**：信息看起来对，但不确定能否跑通
  - 处理：最小验证：安装/运行/关键功能截图；记录坑。

> 可以混合：一个 queue 可能同时缺 2/3/4。

## 工具与抓取策略（统一走 kb-fetch）
- 不要在本技能里重复实现抓取细节。
- 任何需要抓取正文/元信息的步骤，优先调用 `kb-fetch` 的策略：先 web_fetch，失败再 browser 回退（微信抽 `#js_content`，X 动态内容必要时 browser）。

## 推荐的 notes 结构（写入 KB/notes）
必须包含：
- 一句话结论（recommend / not recommend / watch）
- 为什么重要（对我们的三层架构/内容生产线哪个环节有用）
- 对比结论（至少 1 个替代方案）
- 验证结果（如果做了）
- 下一步动作（可执行）

## 最小交互（只问 1 个问题）
如果需要问用户：
- 只问一个最关键的问题，例如：
  - “你存这篇主要是想解决：多 agent 切换？写作？还是代码交付？”

## 依赖（模块化调用）
- 抓取统一走 `kb-fetch`
- 结构化统一走 `kb-normalize`
- 评分裁决统一走 `kb-qa-score`
- 落盘/状态更新统一走 `kb-router`
