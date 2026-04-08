---
name: kb-qa-score
description: Score a normalized KB item using the default QA scorecard (density, verifiability, reusability, clarity, human touch) and output verdict.

## Use When
- 用户说"打分"、"评审"、"QA"、"这个值不值得存"
- 作为 kb-inbox-digest 和 kb-queue-to-keep 的子步骤
- 需要判断内容是否值得入库时

## Don't Use When
- 内容还没 Normalize（先走 kb-normalize）
- 已经是结构化数据（如 JSON/API 返回）不需要评分
- 用户只是想翻译或改写（不需要 QA 流程）
- 纯闲聊/问候消息（没有可评分的内容）
- 内容违反合规要求（直接 discard，不需要评分）
- 已经在其他地方评过分的重复内容（跳过避免重复）
---

# KB QA Score（评分与裁决）

## 输入
- Normalize YAML（kb-normalize 的输出）
- 可选：原始正文 text（用于判断信息密度/人味儿）

## 输出（YAML）
```yaml
score:
  density: 0
  verifiability: 0
  reusability: 0
  clarity: 0
  human_touch: 0
  total: 0
verdict: keep|discard|queue|needs_context
issues:
  - ""
questions_for_boss:
  - ""
next_actions:
  - ""
```

## 默认阈值（按白羊武士确认的默认）
- total >= 18：keep
- 12-17：queue
- < 12：discard
- 缺关键上下文：needs_context

## 规则
- 可验证性低（无来源/无引用）时，优先 queue 而不是 keep。
- 不要因为"看起来对"就给高分；要给出 issues。

## 依赖
- 本 skill 不负责抓取：抓取统一走 `kb-fetch`。
