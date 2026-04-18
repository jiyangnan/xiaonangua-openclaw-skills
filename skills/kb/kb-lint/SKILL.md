# kb-lint - KB 知识库健康检查

> 每周检查 KB 系统健康状态，发现问题并生成报告。

## 功能

5 项检查（v1）：

| # | 检查项 | 说明 |
|---|--------|------|
| 1 | 孤立页面 | 有页面但 index.md 未收录 |
| 2 | 缺失页面 | 某概念出现 ≥3 次但无独立页面 |
| 3 | 过时内容 | 笔记超过 90 天未更新 |
| 4 | 反写候选 | 最近 14 天对话产生的新洞察 |
| 5 | 规则健康度 | 规则文档超过 30 天未更新 |

## 使用方法

```bash
cd skills/kb-lint/scripts
python3 kb_lint.py [--kb-path ~/.openclaw/workspace/KB] [--save]
```

### 参数

- `--kb-path`: KB 目录路径（默认 `~/.openclaw/workspace/KB`）
- `--save`: 保存报告到 `KB/log.md`

## 触发条件

- 用户说「检查 KB 健康」「运行 Lint」「周检」
- 每周 cron 自动执行（可选）

## 输出示例

```markdown
# KB Lint 报告

生成时间：2026-04-14 15:20
KB 路径：/Users/ferdinandji/.openclaw/workspace/KB

---

## 汇总

- ✅ 通过：3 项
- ⚠️ 警告：2 项
- ❌ 错误：0 项

## ✅ 孤立页面
所有笔记都已收录

## ⚠️ 规则健康度
发现 4 个过期规则

1. **Skill-A-Normalize.md**
   - 问题：规则超过 51 天未更新
   - 建议：检查规则是否仍适用，更新 last_updated 字段
...
```

## 与 KB 2.0 的关系

本 skill 实现了 KB-知识库管理系统-v2.md 中定义的 **Lint（健康检查）** 环节，替代之前人工检查的方式。

## TODO

- [ ] 矛盾检测（v2）- 需要更可靠的算法
- [ ] 自动修复建议 - 根据问题生成修复脚本
- [ ] Telegram/Discord 推送 - 每周自动发送报告