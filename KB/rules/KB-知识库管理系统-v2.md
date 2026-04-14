# KB 知识库管理系统 v2.0

> 任何 Agent 读到此文件后，即可按照统一规范操作知识库。
> 灵感来源：Karpathy LLM Wiki 模式 + Atomic Knowledge 协议

---

## 目录结构

```
KB/
├── index.md          # 全局内容索引（查询入口）
├── active.md         # 当前活跃研究/待办
├── recent.md         # 最近更新（滚动保留 10 条）
├── log.md            # 操作日志（统一格式，支持 grep）
├── notes/            # 核心知识笔记（所有类型统一存放）
│   └── _TEMPLATE-note.md  # 笔记模板
├── queue/            # 候选缓冲（待补充/待审核）
├── inputs/           # 输入状态（inbox-links / processed-links）
├── reviews/          # 复盘/废弃记录
└── rules/            # 规则文档（Agent 操作手册）
    ├── Skill-A-Normalize.md      # 内容结构化规则
    ├── Skill-B-QA-Scorecard.md   # 质量打分规则
    ├── Skill-C-Router.md         # 路由 + Ingest 后置步骤
    ├── Skill-D-Crosslink.md      # 交叉更新规则
    └── agent-work-standards-v1.md # 通用工作规范
```

---

## 笔记类型（YAML frontmatter）

所有笔记使用统一的 YAML frontmatter，`type` 字段区分类型：

| type | 说明 | 示例 |
|------|------|------|
| `concept` | 技术概念、方法论、架构模式 | "RAG"、"Multi-Agent 架构" |
| `entity` | 具体产品/工具/人/公司 | "OpenClaw"、"Claude Code" |
| `tool-review` | 工具评测、使用心得 | "Codex 子代理指南" |
| `insight` | 洞察、经验、框架 | "爆款写作框架" |
| `project` | 项目研究、竞品分析 | "AI Agent 平台对比" |

**文件全部放在 `KB/notes/`，不拆子目录。** 用 frontmatter `type` 字段 + index.md 分类索引。

---

## 笔记模板

```yaml
---
type: concept
status: keep
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [标签1, 标签2]
related: []
source_url: ""
source_type: ""
author: ""
published_at: ""
---

# 标题

## 一句话结论

## 核心主张（Claim）

## 为什么重要（Why it matters）

## 证据 / 引用（Evidence）
- 引用：
  - 解释：
  - 来源：

## 可复用点（Reuse）

## 下一步动作（Actions）
-

## 风险/不确定性
-

## 相关笔记
-
```

---

## 核心工作流

### 1. Ingest（入库）

**触发条件**：用户说"存一下"、"这个很重要"、"帮我记录这个链接"、"走内容消化流程"，或直接发送链接要求处理

**完整流程**：

```
Step 1: 检查是否有 URL
  - 如果是对话中直接发链接 → 追加到 KB/inputs/inbox-links.md（确保不重复）
  - 如果是手动放 Inbox → 跳过此步

Step 2: kb-fetch — 抓取内容
  - 链接 → web_fetch 抓取（保证非空壳）
  - 文件 → 直接读取
  - 对话 → 提取关键信息

Step 3: kb-normalize — 结构化
  - 按 Skill-A-Normalize.md 规则提取字段
  - 输出标准 YAML frontmatter

Step 4: kb-qa-score — 质量打分
  - 按 Skill-B-QA-Scorecard.md 评分
  - verdict: keep(≥18) / queue(12-17) / discard(<12)

Step 5: kb-router — 路由落盘
  - keep → KB/notes/YYYY-MM-DD-主题-note.md
  - queue → KB/queue/YYYY-MM-DD-主题-queue.md
  - discard → KB/reviews/discard-log.md

Step 6: 更新 processed-links.md
  - 对话式 Ingest → 标记已处理，避免下次重复

Step 7: kb-crosslink — 交叉更新（新增）
  - 从新笔记提取关键实体/概念
  - 搜索 KB/notes/ 已有笔记
  - 命中 1-2 篇 → 双方追加"相关笔记"链接
  - 命中 ≥3 篇 → 考虑建汇总页（需用户确认）

Step 8: 更新索引和日志
  - 追加 KB/index.md 条目（对应分类下）
  - 追加 KB/recent.md 条目（顶部，保留 10 条）
  - 追加 KB/log.md 日志（统一格式）
  - 如涉及活跃研究 → 更新 KB/active.md
```

**对话式 Ingest 优化（2026-04-14）**：
- 用户直接发链接 + 说"走消化流程"时，自动追加到 inbox-links.md
- 处理完成后标记到 processed-links.md，防止重复处理

### 2. Query（查询）

**触发条件**：用户问问题

**流程**：

```
Step 1: 读 KB/index.md 定位相关页面
Step 2: 钻入具体笔记，读取内容
Step 3: 综合多篇笔记回答，标注来源
Step 4: 如果综合了 ≥3 篇笔记产生新洞察 → 列入反写候选（不自动写回）
```

### 3. Writeback（反写）

**触发条件**：用户说"存这个答案"、"这个记下来"

**规则**：
- 一次性问答 → 不存
- 综合分析/对比/新框架 → 存
- 不确定的 → 存 queue/ 候选缓冲

**流程**：
```
Step 1: 评估价值
Step 2: 使用笔记模板创建页面
Step 3: 更新 index.md + recent.md + log.md
Step 4: 执行 crosslink
```

### 4. Lint（健康检查）

