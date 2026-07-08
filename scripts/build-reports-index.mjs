#!/usr/bin/env node
/**
 * 扫描 report-registry.json，汇总各 controller 报告状态，生成 reports/index.html。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const registryPath = path.join(__dirname, "report-registry.json");
const outPath = path.join(root, "reports/index.html");

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtTs(ms) {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  } catch {
    return "—";
  }
}

function readRunStats(jsonPath) {
  const abs = path.join(root, jsonPath);
  if (!fs.existsSync(abs)) {
    return { exists: false };
  }
  const stat = fs.statSync(abs);
  try {
    const data = JSON.parse(fs.readFileSync(abs, "utf8"));
    const run = data.run || {};
    const stats = run.stats || {};
    const failures = run.failures || [];
    const assertTotal = stats.assertions?.total ?? 0;
    const assertFailed = stats.assertions?.failed ?? 0;
    const pass =
      assertFailed === 0 &&
      (stats.requests?.failed ?? 0) === 0 &&
      failures.length === 0;
    return {
      exists: true,
      mtime: stat.mtimeMs,
      collection: data.collection?.info?.name || "—",
      requests: stats.requests?.total ?? 0,
      assertTotal,
      assertFailed,
      pass,
      avgMs: run.timings?.responseAverage ?? null,
      completed: run.timings?.completed ?? null,
    };
  } catch {
    return { exists: true, mtime: stat.mtimeMs, error: true };
  }
}

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const rows = registry.controllers.map((c) => {
  const stats = readRunStats(c.json);
  const htmlRel = c.html.replace(/^reports\//, "");
  const htmlExists = fs.existsSync(path.join(root, c.html));
  return { ...c, stats, htmlRel, htmlExists };
});

const generatedAt = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
const totalControllers = rows.length;
const ran = rows.filter((r) => r.stats.exists && !r.stats.error).length;
const allPass = rows.filter((r) => r.stats.exists && r.stats.pass).length;
const hasFail = rows.filter((r) => r.stats.exists && !r.stats.pass).length;

const tableRows = rows
  .map((r) => {
    const s = r.stats;
    let statusCell = '<span class="muted">未运行</span>';
    let meta = "—";
    let reqs = "—";
    let asserts = "—";
    let fail = "—";
    let updated = "—";
    let link = r.htmlExists
      ? `<a class="btn" href="${esc(r.htmlRel)}">查看报告</a>`
      : '<span class="muted">报告未生成</span>';

    if (s.exists && !s.error) {
      statusCell = s.pass
        ? '<span class="pill ok">通过</span>'
        : '<span class="pill bad">失败</span>';
      meta = `${s.requests} 请求 · ${s.assertTotal} 断言`;
      reqs = String(s.requests);
      asserts = String(s.assertTotal);
      fail = s.assertFailed > 0 ? `<span class="bad">${s.assertFailed}</span>` : "0";
      updated = fmtTs(s.mtime);
    } else if (s.exists && s.error) {
      statusCell = '<span class="pill warn">JSON 损坏</span>';
    }

    return `<tr>
      <td><strong>${esc(r.title)}</strong><div class="sub">${esc(r.controller)}</div></td>
      <td>${statusCell}</td>
      <td>${reqs}</td>
      <td>${asserts}</td>
      <td>${fail}</td>
      <td class="muted">${updated}</td>
      <td>${link}</td>
    </tr>`;
  })
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PM Newman 测试报告汇总</title>
  <style>
    :root {
      --bg: #f0f2f5; --surface: #fff; --border: #e5e7eb; --text: #1f2937;
      --muted: #6b7280; --header: #1e293b; --pass: #16a34a; --fail: #dc2626;
      --accent: #2563eb; --warn: #d97706; --radius: 8px;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
    .topbar { background: var(--header); color: #fff; padding: 20px clamp(16px, 4vw, 40px); }
    .topbar h1 { margin: 0 0 6px; font-size: 1.4rem; }
    .topbar p { margin: 0; color: rgba(255,255,255,.75); font-size: .9rem; }
    .page { max-width: 1100px; margin: 0 auto; padding: 24px clamp(16px, 4vw, 40px) 48px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 14px; margin-bottom: 24px; }
    .card { background: var(--surface); border-radius: var(--radius); padding: 16px; border: 1px solid var(--border); }
    .card h3 { margin: 0 0 6px; font-size: .72rem; text-transform: uppercase; color: var(--muted); letter-spacing: .04em; }
    .card .val { font-size: 1.6rem; font-weight: 700; }
    .card.pass .val { color: var(--pass); }
    .card.fail .val { color: var(--fail); }
    table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; font-size: .9rem; }
    th, td { padding: 12px 14px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
    th { background: #f9fafb; color: var(--muted); font-size: .75rem; text-transform: uppercase; }
    tr:last-child td { border-bottom: none; }
    .sub { font-size: .8rem; color: var(--muted); margin-top: 2px; }
    .muted { color: var(--muted); font-size: .85rem; }
    .pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: .78rem; font-weight: 600; color: #fff; }
    .pill.ok { background: var(--pass); }
    .pill.bad { background: var(--fail); }
    .pill.warn { background: var(--warn); }
    .bad { color: var(--fail); font-weight: 600; }
    .btn { display: inline-block; padding: 6px 12px; background: var(--accent); color: #fff !important; text-decoration: none; border-radius: 6px; font-size: .82rem; font-weight: 500; }
    .btn:hover { filter: brightness(1.08); }
    .hint { color: var(--muted); font-size: .85rem; margin: 0 0 16px; }
    footer { margin-top: 28px; color: var(--muted); font-size: .8rem; }
    code { background: #f3f4f6; padding: 1px 5px; border-radius: 4px; font-size: .85em; }
  </style>
</head>
<body>
  <div class="topbar">
    <h1>PM Newman 测试报告汇总</h1>
    <p>每个 Controller 独立报告 · 生成于 ${esc(generatedAt)}</p>
  </div>
  <div class="page">
    <div class="cards">
      <div class="card"><h3>注册报告</h3><div class="val">${totalControllers}</div></div>
      <div class="card"><h3>已有 JSON</h3><div class="val">${ran}</div></div>
      <div class="card pass"><h3>全通过</h3><div class="val">${allPass}</div></div>
      <div class="card fail"><h3>有失败</h3><div class="val">${hasFail}</div></div>
    </div>
    <p class="hint">运行 <code>npm run pm:…</code> 后会更新对应 JSON 与 <code>reports/controllers/*.html</code>，并刷新本页。</p>
    <table>
      <thead>
        <tr>
          <th>Controller</th>
          <th>状态</th>
          <th>请求</th>
          <th>断言</th>
          <th>失败</th>
          <th>更新时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
    <footer>由 <code>scripts/build-reports-index.mjs</code> 生成 · 配置 <code>scripts/report-registry.json</code></footer>
  </div>
</body>
</html>`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, "utf8");
console.log("已写入汇总页:", outPath);
