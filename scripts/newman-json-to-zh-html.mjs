#!/usr/bin/env node
/**
 * 从 Newman --reporter-json-export 的产物生成自包含中文 HTML（无外链 CDN）。
 * 用法：node scripts/newman-json-to-zh-html.mjs [输入.json] [输出.html]
 * 默认：reports/newman-event-list.json → reports/newman-summary-zh.html
 *
 * **后续新接口**：在下方 `API_REPORT_GROUPS` 追加一项（`pathIncludes` 为 URL 子串，按顺序首个匹配），
 * 即可自动进入「汇总表 + 分节明细」；仍是一份 HTML、一次 Newman JSON。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const inPath = path.resolve(process.argv[2] || path.join(root, "reports/newman-event-list.json"));
const outPath = path.resolve(process.argv[3] || path.join(root, "reports/newman-summary-zh.html"));

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 响应时间（毫秒），整数显示，不带小数 */
function fmtResponseMs(ms) {
  if (ms == null || ms === "" || ms === "—") return "—";
  const n = Number(ms);
  if (Number.isNaN(n)) return String(ms);
  return `${Math.round(n)} ms`;
}

function fmtTs(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  } catch {
    return String(ts);
  }
}

const raw = fs.readFileSync(inPath, "utf8");
const data = JSON.parse(raw);
const run = data.run;
if (!run) {
  console.error("JSON 中缺少 run 字段，请确认是 Newman 的 json reporter 导出文件。");
  process.exit(1);
}

const collectionName = data.collection?.info?.name || "Postman 集合";
const collection = data.collection || {};
const stats = run.stats || {};
const timings = run.timings || {};
const executions = run.executions || [];
const failures = run.failures || [];

const generatedAt = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

/**
 * 报告分组：自上而下首个 `pathIncludes` 命中即归入该组；未命中归入 `other`（须保持最后一项 id 为 other）。
 * 新增接口：复制一行改 `id` / `pathIncludes` / `summaryLabel` 即可。
 */
const API_REPORT_GROUPS = [
  {
    id: "categories",
    pathIncludes: "/ce/pm/v1/api/categories",
    summaryLabel: "GET /ce/pm/v1/api/categories",
  },
  {
    id: "eventList",
    pathIncludes: "/ce/pm/v1/api/event/list",
    summaryLabel: "GET /ce/pm/v1/api/event/list",
  },
  // 示例：后续接口并入同报告时在此追加，例如：
  // { id: "config", pathIncludes: "/ce/pm/v1/api/config", summaryLabel: "GET /ce/pm/v1/api/config" },
  { id: "other", pathIncludes: null, summaryLabel: "其它" },
];

const pass =
  (stats.assertions?.failed ?? 0) === 0 &&
  (stats.requests?.failed ?? 0) === 0 &&
  (failures.length === 0);

/** Postman 集合：叶子请求 id → 所属文件夹名称 */
function buildRequestFolderMap(items) {
  const map = new Map();
  function walk(nodes, folderName) {
    for (const node of nodes || []) {
      if (Array.isArray(node.item)) {
        walk(node.item, node.name || folderName || "未分组");
      } else if (node.id) {
        map.set(node.id, folderName || "未分组");
      }
    }
  }
  walk(items, null);
  return map;
}

const idToFolder = buildRequestFolderMap(collection.item);

const rows = executions.map((ex, idx) => {
  const name = ex.item?.name || `请求 ${idx + 1}`;
  const folder = idToFolder.get(ex.id) || "未分组";
  const method = ex.request?.method || "GET";
  const url = ex.request?.url?.raw || ex.request?.url || "—";
  const code = ex.response?.code ?? "—";
  const rt = ex.response?.responseTime ?? "—";
  const size = ex.response?.responseSize ?? "—";
  const assertions = (ex.assertions || []).map((a) => {
    const err = a.error;
    const ok = !err;
    return { name: a.assertion || "断言", ok, err: err ? String(err.message || err) : "" };
  });
  const assertFail = assertions.filter((a) => !a.ok).length;
  return { name, folder, method, url, code, rt, size, assertions, assertFail };
});