**触发条件**：每周执行一次，或用户说"检查健康"

**6 项检查**：

| # | 检查项 | 说明 |
|---|--------|------|
| 1 | 矛盾检测 | 不同笔记对同一事实的描述冲突 |
| 2 | 孤立页面 | 有页面但无其他页面链接到它 |
| 3 | 缺失页面 | 某概念在 ≥3 篇笔记中出现但无独立页面 |
| 4 | 过时内容 | 新证据已推翻旧结论，旧页面未更新 |
| 5 | 反写候选 | 近期对话中产生了有价值的新洞察/分析 |
| 6 | 规则健康度 | 规则文档是否超过 30 天未更新 |

**执行流程**：
```
Step 1: 扫描 KB/notes/ 全量文件
Step 2: 逐项检查，输出 lint 报告
Step 3: 反写候选 + 规则更新建议 → 列清单发给用户审核
Step 4: 用户确认后才执行更新
Step 5: 写入 log.md
```

---

### 4.1 定时任务（推荐设置）

**推荐**：每天 20:00 自动执行 Lint 检查

#### 使用 kb-lint skill

```bash
# 手动执行
python3 skills/kb-lint/scripts/kb_lint.py --kb-path ~/.openclaw/workspace/KB --save

# 帮助
python3 skills/kb-lint/scripts/kb_lint.py --help
```

#### cron 设置（macOS/Linux）

```bash
# 添加定时任务
crontab -e

# 每天 20:00 执行
0 20 * * * cd ~/.openclaw/workspace/skills/kb-lint/scripts && python3 kb_lint.py --kb-path ~/.openclaw/workspace/KB --save >> ~/.openclaw/workspace/logs/kb-lint.log 2>&1
```

#### 报告输出

- 默认输出 markdown 格式到终端
- 加 `--save` 追加到 `KB/log.md`
- 可配合 Telegram/Discord webhook 自动推送

---

## 日志格式（log.md）

**统一格式，支持 grep 快速查询**：

```markdown
## [YYYY-MM-DD] ingest | 文章标题
- 来源：URL 或 "对话生成"
- 判定：keep → notes/文件名.md
- 交叉更新：链接到「相关笔记名」

## [YYYY-MM-DD] lint | 第N次周检
- 矛盾：N 处
- 孤立页面：N 处
- 过时：N 处
- 反写候选：N 条
- 规则更新建议：N 条
- 操作：已修复/待审核

## [YYYY-MM-DD] query-writeback | 标题
- 类型：concept/insight/tool-review
- 目标：notes/文件名.md

## [YYYY-MM-DD] schema-update | 说明
- 改动内容
```

**快速查询命令**：
```bash
# 最近 10 条操作
grep "^## \[" KB/log.md | tail -10

# 某天的操作
grep "2026-04-07" KB/log.md

# 只看 lint
grep "lint" KB/log.md

# 只看 ingest
grep "ingest" KB/log.md
```

---

## 索引格式（index.md）

按主题分类，每篇一行：

```markdown
# KB 索引

## OpenClaw 生态
| 笔记 | 日期 | 标签 |
|------|------|------|
| [标题](notes/文件名.md) | 2026-02-23 | openclaw, context |

## AI Agent 架构
| 笔记 | 日期 | 标签 |
|------|------|------|
| [标题](notes/文件名.md) | 2026-03-23 | agent, architecture |

## 工具评测
...

## 内容创作/运营
...

## Queue（待补充）
...
```

**维护规则**：
- 每次 Ingest/Writeback 后自动追加新条目
- 每次 Lint 时重新排序、合并分类
- 分类不固定，随内容增长自然演化

---

## 自主权边界

### Agent 可以自主执行

| 操作 | 条件 |
|------|------|
| 读 KB 任何文件 | 任何时候 |
| Ingest 入库 | 用户明确说"存"时 |
| Writeback 反写 | 用户明确说"存这个答案"时 |
| Lint 检查 | 用户说"检查"或每周定时 |
| Crosslink 交叉链接 | Ingest 时自动（关键词完全匹配） |

### Agent 必须先询问用户

| 操作 | 原因 |
|------|------|
| 删除任何 KB 文件 | 不可逆 |
| 归档页面 | 不可逆 |
| 批量修改笔记 | 影响范围大 |
| 创建实体汇总页 | 可能不需要 |
| 修改 rules/ 规则文件 | 影响所有 Agent |

---

## 多 Agent 协作规范

本系统设计为多 Agent 共享操作的知识库：

1. **任何 Agent 操作前**，先读 `KB/rules/` 下对应规则文件
2. **任何写入操作后**，必须更新 `index.md`、`recent.md`、`log.md`
3. **Crosslink 确保知识网络**：新笔记必须链接到已有相关笔记
4. **Lint 保持健康**：定期检查，发现问题列清单给用户审核
5. **规则文件是单一真相来源**：不确定怎么做时，查 rules/

---

## 文件命名约定

| 类型 | 格式 | 示例 |
|------|------|------|
| 笔记 | `YYYY-MM-DD-主题-note.md` | `2026-04-07-LLM-Wiki-note.md` |
| 候选 | `YYYY-MM-DD-主题-queue.md` | `2026-04-07-twitter-insights-queue.md` |
| 规则 | `Skill-X-名称.md` | `Skill-D-Crosslink.md` |
| 索引/日志 | 固定名 | `index.md`、`log.md` |

---

*最后更新：2026-04-14 | 版本：2.2*
