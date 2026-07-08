#!/usr/bin/env node
/**
 * 发布计划 Markdown 格式校验 — 防止 Agent 乱改结构
 * Usage: node scripts/validate-release-plan.mjs docs/releases/xxx.md
 */
import { readFileSync } from 'node:fs';

const REQUIRED_SECTIONS = [
  '发布概述',
  '外部依赖',
  '发布项 check list',
  '发布流程',
  '发布前检查',
  '前置准备',
  '代码发布',
  '发布后验证',
  '灰度方案',
  '回滚方案',
  '系统风险',
];

const REQUIRED_CHECKBOXES = [
  '确认本次需求涉及的代码仓库、proto 仓库及依赖分支均已合入对应主分支',
  '数据库表变更验证',
  '静态配置文件验证',
  'nacos配置验证',
  'kafka',
  'prod配置文件验证',
  'ENV环境变量',
  'xxl-job任务配置验证。',
  'ls-bgw网关配置确认',
  '线上机器扩容情况是否完成。',
];

const REPO_TABLE_HEADERS = [
  '编号', 'git地址', 'branch', 'CR地址', '代码扫描结果',
  '是否review完成', '是否已合入主分支（含 proto/依赖仓库）', '负责人', 'CR负责人',
];

const SERVICE_TABLE_HEADERS = [
  '编号', 'service', 'branch', '上线tag', '是否新服务', '发布风险等级',
  '步骤说明（如有）', '是否已发布', '负责人', '风险提示', '备注',
];

const AI_FLUFF = [
  '赋能', '闭环', '抓手', '沉淀', '对齐颗粒度', '全方位', '深度融合',
  '可能存在潜在', '旨在', '助力', '打造',
];

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/validate-release-plan.mjs <release-plan.md>');
  process.exit(1);
}

const content = readFileSync(file, 'utf8');
const errors = [];
const warnings = [];

for (const section of REQUIRED_SECTIONS) {
  if (!content.includes(section)) {
    errors.push(`缺少章节：${section}`);
  }
}

for (const item of REQUIRED_CHECKBOXES) {
  if (!content.includes(item)) {
    errors.push(`缺少 checkbox 文案：${item}`);
  }
}

function parseTableHeader(line) {
  return line.split('|').map((c) => c.trim()).filter(Boolean);
}

const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('git地址') && line.startsWith('|')) {
    const headers = parseTableHeader(line);
    if (headers.length !== REPO_TABLE_HEADERS.length) {
      errors.push(`「发布前检查」表格列数应为 ${REPO_TABLE_HEADERS.length}，实际 ${headers.length}`);
    } else {
      for (let j = 0; j < REPO_TABLE_HEADERS.length; j++) {
        if (headers[j] !== REPO_TABLE_HEADERS[j]) {
          errors.push(`「发布前检查」第 ${j + 1} 列应为「${REPO_TABLE_HEADERS[j]}」，实际「${headers[j]}」`);
        }
      }
    }
  }
  if (line.includes('| service |') || (line.includes('service') && line.includes('上线tag') && line.startsWith('|'))) {
    const headers = parseTableHeader(line);
    if (headers.length === SERVICE_TABLE_HEADERS.length) {
      for (let j = 0; j < SERVICE_TABLE_HEADERS.length; j++) {
        if (headers[j] !== SERVICE_TABLE_HEADERS[j]) {
          errors.push(`「代码发布」第 ${j + 1} 列应为「${SERVICE_TABLE_HEADERS[j]}」，实际「${headers[j]}」`);
        }
      }
    } else if (line.includes('service')) {
      errors.push(`「代码发布」表格列数应为 ${SERVICE_TABLE_HEADERS.length}，实际 ${headers.length}`);
    }
  }
}

for (const word of AI_FLUFF) {
  if (content.includes(word)) {
    warnings.push(`概述/风险段疑似空话，含「${word}」— 请改说人话`);
  }
}

const overviewMatch = content.match(/## 发布概述\n\n([\s\S]*?)\n\n## /);
if (overviewMatch) {
  const overview = overviewMatch[1].replace(/\{\{[^}]+\}\}/g, '').trim();
  const overviewLines = overview.split('\n').filter((l) => l.trim() && !l.startsWith('-') && !l.startsWith('>'));
  if (overviewLines.length > 5) {
    warnings.push(`发布概述超过 5 行（${overviewLines.length} 行），建议压缩`);
  }
}

if (errors.length) {
  console.error('❌ 格式校验失败：');
  errors.forEach((e) => console.error(`  - ${e}`));
}
if (warnings.length) {
  console.warn('⚠️  说人话提醒：');
  warnings.forEach((w) => console.warn(`  - ${w}`));
}

if (errors.length) {
  process.exit(1);
}
console.log('✅ 格式校验通过' + (warnings.length ? `（${warnings.length} 条提醒）` : ''));
