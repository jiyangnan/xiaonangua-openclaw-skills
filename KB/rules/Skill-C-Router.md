# Skill C：Router（任务路由）

目标：根据 Normalize + QA 输出，把内容路由到正确位置。

---

## 路由规则（V1）
- verdict=keep → 写入 `KB/notes/`（按日期+主题命名）
- verdict=queue → 写入 `KB/queue/`（并标注需要补充什么）
- verdict=discard → 可选写入 `KB/reviews/discard-log.md`
- verdict=needs_context → 写入 `KB/queue/needs-context.md` 并列出问题

## 文件命名建议
- notes：`YYYY-MM-DD-<主题>-note.md`
- queue：`YYYY-MM-DD-<主题>-queue.md`

---

## Lint 后置步骤

每次 Lint 检查后必须执行：

1. **更新 index.md**：如果有新增/删除的笔记，更新全局索引
2. **更新 recent.md**：追加最新笔记到最近更新列表（保留 10 条）
3. **写入 log.md**：记录 Lint 执行情况（日期、检查项、结果、修复动作）
