---
name: kb-inbox-digest
description: Convert shared links into KB workflow: fetch -> normalize -> QA -> route to Obsidian -> deliver digest summary.

## Use When
- 用户说"跑 KB 闭环"、"处理链接"、"我又塞了链接"
- 需要把链接批量入库时
- 构建/调试 KB/Skills/Cron 管道时
- 需要检查为什么链接没被摄入时
- 需要手动触发每日 Digest 时

## Don't Use When
- 只有单个链接不需要批量处理（直接用 kb-fetch + kb-normalize + kb-qa-score 即可）
- 用户只想预览不想入库（分别调用子 skill 不要跑完整流程）
- 链接是文件下载而非网页（无法抓取内容）
- 链接是内部系统无法访问（会失败）
- 大量链接需要去重预处理（先手动清理）
- 用户只想检查哪些链接已处理（查 processed-links.md 即可）
- 只需要抓取不需要入库（只用 kb-fetch）
- 只需要结构化不需要评分（只用 kb-normalize）
- 只需要评分不需要入库（只用 kb-qa-score）
- 系统资源紧张无法处理大批量（分批处理）


# KB Inbox Digest（链接→知识沉淀）

把「我看到一篇好文章 → 直接把链接发给你」变成稳定的自动化：

**输入（Links）→ 抓取（Fetch）→ 结构化（Normalize）→ 评审（QA）→ 路由（Router）→ 沉淀（Obsidian KB）→ 返回摘要（由系统投递到 Telegram 私聊）**

## 固定路径（V0）

### 沉淀区（最终输出，Obsidian Vault）
- Vault 根：`/Users/ferdinandji/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Vault/`
- KB：`Obsidian Vault/KB/`
  - `KB/inputs/inbox-links.md`：收链接（每行一个 URL，可在后面加备注）
  - `KB/inputs/processed-links.md`：已处理列表（防重复）
  - `KB/notes/`：verdict=keep 才能进
  - `KB/queue/`：verdict=queue/needs_context 进

### 执行区（小南瓜系统内，工作台）
- 规则库（执行用双份）：`/Users/ferdinandji/.openclaw/workspace/KB/rules/`
- 状态文件：`/Users/ferdinandji/.openclaw/workspace/KB/state/digest.json`

## 核心规则（不要走样）

1) **Obsidian KB 只沉淀最终输出**
- keep → notes
- queue/needs_context → queue
- discard → 不入库

2) **模块化调用（铁律）**
- 抓取统一走 `kb-fetch`
- 结构化统一走 `kb-normalize`
- 评分裁决统一走 `kb-qa-score`
- 落盘/状态更新统一走 `kb-router`

3) **默认 B（补全研究）**
- 用户只丢链接也能跑完整流程
- 如果用户随手加了备注（A：意图/想法），把备注写进最终笔记 frontmatter 或「可复用点」中

4) **输出摘要不要写"已发送到群/已发送到私聊"**
- 执行器只输出摘要文本；投递由系统处理

## 触发方式（事件驱动）

支持两种触发：

1) **用户直接发链接**（默认）
- 从 Telegram / 飞书 / Discord 任意渠道收到 URL → 立即按本流程处理。
- 用户可选在同一条消息里追加一句备注（A：意图/想法），形如：
  - `<URL> // 一句话想法`

2) **用户发口令**
- 口令示例：`处理一下这个链接`
- 若口令消息里未包含 URL：优先使用"上一条包含 URL 的消息"；仍没有则向用户索要。

## 执行步骤（处理一批链接）

当被触发时：

1. 从当前消息中抽取 URL（允许一条消息多链接）；若没有则回退到 `KB/inputs/inbox-links.md` 作为兜底输入源。
2. `read` digest.json，过滤已处理
3. 选取新 URL（**每轮最多 10 条**；剩余留到下一轮由用户确认继续）
4. 对每条：
   - 抓取：用 `kb-fetch`
   - Normalize：用 `kb-normalize`
   - QA：用 `kb-qa-score`
   - Router：用 `kb-router`（写入 notes/queue + 更新 processed-links 与 digest.json）
5. 输出 1 条简短摘要：
   - 本轮处理 N 条；keep/queue/discard 数量
   - keep：标题 + 一句话结论 + notes 路径
   - queue：卡点 + 需要 boss 做什么

## 自动化（Cron 推荐配置）

- **每日模式（9:00）**：兜底汇总（防漏/防失败），不要做高频轮询。

> 备注：具体 cron 任务由主代理用 `cron` 工具维护（避免在技能里硬编码 jobId）。

## 常见故障排查

- **微信抓不到正文**：用 browser 回退；如果出现登录/验证码，提示 boss 在 openclaw profile 登录一次。
- **重复提醒/刷屏**：检查是否启用了高频轮询类任务（应禁用）；摘要中禁止"已发送到群"之类误导语。
- **路径混用**：确认只有 keep/queue 才写入 Obsidian Vault；其他中间产物留在 workspace。
