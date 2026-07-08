#!/usr/bin/env node
/**
 * 从 git/gh 采集结构化字段，填充发布计划模板
 *
 * Usage:
 *   node scripts/fill-release-plan.mjs \
 *     --name "体育频道" \
 *     --out docs/releases/2026-07-07-体育频道.md \
 *     --repo /path/to/prediction-serv \
 *     --service prediction-serv \
 *     --tech-wiki "https://skyrocket.sg.larksuite.com/wiki/TEZgwnuyOiJ315kIRn1lypTZgce"
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TEMPLATE = join(ROOT, 'templates/release-plan.template.md');

function parseArgs(argv) {
  const opts = { repos: [], services: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = argv[++i];
    else if (a === '--name') opts.name = argv[++i];
    else if (a === '--repo') opts.repos.push(argv[++i]);
    else if (a === '--service') opts.services.push(argv[++i]);
    else if (a === '--tech-wiki') opts.techWiki = argv[++i];
    else if (a === '--prd') opts.prd = argv[++i];
    else if (a === '--newman') opts.newman = argv[++i];
    else if (a === '--owner') opts.owner = argv[++i];
  }
  return opts;
}

function sh(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function gitInfo(repoPath) {
  const url = sh('git remote get-url origin', repoPath) || '未知';
  const branch = sh('git branch --show-current', repoPath) || '未知';
  let cr = '';
  let review = '待确认';
  let merged = '待确认';
  if (branch) {
    const prJson = sh(`gh pr list --head "${branch}" --json url,reviewDecision,state --limit 1`, repoPath);
    if (prJson) {
      try {
        const [pr] = JSON.parse(prJson);
        if (pr) {
          cr = pr.url || '';
          review = pr.reviewDecision === 'APPROVED' ? '是' : '待确认';
          merged = pr.state === 'MERGED' ? '是' : '否';
        }
      } catch { /* ignore */ }
    }
  }
  return { url, branch, cr, review, merged };
}

function scanConfig(repoPath) {
  const hints = [];
  const ymlPaths = [
    'src/main/resources/application.yml',
    'src/main/resources/application-prod.yml',
    'config/application.yml',
  ];
  for (const p of ymlPaths) {
    const full = join(repoPath, p);
    if (existsSync(full)) hints.push(`- ${p}`);
  }
  const flyway = join(repoPath, 'src/main/resources/db/migration');
  let db = '无';
  if (existsSync(flyway)) {
    const files = readdirSync(flyway).filter((f) => f.endsWith('.sql'));
    if (files.length) db = files.map((f) => `db/migration/${f}`).join('、');
  }
  const kafkaHits = sh('grep -rl "KafkaListener\\|kafka.topic" --include="*.java" --include="*.go" . 2>/dev/null | head -3', repoPath);
  const kafka = kafkaHits ? kafkaHits.split('\n').filter(Boolean).join('、') : '无';
  return {
    yml: hints.length ? hints.join('\n') : '无变更',
    nacos: existsSync(join(repoPath, 'nacos')) ? '见 nacos/ 目录' : '无',
    kafka,
    db,
  };
}

function buildRepoRows(repos, owner) {
  return repos.map((repo, i) => {
    const g = gitInfo(repo);
    return `| ${i + 1} | ${g.url} | ${g.branch} | ${g.cr || '待补充'} | 待补充 | ${g.review} | ${g.merged} | ${owner || '待补充'} | 待补充 |`;
  }).join('\n');
}

function buildServiceRows(services, repos, owner) {
  const branch = repos.length ? gitInfo(repos[0]).branch : '待补充';
  return services.map((svc, i) =>
    `| ${i + 1} | ${svc} | ${branch} | 待补充 | 否 | 待评估 | 待补充 | 否 | ${owner || '待补充'} | 待补充 |  |`,
  ).join('\n');
}

