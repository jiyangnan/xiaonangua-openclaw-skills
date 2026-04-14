#!/usr/bin/env python3
"""
KB Lint - Knowledge Base Health Checker

5项检查：
1. 孤立页面 - index.md 未收录的笔记
2. 缺失页面 - 概念出现≥3次但无独立页面
3. 过时内容 - 90天未更新
4. 反写候选 - 最近14天对话的新洞察
5. 规则健康度 - 30天未更新的规则

Usage:
    python3 kb_lint.py [--kb-path ~/.openclaw/workspace/KB]
"""

import os
import re
import glob
import yaml
from datetime import datetime, timedelta
from pathlib import Path
from dataclasses import dataclass
from typing import List, Dict, Tuple


@dataclass
class LintResult:
    check_name: str
    status: str  # 'ok', 'warning', 'error'
    issues: List[Dict]
    message: str


class KBLint:
    def __init__(self, kb_path: str = None):
        self.kb_path = Path(kb_path) if kb_path else Path.home() / '.openclaw/workspace/KB'
        self.notes_path = self.kb_path / 'notes'
        self.rules_path = self.kb_path / 'rules'
        self.index_path = self.kb_path / 'index.md'
        self.log_path = self.kb_path / 'log.md'
        self.memory_path = Path.home() / '.openclaw/workspace/memory'
        
        self.results: List[LintResult] = []
        self.today = datetime.now()
    
    def run_all_checks(self) -> List[LintResult]:
        """运行所有检查"""
        self.results = [
            self.check_orphan_pages(),
            self.check_missing_pages(),
            self.check_outdated_content(),
            self.check_writeback_candidates(),
            self.check_rule_health(),
        ]
        return self.results
    
    def check_orphan_pages(self) -> LintResult:
        """检查1：孤立页面 - index.md 未收录的笔记"""
        issues = []
        
        # 获取所有笔记文件
        note_files = list(self.notes_path.glob('*.md')) if self.notes_path.exists() else []
        note_names = {f.stem for f in note_files}
        
        # 读取 index.md 内容
        indexed_pages = set()
        if self.index_path.exists():
            content = self.index_path.read_text(encoding='utf-8')
            # 简单匹配：查找笔记文件名
            for note in note_names:
                if note in content:
                    indexed_pages.add(note)
        
        # 找出未收录的
        orphan_pages = note_names - indexed_pages
        
        for page in orphan_pages:
            issues.append({
                'file': f'{page}.md',
                'issue': '未在 index.md 中收录',
                'suggestion': f'在 KB/index.md 中添加 {page} 的链接'
            })
        
        status = 'ok' if not issues else 'warning'
        message = f'发现 {len(issues)} 个孤立页面' if issues else '所有笔记都已收录'
        
        return LintResult('孤立页面', status, issues, message)
    
    def check_missing_pages(self) -> LintResult:
        """检查2：缺失页面 - 概念出现≥3次但无独立页面"""
        issues = []
        
        # 收集所有笔记的 reuse_tags
        tag_counts: Dict[str, int] = {}
        note_files = list(self.notes_path.glob('*.md')) if self.notes_path.exists() else []
        
        for note_file in note_files:
            try:
                content = note_file.read_text(encoding='utf-8')
                # 提取 YAML frontmatter
                if content.startswith('---'):
                    parts = content.split('---', 2)
                    if len(parts) >= 3:
                        frontmatter = yaml.safe_load(parts[1])
                        if frontmatter and 'reuse_tags' in frontmatter:
                            for tag in frontmatter['reuse_tags']:
                                tag_counts[tag] = tag_counts.get(tag, 0) + 1
            except Exception:
                continue
        
        # 找出出现≥3次的标签
        for tag, count in tag_counts.items():
            if count >= 3:
                # 检查是否有独立页面（文件名包含该标签）
                has_page = any(tag.replace(' ', '-').lower() in f.stem.lower() 
                              for f in note_files)
                if not has_page:
                    issues.append({
                        'concept': tag,
                        'count': count,
                        'issue': f'概念「{tag}」在 {count} 篇笔记中出现，但无独立页面',
                        'suggestion': f'考虑创建 KB/notes/{tag.replace(" ", "-")}.md'
                    })
        
        status = 'ok' if not issues else 'warning'
        message = f'发现 {len(issues)} 个缺失页面' if issues else '所有高频概念都有独立页面'
        
        return LintResult('缺失页面', status, issues, message)
    
    def check_outdated_content(self) -> LintResult:
        """检查3：过时内容 - 90天未更新"""
        issues = []
        cutoff_date = self.today - timedelta(days=90)
        
        note_files = list(self.notes_path.glob('*.md')) if self.notes_path.exists() else []
        
        for note_file in note_files:
            try:
                content = note_file.read_text(encoding='utf-8')
                # 提取 YAML frontmatter
                if content.startswith('---'):
                    parts = content.split('---', 2)
                    if len(parts) >= 3:
                        frontmatter = yaml.safe_load(parts[1])
                        if frontmatter:
                            updated = frontmatter.get('updated') or frontmatter.get('created')
                            if updated:
                                # 解析日期
                                try:
                                    updated_date = datetime.strptime(str(updated)[:10], '%Y-%m-%d')
                                    if updated_date < cutoff_date:
                                        days_old = (self.today - updated_date).days
                                        issues.append({
                                            'file': note_file.name,
                                            'last_updated': str(updated)[:10],
                                            'days_old': days_old,
                                            'issue': f'超过 {days_old} 天未更新',
                                            'suggestion': '检查内容是否过时，更新 frontmatter 的 updated 字段'
                                        })
                                except ValueError:
                                    continue
            except Exception:
                continue
        
        status = 'ok' if not issues else 'warning'
        message = f'发现 {len(issues)} 个过时笔记' if issues else '所有笔记都在 90 天内更新'
        
        return LintResult('过时内容', status, issues, message)
    
    def check_writeback_candidates(self) -> LintResult:
        """检查4：反写候选 - 最近14天对话的新洞察"""
        issues = []
        cutoff_date = self.today - timedelta(days=14)
        
        # 扫描最近14天的日记
        for i in range(14):
            date = self.today - timedelta(days=i)
            date_str = date.strftime('%Y-%m-%d')
            memory_file = self.memory_path / f'{date_str}.md'
            
            if memory_file.exists():
                try:
                    content = memory_file.read_text(encoding='utf-8')
                    # 查找包含关键词的段落
                    keywords = ['洞察', '新知', '判断', '结论', '经验', '教训', '决策']
                    lines = content.split('\n')
                    
                    for i, line in enumerate(lines):
                        for keyword in keywords:
                            if keyword in line and len(line) > 10:
                                # 提取上下文（前后2行）
                                context_start = max(0, i-2)
                                context_end = min(len(lines), i+3)
                                context = '\n'.join(lines[context_start:context_end])
                                
                                issues.append({
                                    'date': date_str,
                                    'keyword': keyword,
                                    'context': context.strip()[:200],
                                    'issue': f'{date_str} 可能包含可沉淀的洞察',
                                    'suggestion': '检查是否需要写入 KB/notes/'
                                })
                                break
                except Exception:
                    continue
        
        # 去重（同一日期同一关键词只保留一条）
        seen = set()
        unique_issues = []
        for issue in issues:
            key = (issue['date'], issue['keyword'])
            if key not in seen:
                seen.add(key)
                unique_issues.append(issue)
        
        status = 'ok' if not unique_issues else 'warning'
        message = f'发现 {len(unique_issues)} 个反写候选' if unique_issues else '最近 14 天无新洞察需要沉淀'
        
        return LintResult('反写候选', status, unique_issues, message)
    
    def check_rule_health(self) -> LintResult:
        """检查5：规则健康度 - 30天未更新的规则"""
        issues = []
        cutoff_date = self.today - timedelta(days=30)
        
        rule_files = list(self.rules_path.glob('*.md')) if self.rules_path.exists() else []
        
        for rule_file in rule_files:
            try:
                content = rule_file.read_text(encoding='utf-8')
                # 提取 YAML frontmatter
                if content.startswith('---'):
                    parts = content.split('---', 2)
                    if len(parts) >= 3:
                        frontmatter = yaml.safe_load(parts[1])
                        if frontmatter:
                            last_updated = frontmatter.get('last_updated')
                            if last_updated:
                                try:
                                    updated_date = datetime.strptime(str(last_updated)[:10], '%Y-%m-%d')
                                    if updated_date < cutoff_date:
                                        days_old = (self.today - updated_date).days
                                        issues.append({
                                            'file': rule_file.name,
                                            'last_updated': str(last_updated)[:10],
                                            'days_old': days_old,
                                            'issue': f'规则超过 {days_old} 天未更新',
                                            'suggestion': '检查规则是否仍适用，更新 last_updated 字段'
                                        })
                                except ValueError:
                                    continue
            except Exception:
                continue
        
        status = 'ok' if not issues else 'error'
        message = f'发现 {len(issues)} 个过期规则' if issues else '所有规则都在 30 天内更新'
        
        return LintResult('规则健康度', status, issues, message)
    
    def generate_report(self) -> str:
        """生成 markdown 格式报告"""
        lines = [
            '# KB Lint 报告',
            f'\n生成时间：{self.today.strftime("%Y-%m-%d %H:%M")}',
            f'KB 路径：{self.kb_path}',
            '\n---\n'
        ]
        
        # 汇总
        error_count = sum(1 for r in self.results if r.status == 'error')
        warning_count = sum(1 for r in self.results if r.status == 'warning')
        ok_count = sum(1 for r in self.results if r.status == 'ok')
        
        lines.append(f'## 汇总\n')
        lines.append(f'- ✅ 通过：{ok_count} 项')
        lines.append(f'- ⚠️ 警告：{warning_count} 项')
        lines.append(f'- ❌ 错误：{error_count} 项\n')
        
        # 详细结果
        for result in self.results:
            icon = '✅' if result.status == 'ok' else '⚠️' if result.status == 'warning' else '❌'
            lines.append(f'## {icon} {result.check_name}')
            lines.append(f'\n{result.message}\n')
            
            if result.issues:
                lines.append('**发现问题：**\n')
                for i, issue in enumerate(result.issues[:5], 1):  # 最多显示5个
                    lines.append(f'{i}. **{issue.get("file", issue.get("concept", issue.get("date", "未知")))}**')
                    lines.append(f'   - 问题：{issue.get("issue", "")}')
                    lines.append(f'   - 建议：{issue.get("suggestion", "")}\n')
                
                if len(result.issues) > 5:
                    lines.append(f'... 还有 {len(result.issues) - 5} 项未显示\n')
        
        lines.append('---\n')
        lines.append('*报告由 kb-lint skill 生成*')
        
        return '\n'.join(lines)
    
    def save_report(self, report: str = None):
        """保存报告到 KB/log.md"""
        if report is None:
            report = self.generate_report()
        
        # 追加到 log.md
        if self.log_path.exists():
            existing = self.log_path.read_text(encoding='utf-8')
            content = existing + '\n\n' + report
        else:
            content = report
        
        self.log_path.write_text(content, encoding='utf-8')
        print(f'报告已保存到：{self.log_path}')


def main():
    import argparse
    parser = argparse.ArgumentParser(description='KB Lint - 知识库健康检查')
    parser.add_argument('--kb-path', help='KB 目录路径', default=None)
    parser.add_argument('--save', action='store_true', help='保存报告到 log.md')
    args = parser.parse_args()
    
    # 运行检查
    linter = KBLint(kb_path=args.kb_path)
    linter.run_all_checks()
    
    # 生成报告
    report = linter.generate_report()
    print(report)
    
    # 保存报告
    if args.save:
        linter.save_report(report)


if __name__ == '__main__':
    main()