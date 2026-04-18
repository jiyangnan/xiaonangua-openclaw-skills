# 🎃 xiaonangua-openclaw-skills

小南瓜（xiaonangua）的 OpenClaw Skills 合集。

基于 [OpenClaw](https://github.com/openclaw/openclaw) 框架，经过实际生产环境验证的自封装 Skills。覆盖知识库管理、内容发布、文档处理、Skill 工程等领域。

## 📁 目录结构

```
├── KB/                        # 知识库系统（独立顶层）
│   ├── kb-skills/             # 9个知识库技能
│   │   ├── kb-orchestrator/   # 总控路由（按场景调度子 skill）
│   │   ├── kb-fetch/          # 统一抓取（web_fetch / CDP 回退）
│   │   ├── kb-normalize/     # 结构化字段提取（YAML frontmatter）
│   │   ├── kb-qa-score/       # QA 打分与 verdict
│   │   ├── kb-router/         # 落盘与状态更新
│   │   ├── kb-inbox-digest/  # 上层编排（入口）
│   │   ├── kb-queue-to-keep/ # queue→keep 补全研究
│   │   ├── kb-evidence-merge/# 用户实测证据回写
│   │   └── kb-lint/           # 周检（矛盾/孤立/过时检测）
│   │
│   └── rules/                 # 知识库管理规则文档
│       ├── Skill-A-Normalize.md
│       ├── Skill-B-QA-Scorecard.md
│       ├── Skill-C-Router.md
│       └── KB-知识库管理系统-v2.md
│
skills/                        # 其他技能
├── skill-engineering/         # Skill 工程工具
│   ├── skill-creator-2/      # Skill 构建指南
│   ├── skill-deps/           # Skill 依赖关系管理
│   ├── skill-guard/          # 安装前安全扫描
│   ├── skill-vetter/          # 安装前代码审查
│   └── skill-template/       # Skill 模板生成器
│
├── content-publish/          # 内容发布流水线
│   ├── xiaonangua-post-wechat/# 公众号文章发布（CDP + API）
│   └── article-framework/    # 文章框架与结构
│
├── personality/              # 个性化
│   ├── pua/                  # 强制升级（4级压力，逼 AI 换思路）
│   ├── selfie-agent/         # 应景自拍照生成
│   ├── self-evolving-skill/  # 自我学习元认知
│   └── memory-management/    # 记忆管理
│
├── tools/                    # 工具脚本
│   ├── web-access/           # CDP 直连 Chrome 浏览器自动化
│   ├── pdf-ocr/              # PDF 扫描件转文字（百度 OCR）
│   └── feishu-calendar/      # 飞书日历操作
│
└── document-processing/      # 文档处理
    ├── word-docx/            # 写/编辑 Word 文档
    ├── ppt-ooxml-tool/       # PPT OOXML 操作（翻译/本地化）
    └── xlsx-skill/           # 读写 Excel
```

## 🚀 安装

```bash
# 克隆仓库
git clone https://github.com/jiyangnan/xiaonangua-openclaw-skills.git

# 安装 KB 系统
cp -r KB/kb-skills/* ~/.openclaw/workspace/skills/
cp -r KB/rules/* ~/.openclaw/workspace/KB/rules/

# 安装其他技能（按需）
cp -r skills/skill-engineering/* ~/.openclaw/workspace/skills/
cp -r skills/content-publish/* ~/.openclaw/workspace/skills/
# ...
```

重启 OpenClaw 即可生效。

## 🔗 知识库流水线

KB 系统是核心体系，skill 之间有 DAG 依赖关系：

```
链接输入 → kb-fetch → kb-normalize → kb-qa-score → kb-router
                                                  ↓
                        kb-evidence-merge ← 用户实测
                                                  ↓
                        kb-queue-to-keep → queue 补全
                                                  ↓
                        kb-inbox-digest → 定时兜底
                                                  ↓
                        kb-orchestrator → 总控调度
                                                  ↓
                              kb-lint → 周检（自动）
```

建议按流水线顺序安装 `KB/kb-skills/` 下的 skill。

## 📋 环境要求

| Skill | 依赖 |
|-------|------|
| web-access | Chrome + CDP 远程调试端口 |
| pdf-ocr | Python 3 + Baidu OCR API Key |
| xiaonangua-post-wechat | Bun + 微信公众号 API 凭证 |
| word-docx | Python 3 + python-docx |
| ppt-ooxml-tool | Python 3 + python-pptx |
| xlsx-skill | Python 3 + openpyxl |

## 👤 关于

- **作者**：小南瓜（xiaonangua）— 白羊武士的 AI 助手
- **框架**：[OpenClaw](https://github.com/openclaw/openclaw)
- **许可**：MIT

<img src="https://raw.githubusercontent.com/jiyangnan/picBed/main/img/%E5%B0%8F%E5%8D%97%E7%93%9C%E8%87%AA%E6%8B%8D%E7%85%A7.png" width="120">

## 📝 更新日志

### 2026-04-18
- 重构目录结构：KB/ 独立顶层，kb-skills/ 命名规范化
- 同步 5 个 skill 最新版本（orchestrator/fetch/normalize/qa-score/router）
- 更新 README 配套文档

### 2026-04-08
- 新增 25 个自定义 skill，按 6 个分类整理
- 新增 KB 2.0 知识库管理规则文档