function fillTemplate(template, opts, cfg) {
  const repos = opts.repos.length ? opts.repos : [process.cwd()];
  const services = opts.services.length ? opts.services : [basename(repos[0])];
  const first = gitInfo(repos[0]);
  const today = new Date().toISOString().slice(0, 10);

  let out = template;
  const replacements = {
    '{{需求名称}}': opts.name || `发布-${today}`,
    '{{一句话：这次发什么、何时发、影响范围}}': '【人工填写】',
    '{{prd_url}}': opts.prd || '待补充',
    '{{tech_wiki_url}}': opts.techWiki || '待补充',
    '{{test_report_url}}': opts.newman || '待补充',
    '{{依赖团队 + 需要对方何时完成什么；没有就写「无」}}': '【人工填写，无则写「无」】',
    '{{yml_diff_or_无变更}}': cfg.yml,
    '{{nacos 文件名与变更摘要，无则写「无」}}': cfg.nacos,
    '{{topic_name}} — {{用途}}': cfg.kafka === '无' ? '无' : cfg.kafka,
    '{{flyway/liquibase 脚本路径与摘要，无则写「无」}}': cfg.db,
    '{{变更摘要或「无」}}': '无',
    '{{任务名与 cron，无则写「无」}}': '无',
    '{{ENV 项，无则写「无」}}': '无',
    '{{是否扩容、目标实例数，无则写「无」}}': '无',
    '{{repo_url}}': first.url,
    '{{branch}}': first.branch,
    '{{cr_url}}': first.cr || '待补充',
    '{{scan_result}}': '待补充',
    '{{review_done}}': first.review,
    '{{merged_to_main}}': first.merged,
    '{{owner}}': opts.owner || '待补充',
    '{{cr_owner}}': '待补充',
    '{{service_name}}': services[0],
    '{{tag}}': '待补充',
    '{{is_new_service}}': '否',
    '{{risk_level}}': '待评估',
    '{{steps}}': '待补充',
    '{{published}}': '否',
    '{{risk_hint}}': '待补充',
    '{{note}}': '',
    '{{怎么验：接口、监控、留守时长；附 Newman/Wiki 链接}}': '【人工填写】',
    '{{是/否}}': '【人工填写】',
    '{{谁做、怎么切、比例}}': '【人工填写】',
    '{{时间}}': '【人工填写】',
    '{{必须写清：回滚 tag、配置备份路径、谁执行、预计多久}}': '【人工填写】',
    '{{具体风险；禁止空泛套话}}': '【人工填写】',
    '{{对应动作：监控项、开关、联系人}}': '【人工填写】',
  };

  for (const [k, v] of Object.entries(replacements)) {
    out = out.split(k).join(v);
  }

  if (repos.length > 1) {
    out = out.replace(
      /\| 1 \|.*\| 待补充 \|/,
      buildRepoRows(repos, opts.owner).split('\n')[0] + ' |',
    );
    const repoBlock = buildRepoRows(repos, opts.owner);
    out = out.replace(/\| 1 \|[^\n]+\n/, repoBlock.split('\n').map((l) => l + '\n').join(''));
  }

  if (services.length > 1) {
    out = out.replace(
      /\| 1 \|[^\n]+\| \|\n/,
      buildServiceRows(services, repos, opts.owner).split('\n').map((l) => l + '\n').join(''),
    );
  }

  return out.replace(
    /> \*\*填写说明[\s\S]*?---\n\n/,
    '',
  );
}

const opts = parseArgs(process.argv);
if (!opts.out) {
  console.error(`Usage: node scripts/fill-release-plan.mjs --out <file.md> [--name 需求名] [--repo path] [--service name] [--tech-wiki url] [--prd url] [--newman url] [--owner name]`);
  process.exit(1);
}

const template = readFileSync(TEMPLATE, 'utf8');
const cfg = scanConfig(opts.repos[0] || process.cwd());
const filled = fillTemplate(template, opts, cfg);
writeFileSync(opts.out, filled, 'utf8');
console.log(`✅ 已生成：${opts.out}`);
console.log('⚠️  请人工填写：概述、外部依赖、灰度、回滚、风险');
console.log(`   校验：node scripts/validate-release-plan.mjs ${opts.out}`);
