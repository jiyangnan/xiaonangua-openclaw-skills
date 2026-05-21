---
name: kb-normalize
description: Normalize any fetched content into the KB canonical YAML fields (source, one-line summary, claim, why-it-matters, evidence, actions, risks, tags).

## Use When
- 用户说"结构化"、"Normalize"、"把这篇转成卡片"、"按字段整理"
- 需要把文章/推文/链接转成 KB 笔记时
- 作为 kb-inbox-digest 和 kb-queue-to-keep 的子步骤

## Don't Use When
- 原文太短没有实质内容（<200字），无法提取 claim
- 内容是纯图片/纯视频没有文字（无法结构化）
- 内容是代码片段/配置文件（用代码格式化工具）
- 用户只是要翻译而不是结构化（用翻译工具）
- 已经结构化过的内容再次处理（避免重复劳动）
- 内容来源不可信且无法验证（先走 kb-qa-score 再决定是否处理）
---

# KB Normalize（结构化字段）

统一输出格式，给下游 QA/Router 使用。

## 输入
- `source.url`
- `source.type`（tweet/article/chat/doc/web）
- `source.author`（可空）
- `source.published_at`（可空）
- `text`（抓取到的正文）
- `user_note`（可选：用户发链接时的备注/意图）

## 输出（YAML，必须包含这些字段）
```yaml
source:
  url: ""
  type: tweet|article|chat|doc|web
  author: ""
  published_at: ""
summary_one_line: ""
claim: ""
why_it_matters: ""
evidence:
  - quote: ""
    url: ""
    note: ""
actions:
  - ""
risks_unknowns:
  - ""
reuse_tags:
  - ""
```

## 字段规则（严格化）

| 字段 | 规则 |
|------|------|
| **summary_one_line** | ≤50字，一句话说清楚这篇文章/推文讲什么 |
| **claim** | 一句话事实性主张，不能是观点/感受 |
| **why_it_matters** | 为什么值得存（与我有啥关系/能用在哪） |
| **evidence** | 至少 1 条；quote 必须来自原文原句（用引号）；标注来源 URL |
| **actions** | 用动词开头，且可执行；不要超过 3 条 |
| **risks_unknowns** | 可能的风险/不确定因素；不要编造 |
| **reuse_tags** | 场景标签，便于后续检索 |

### user_note 处理
- 如果 `user_note` 存在：写入 `why_it_matters` 或 `reuse_tags` 的上下文中（标注"用户意图: ..."）

## 依赖
- 本 skill 不负责抓取正文：抓取统一走 `kb-fetch`。
