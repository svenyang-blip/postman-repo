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
          return `<details class="details-req"${openReq}>
      <summary><span class="sum-title">${esc(r.name)}</span><span class="sum-meta">HTTP ${esc(r.code)} · ${fmtResponseMs(
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

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Newman 合并报告 · ${esc(collectionName)}</title>
  <style>
    :root { --bg:#0f1419; --card:#1a2332; --text:#e6edf3; --muted:#8b9cb3; --ok:#3fb950; --bad:#f85149; --line:#30363d; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: ui-sans-serif, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif; background:var(--bg); color:var(--text); line-height:1.5; padding:24px; }
    h1 { font-size:1.35rem; margin:0 0 8px; font-weight:600; }
    .sub { color:var(--muted); font-size:.9rem; margin-bottom:24px; }
    .badge { display:inline-block; padding:4px 10px; border-radius:999px; font-size:.8rem; font-weight:600; }
    .badge.ok { background:#1f3d2a; color:var(--ok); }
    .badge.bad { background:#3d1f1f; color:var(--bad); }
    .grid { display:grid; gap:16px; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); margin-bottom:24px; }
    .card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; }
    .card h3 { margin:0 0 8px; font-size:.75rem; text-transform:none; color:var(--muted); font-weight:500; letter-spacing:.02em; }
    .card .val { font-size:1.4rem; font-weight:700; }
    section { margin-top:28px; }
    section h2 { font-size:1.05rem; border-bottom:1px solid var(--line); padding-bottom:8px; margin-bottom:12px; }
    .summary-api { width:100%; border-collapse:collapse; font-size:.9rem; margin-bottom:8px; background:var(--card); border:1px solid var(--line); border-radius:10px; overflow:hidden; }
    .summary-api th, .summary-api td { padding:12px 14px; border-bottom:1px solid var(--line); }
    .summary-api th { color:var(--muted); font-weight:500; text-align:left; background:#161b22; }
    .summary-api tr:last-child td, .summary-api tr:last-child th { border-bottom:none; }
    .summary-api code { font-size:.85rem; }
    .hint { color:var(--muted); font-size:.82rem; margin:-8px 0 16px; }
    details.details-folder { border:1px solid var(--line); border-radius:10px; margin-bottom:12px; background:var(--card); }
    details.details-folder > summary {
      list-style: none; cursor: pointer; padding:12px 16px; font-weight:600; display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px;
      user-select: none;
    }
    details.details-folder > summary::-webkit-details-marker { display: none; }
    details.details-folder > summary::before { content: "▸"; display:inline-block; width:1em; color:var(--muted); transition: transform .15s; }
    details.details-folder[open] > summary::before { transform: rotate(90deg); }
    .folder-title { font-size:1rem; }
    .folder-meta { font-size:.85rem; color:var(--muted); font-weight:400; }
    .folder-inner { padding:0 12px 12px 12px; border-top:1px solid var(--line); }
    details.details-req { border:1px solid var(--line); border-radius:8px; margin-bottom:8px; background:#0d1117; }
    details.details-req > summary {
      list-style: none; cursor: pointer; padding:10px 14px; display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px; font-size:.92rem;
      user-select: none;
    }
    details.details-req > summary::-webkit-details-marker { display: none; }
    details.details-req > summary::before { content: "▸"; color:var(--muted); width:1em; display:inline-block; transition: transform .15s; }
    details.details-req[open] > summary::before { transform: rotate(90deg); }
    .sum-title { font-weight:600; }
    .sum-meta { color:var(--muted); font-size:.82rem; font-weight:400; }
    .details-body { padding:0 14px 14px; border-top:1px solid var(--line); }
    .req { border:1px solid var(--line); border-radius:10px; margin-bottom:16px; overflow:hidden; }
    .req-h { background:var(--card); padding:12px 16px; border-bottom:1px solid var(--line); }
    .req-h strong { font-size:1rem; }
    .meta { color:var(--muted); font-size:.85rem; margin-top:6px; word-break:break-all; }
    table { width:100%; border-collapse:collapse; font-size:.9rem; }
    th, td { text-align:left; padding:10px 16px; border-bottom:1px solid var(--line); }
    th { color:var(--muted); font-weight:500; width:28%; }
    tr:last-child td, tr:last-child th { border-bottom:none; }
    .assert-ok { color:var(--ok); }
    .assert-bad { color:var(--bad); }
    .ok-inline { color:var(--ok); font-weight:500; }
    pre { background:#010409; border:1px solid var(--line); border-radius:8px; padding:12px; overflow:auto; font-size:.8rem; color:var(--muted); }
    footer { margin-top:32px; color:var(--muted); font-size:.8rem; }
  </style>
</head>
<body>
  <h1>Newman 合并报告（多接口）</h1>
  <div class="sub">集合：${esc(collectionName)} · Newman 结束时间（北京时间）：${esc(
    fmtTs(timings.completed)
  )} · 本页生成：${esc(generatedAt)}<br/>同一次运行内，凡在 <code>scripts/newman-json-to-zh-html.mjs</code> 的 <code>API_REPORT_GROUPS</code> 中配置的路径，均汇总于本页；原始数据见 <code>reports/newman-event-list.json</code>。</div>
  <p><span class="badge ${pass ? "ok" : "bad"}">${pass ? "全部通过" : "存在失败"}</span></p>

  <div class="grid">
    <div class="card"><h3>迭代</h3><div class="val">${stats.iterations?.total ?? 0}</div></div>
    <div class="card"><h3>请求总数</h3><div class="val">${stats.requests?.total ?? 0}</div></div>
    <div class="card"><h3>失败请求</h3><div class="val">${stats.requests?.failed ?? 0}</div></div>
    <div class="card"><h3>断言总数</h3><div class="val">${stats.assertions?.total ?? 0}</div></div>
    <div class="card"><h3>失败断言</h3><div class="val">${stats.assertions?.failed ?? 0}</div></div>
    <div class="card"><h3>平均响应时间</h3><div class="val">${fmtResponseMs(timings.responseAverage)}</div></div>
  </div>

  <section>
    <h2>接口汇总</h2>
    <p class="hint">按请求 URL 与配置表 <code>API_REPORT_GROUPS</code> 归类；下方为各接口分节明细，仍为<strong>一份</strong> HTML。</p>
    ${summaryTableHtml}
  </section>

  ${
    failBlocks.length
      ? `<section><h2>失败详情</h2>${failBlocks
          .map(
            (f) =>
              `<div class="req"><div class="req-h"><strong>${esc(f.name)}</strong></div><pre>${esc(f.msg)}</pre></div>`
          )
          .join("")}</section>`
      : ""
  }

  ${detailSectionsHtml}

  <footer>
    由 postman-repo <code>scripts/newman-json-to-zh-html.mjs</code> 根据单次 Newman JSON 导出生成<strong>合并</strong>报告；不依赖外网 CDN。
  </footer>
</body>
</html>`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, "utf8");
console.log("已写入中文报告:", outPath);