/** 按文件夹顺序聚合（保持 Newman 执行顺序） */
const folderOrder = [];
const folderToRows = new Map();
for (const r of rows) {
  if (!folderToRows.has(r.folder)) {
    folderOrder.push(r.folder);
    folderToRows.set(r.folder, []);
  }
  folderToRows.get(r.folder).push(r);
}

function inferApiGroupId(url) {
  const s = String(url);
  for (const g of API_REPORT_GROUPS) {
    if (g.id === "other") return "other";
    if (g.pathIncludes && s.includes(g.pathIncludes)) return g.id;
  }
  return "other";
}

function buildFolderSectionsHtml(folders) {
  return folders
    .map((folder) => {
      const list = folderToRows.get(folder);
      const n = list.length;
      const fails = list.reduce((acc, r) => acc + r.assertFail, 0);
      const openFolder = fails > 0 ? " open" : "";
      const inner = list
        .map((r) => {
          const openReq = r.assertFail > 0 ? " open" : "";
          const failBadge = r.assertFail ? ` · <span class="bad">${r.assertFail} 失败</span>` : "";
          const dotClass = r.assertFail ? "failed" : "passed";
          return `<details class="details-req"${openReq}>
      <summary><span class="sum-title"><span class="status-dot ${dotClass}"></span>${esc(r.name)}</span><span class="sum-meta">HTTP ${esc(r.code)} · ${fmtResponseMs(
            r.rt
          )} · 断言 ${r.assertions.length} 条${failBadge}</span></summary>
      <div class="details-body">
        <div class="meta">${esc(r.method)} · 响应体积 ${esc(r.size)} 字节</div>
        <div class="meta">${esc(r.url)}</div>
        <table>
          <tbody>
            ${r.assertions
              .map(
                (a) => `
            <tr>
              <th>断言</th>
              <td class="${a.ok ? "assert-ok" : "assert-bad"}">${a.ok ? "通过" : "失败"} — ${esc(a.name)}${
                  a.err ? `<br/><small>${esc(a.err)}</small>` : ""
                }</td>
            </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </details>`;
        })
        .join("\n");
      const folderMeta =
        fails > 0
          ? `${n} 个用例 · <span class="bad">${fails} 条断言失败</span>`
          : `${n} 个用例 · <span class="ok-inline">断言全过</span>`;
      return `<details class="details-folder"${openFolder}>
    <summary><span class="folder-title">${esc(folder)}</span><span class="folder-meta">${folderMeta}</span></summary>
    <div class="folder-inner">${inner}</div>
  </details>`;
    })
    .join("\n");
}

const foldersByGroupId = Object.fromEntries(API_REPORT_GROUPS.map((g) => [g.id, []]));
for (const folder of folderOrder) {
  const list = folderToRows.get(folder);
  const keys = new Set(list.map((r) => inferApiGroupId(r.url)));
  if (keys.size === 1) {
    const only = [...keys][0];
    foldersByGroupId[only].push(folder);
  } else {
    foldersByGroupId.other.push(folder);
  }
}

function aggregateByApi(rows) {
  const agg = {};
  for (const g of API_REPORT_GROUPS) {
    agg[g.id] = { label: g.summaryLabel, reqs: 0, assertTotal: 0, assertFail: 0 };
  }
  for (const r of rows) {
    const k = inferApiGroupId(r.url);
    agg[k].reqs += 1;
    agg[k].assertTotal += r.assertions.length;
    agg[k].assertFail += r.assertFail;
  }
  return agg;
}

const byApi = aggregateByApi(rows);

function summaryRow(g) {
  const a = byApi[g.id];
  if (!a || a.reqs === 0) return "";
  const ok = a.assertFail === 0;
  return `<tr>
    <td><code>${esc(a.label)}</code></td>
    <td>${a.reqs}</td>
    <td>${a.assertTotal}</td>
    <td>${a.assertFail > 0 ? `<span class="bad">${a.assertFail}</span>` : "0"}</td>
    <td class="${ok ? "assert-ok" : "assert-bad"}">${ok ? "全通过" : "有失败"}</td>
  </tr>`;
}

const summaryTableRows = API_REPORT_GROUPS.map((g) => summaryRow(g)).join("\n    ");

const summaryTableHtml = `<table class="summary-api">
  <thead><tr><th>接口</th><th>用例数</th><th>断言数</th><th>失败断言</th><th>结果</th></tr></thead>
  <tbody>
    ${summaryTableRows}
  </tbody>
</table>`;

const CN_SECTION = "一二三四五六七八九十";

function buildDetailSectionsHtml() {
  const parts = [];
  let n = 0;
  for (const g of API_REPORT_GROUPS) {
    if (g.id === "other") continue;
    const block = buildFolderSectionsHtml(foldersByGroupId[g.id] || []);
    const body = block.trim() ? block : '<p class="hint">（本运行无此类请求）</p>';
    n += 1;
    const num = n <= 10 ? `${CN_SECTION[n - 1]}、` : `${n}. `;
    parts.push(`<section>
    <h2>${num}${esc(g.summaryLabel)}</h2>
    <p class="hint">按 Postman 文件夹折叠；含失败时对应块默认展开。</p>
    ${body}
  </section>`);
  }
  if ((foldersByGroupId.other || []).length) {
    parts.push(`<section>
    <h2>其它请求</h2>
    <p class="hint">同一文件夹内混用多类 URL，或无法匹配上文路径前缀。</p>
    ${buildFolderSectionsHtml(foldersByGroupId.other)}
  </section>`);
  }
  return parts.join("\n\n");
}

const detailSectionsHtml = buildDetailSectionsHtml();

const failBlocks = failures.map((f, i) => {
  const name = f.source?.name || f.error?.name || `失败项 ${i + 1}`;
  const msg = f.error?.message || f.error?.test || JSON.stringify(f.error || f, null, 2);
  return { name, msg };
});

const assertTotal = stats.assertions?.total ?? 0;
const assertFailed = stats.assertions?.failed ?? 0;
const assertPassed = Math.max(0, assertTotal - assertFailed);

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Newman 合并报告 · ${esc(collectionName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --allure-bg: #f2f2f2; --allure-surface: #fff; --allure-border: #e5e5e5;
      --allure-text: #333; --allure-muted: #999; --allure-header: #343434;
      --allure-passed: #97cc64; --allure-failed: #fd5a3e; --allure-skipped: #aaa;
      --allure-accent: #4a90e2; --shadow: 0 1px 3px rgba(0,0,0,.08); --radius: 4px;
    }
    * { box-sizing: border-box; }
    body { margin:0; font-family:"Inter",ui-sans-serif,system-ui,"PingFang SC","Microsoft YaHei",sans-serif; background:var(--allure-bg); color:var(--allure-text); line-height:1.5; font-size:14px; }
    .topbar { background:var(--allure-header); color:#fff; padding:18px clamp(16px,4vw,40px); box-shadow:0 2px 8px rgba(0,0,0,.15); }
    .topbar h1 { margin:0 0 6px; font-size:1.35rem; font-weight:600; }
    .topbar .sub { color:rgba(255,255,255,.72); font-size:.85rem; }
    .topbar .sub code { background:rgba(255,255,255,.12); padding:1px 6px; border-radius:3px; font-size:.8rem; }
    .page { padding:24px clamp(16px,4vw,40px) 48px; max-width:1280px; margin:0 auto; }
    .overview { display:grid; grid-template-columns:1fr minmax(220px,280px); gap:20px; margin-bottom:28px; align-items:start; }
    @media (max-width:860px) { .overview { grid-template-columns:1fr; } }
    .widgets { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:14px; }
    .widget { background:var(--allure-surface); border-radius:var(--radius); box-shadow:var(--shadow); padding:14px 16px; border-left:4px solid var(--allure-accent); min-height:76px; }
    .widget h3 { margin:0 0 8px; font-size:.72rem; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color:var(--allure-muted); }
    .widget .val { font-size:1.65rem; font-weight:700; line-height:1.1; color:var(--allure-text); }
    .widget.passed { border-left-color:var(--allure-passed); } .widget.passed .val { color:var(--allure-passed); }
    .widget.failed { border-left-color:var(--allure-failed); } .widget.failed .val { color:var(--allure-failed); }
    .chart-card { background:var(--allure-surface); border-radius:var(--radius); box-shadow:var(--shadow); padding:16px; display:flex; flex-direction:column; align-items:center; }
    .chart-card h3 { margin:0 0 8px; font-size:.78rem; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color:var(--allure-muted); align-self:flex-start; }
    .chart-wrap { width:180px; height:180px; }
    .status-row { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-bottom:24px; }
    .badge { display:inline-flex; padding:5px 12px; border-radius:3px; font-size:.8rem; font-weight:600; text-transform:uppercase; letter-spacing:.03em; color:#fff; }
    .badge.ok { background:var(--allure-passed); } .badge.bad { background:var(--allure-failed); }
    section { margin-top:28px; }
    section h2 { font-size:.95rem; font-weight:600; text-transform:uppercase; letter-spacing:.04em; color:var(--allure-muted); margin:0 0 14px; padding-bottom:8px; border-bottom:2px solid var(--allure-border); }
    .hint { color:var(--allure-muted); font-size:.82rem; margin:-8px 0 16px; }
    .summary-api { width:100%; border-collapse:collapse; font-size:.88rem; margin-bottom:8px; background:var(--allure-surface); border:1px solid var(--allure-border); border-radius:var(--radius); overflow:hidden; box-shadow:var(--shadow); }
    .summary-api th, .summary-api td { padding:11px 14px; border-bottom:1px solid var(--allure-border); }
    .summary-api th { color:var(--allure-muted); font-weight:600; text-align:left; background:#fafafa; font-size:.75rem; text-transform:uppercase; }
    .summary-api tr:last-child td { border-bottom:none; }
    .summary-api code { font-size:.82rem; }
    details.details-folder { border:1px solid var(--allure-border); border-radius:var(--radius); margin-bottom:10px; background:var(--allure-surface); box-shadow:var(--shadow); overflow:hidden; }
    details.details-folder > summary { list-style:none; cursor:pointer; padding:12px 16px; font-weight:500; display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px; user-select:none; background:#fafafa; }
    details.details-folder[open] > summary { border-bottom:1px solid var(--allure-border); background:#f5f5f5; }
    details.details-folder > summary::-webkit-details-marker { display:none; }
    details.details-folder > summary::before { content:"▸"; display:inline-block; width:1em; color:var(--allure-muted); transition:transform .15s; margin-right:4px; }
    details.details-folder[open] > summary::before { transform:rotate(90deg); }
    .folder-title { font-size:.95rem; }
    .folder-meta { font-size:.82rem; color:var(--allure-muted); font-weight:400; }
    .folder-inner { padding:8px 12px 12px 16px; }
    details.details-req { border:1px solid var(--allure-border); border-radius:var(--radius); margin:8px 0 8px 12px; background:#fff; }
    details.details-req > summary { list-style:none; cursor:pointer; padding:10px 14px; display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px; font-size:.9rem; user-select:none; background:#fafafa; }
    details.details-req[open] > summary { border-bottom:1px solid var(--allure-border); }
    details.details-req > summary::-webkit-details-marker { display:none; }
    details.details-req > summary::before { content:"▸"; color:var(--allure-muted); width:1em; display:inline-block; transition:transform .15s; margin-right:4px; }
    details.details-req[open] > summary::before { transform:rotate(90deg); }
    .status-dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px; vertical-align:middle; }
    .status-dot.passed { background:var(--allure-passed); } .status-dot.failed { background:var(--allure-failed); }
    .sum-title { font-weight:600; }
    .sum-meta { color:var(--allure-muted); font-size:.8rem; font-weight:400; }
    .details-body { padding:12px 14px 14px; }
    .fail-card { border:1px solid rgba(253,90,62,.35); border-left:4px solid var(--allure-failed); border-radius:var(--radius); margin-bottom:12px; overflow:hidden; background:#fff5f3; box-shadow:var(--shadow); }
    .fail-card-h { padding:12px 16px; font-weight:600; color:var(--allure-failed); }
    .meta { color:var(--allure-muted); font-size:.82rem; margin-top:6px; word-break:break-all; }
    table { width:100%; border-collapse:collapse; font-size:.88rem; border:1px solid var(--allure-border); border-radius:var(--radius); overflow:hidden; }
    th, td { text-align:left; padding:9px 12px; border-bottom:1px solid var(--allure-border); }
    th { color:var(--allure-muted); font-weight:600; width:28%; background:#fafafa; font-size:.75rem; text-transform:uppercase; }
    tr:last-child td, tr:last-child th { border-bottom:none; }
    .assert-ok { color:var(--allure-passed); font-weight:600; }
    .assert-bad { color:var(--allure-failed); font-weight:600; }
    .ok-inline { color:var(--allure-passed); font-weight:500; }
    .bad { color:var(--allure-failed); font-weight:600; }
    pre { background:#f8f8f8; border:1px solid var(--allure-border); border-radius:var(--radius); padding:12px; overflow:auto; font-size:.8rem; color:#444; margin:0; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; white-space:pre-wrap; word-break:break-word; }
    footer { margin-top:32px; padding-top:16px; border-top:1px solid var(--allure-border); color:var(--allure-muted); font-size:.78rem; }
    footer a { color:var(--allure-accent); text-decoration:none; } footer a:hover { text-decoration:underline; }
  </style>
</head>
<body>
  <div class="topbar">
    <h1>Newman 合并报告（多接口）</h1>
    <div class="sub">集合：${esc(collectionName)} · Newman 结束：${esc(fmtTs(timings.completed))} · 生成：${esc(generatedAt)}</div>
  </div>
  <div class="page">
    <div class="overview">
      <div class="widgets">
        <div class="widget"><h3>迭代</h3><div class="val">${stats.iterations?.total ?? 0}</div></div>
        <div class="widget"><h3>请求总数</h3><div class="val">${stats.requests?.total ?? 0}</div></div>
        <div class="widget ${(stats.requests?.failed ?? 0) > 0 ? "failed" : "passed"}"><h3>失败请求</h3><div class="val">${stats.requests?.failed ?? 0}</div></div>
        <div class="widget"><h3>断言总数</h3><div class="val">${assertTotal}</div></div>
        <div class="widget ${assertFailed > 0 ? "failed" : "passed"}"><h3>失败断言</h3><div class="val">${assertFailed}</div></div>
        <div class="widget"><h3>平均响应</h3><div class="val" style="font-size:1.15rem">${fmtResponseMs(timings.responseAverage)}</div></div>
      </div>
      <div class="chart-card">
        <h3>断言分布</h3>
        <div class="chart-wrap"><canvas id="assertChart"></canvas></div>
      </div>
    </div>

    <div class="status-row">
      <span class="badge ${pass ? "ok" : "bad"}">${pass ? "Passed · 全部通过" : "Failed · 存在失败"}</span>
    </div>

    <section>
      <h2>接口汇总</h2>
      <p class="hint">按 <code>API_REPORT_GROUPS</code> 归类；下方为各接口分节明细（单文件 HTML）。</p>
      ${summaryTableHtml}
    </section>

    ${
      failBlocks.length
        ? `<section><h2 style="color:var(--allure-failed);border-color:rgba(253,90,62,.4)">失败详情</h2>${failBlocks
            .map(
              (f) =>
                `<div class="fail-card"><div class="fail-card-h">${esc(f.name)}</div><pre style="border:none;border-radius:0;background:transparent">${esc(f.msg)}</pre></div>`
            )
            .join("")}</section>`
        : ""
    }

    ${detailSectionsHtml}

    <footer>
      由 <code>scripts/newman-json-to-zh-html.mjs</code> 生成；字体与图表引用
      <a href="https://fonts.google.com" rel="noreferrer">Google Fonts</a>、
      <a href="https://www.chartjs.org" rel="noreferrer">Chart.js</a> CDN。
    </footer>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
  <script>
    (function () {
      if (typeof Chart === "undefined") return;
      var el = document.getElementById("assertChart");
      if (!el) return;
      var passed = ${assertPassed};
      var failed = ${assertFailed};
      if (passed === 0 && failed === 0) passed = 1;
      new Chart(el, {
        type: "doughnut",
        data: {
          labels: ["通过", "失败"],
          datasets: [{ data: [passed, failed], backgroundColor: ["#97cc64", "#fd5a3e"], borderWidth: 0, hoverOffset: 4 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          cutout: "62%",
          plugins: { legend: { position: "bottom", labels: { boxWidth: 12, padding: 10, font: { size: 11 } } } }
        }
      });
    })();
  </script>
</body>
</html>`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, "utf8");
console.log("已写入中文报告:", outPath);
