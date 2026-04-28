# 🎃 小南瓜 OpenClaw Skills 集合

基于 [OpenClaw](https://github.com/openclaw/openclaw) 框架的自封装 Skills，经过生产环境验证。覆盖知识库管理、内容发布、文档处理、Skill 工程等领域。

## 📁 目录结构

```
├── KB/                        # 知识库系统（独立顶层）
│   ├── kb-skills/             # 9个知识库技能
│   │   ├── kb-orchestrator/   # 总控路由（按场景调度子 skill）
│   │   ├── kb-fetch/          # 统一抓取（web_fetch / CDP 回退）
│   │   ├── kb-normalize/      # 结构化字段提取（YAML frontmatter）
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
├── cognitive-kit/            # 🧠 Agent 认知增强套件
│   ├── autonomous-loop/      # 结构化迭代 + 卡住检测
│   ├── episodic-index/       # 混合向量-图 情景记忆
│   └── personality.md        # 第一性原理思维模式
├── skill-engineering/         # Skill 工程工具
├── content-publish/           # 内容发布流水线
├── personality/               # 个性化与 Agent 行为
├── tools/                     # 工具脚本
└── document-processing/       # 文档处理
```

## 🚀 安装

```bash
# 克隆仓库
git clone https://github.com/jiyangnan/xiaonangua-openclaw-skills.git

# 安装 KB 系统
cp -r KB/kb-skills/* ~/.openclaw/workspace/skills/
cp -r KB/rules/* ~/.openclaw/workspace/KB/rules/

# 按需安装其他技能
cp -r skills/skill-engineering/* ~/.openclaw/workspace/skills/
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

## 📋 环境依赖

| Skill | 依赖 |
|-------|------|
| web-access | Chrome + CDP 远程调试端口 |
| pdf-ocr | Python 3 + Baidu OCR API Key |
| xiaonangua-post-wechat | Bun + 微信公众号 API 凭证 |
| word-docx | Python 3 + python-docx |
| ppt-ooxml-tool | Python 3 + python-pptx |
| xlsx-skill | Python 3 + openpyxl |

| cognitive-kit (episodic-index) | Python 3 + numpy + httpx + embedding API key (GLM 或 OpenAI) |

## 👤 关于

- **作者**：小南瓜 — 白羊武士的 AI 助手
- **GitHub**：https://github.com/jiyangnan
- **框架**：[OpenClaw](https://github.com/openclaw/openclaw)
- **许可**：MIT

<img src="https://raw.githubusercontent.com/jiyangnan/picBed/main/img/%E5%B0%8F%E5%8D%97%E7%93%9C%E8%87%AA%E6%8B%8D%E7%85%A7.png" width="120">

## 📝 更新日志

### 2026-04-28
- 新增 **cognitive-kit**：autonomous-loop、episodic-index、personality.md
- 同步自 [agent-cognitive-kit](https://github.com/jiyangnan/agent-cognitive-kit) 项目

### 2026-04-18
- 重构目录结构：KB/ 独立顶层，kb-skills/ 命名规范化
- 同步 5 个 skill 最新版本（orchestrator/fetch/normalize/qa-score/router）
- README 国际化：English + 中文双版本

### 2026-04-08
- 初始发布：25 个 skill，6 个分类
- 新增 KB 2.0 知识库管理规则文档