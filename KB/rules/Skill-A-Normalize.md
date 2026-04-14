# Skill A：Normalize（输入信息结构化）

目标：把任何输入（文章/推文/聊天/网页）转成统一字段，便于存 KB、检索、下游生成。

## 输入
- 原文（尽量保留原句）
- 来源 URL
- 时间（如有）

## 输出（必须包含）
```yaml
source:
  url: ""
  type: tweet|article|chat|doc|web|wechat|x
  author: ""
  published_at: ""
summary_one_line: ""
claim: ""               # 核心主张/结论
why_it_matters: ""       # 为什么重要（对谁重要）
evidence:
  - quote: ""            # 原文引用（尽量短）
    url: ""              # 引用来源
    note: ""             # 你对这条证据的解释
actions:
  - ""                   # 可执行动作（下一步）
risks_unknowns:
  - ""                   # 不确定性/风险
reuse_tags:
  - ""                   # 可复用标签（例如：三层架构/内容流水线/复盘闭环）
```

## 规则
- 没有 URL 的信息：标注为 `source.type=chat` 并写清楚上下文。
- evidence 至少 1 条（没有就写"缺证据"。）
- actions 必须是动词开头（如：整理/验证/实现/对标/写入）。
- **微信公众号文章**：type 用 `wechat`，提取 `published_at`（公众号发布时间）
- **X/Twitter 推文**：type 用 `x`，提取 `author`（推主名称）
