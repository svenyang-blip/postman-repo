#!/usr/bin/env node
/**
 * 从 Newman JSON 生成 Controller 中文 HTML 报告。
 *
 * 用法：
 *   node scripts/newman-json-to-zh-html.mjs <输入.json> <输出.html> [--controller <registry-id>]
 *
 * 生成后请运行：node scripts/build-reports-index.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const argv = process.argv.slice(2);
let controllerId = null;
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--controller" && argv[i + 1]) {
    controllerId = argv[++i];
  } else {
    positional.push(argv[i]);
  }
}

const inPath = path.resolve(positional[0] || path.join(root, "reports/newman-event-list.json"));
const outPath = path.resolve(positional[1] || path.join(root, "reports/controllers/pm-ce-event-list.html"));

const registry = JSON.parse(fs.readFileSync(path.join(__dirname, "report-registry.json"), "utf8"));
const controllerMeta =
  registry.controllers.find((c) => c.id === controllerId) ||
  registry.controllers.find((c) => path.join(root, c.json) === inPath) ||
  null;

const MAX_PAYLOAD_CHARS = 1800;
const SKIP_HEADER_KEYS = new Set([
  "User-Agent", "Accept", "Cache-Control", "Postman-Token", "Host", "Accept-Encoding", "Connection", "Content-Length",
]);

const DEFAULT_API_GROUPS = [
  { id: "categories", pathIncludes: "/ce/pm/v1/api/categories", summaryLabel: "GET /categories" },
  { id: "eventList", pathIncludes: "/ce/pm/v1/api/event/list", summaryLabel: "GET /event/list" },
  { id: "other", pathIncludes: null, summaryLabel: "其它" },
];

const API_REPORT_GROUPS = controllerMeta?.apiGroups?.length
  ? controllerMeta.apiGroups
  : DEFAULT_API_GROUPS;

function decodeResponseBody(response) {
  if (!response) return "";
  if (typeof response.body === "string") return response.body;
  const stream = response.stream;
  if (stream?.data && Array.isArray(stream.data)) return Buffer.from(stream.data).toString("utf8");
  if (stream?.data && typeof stream.data === "string") return stream.data;
  return "";
}

function prettyJson(text) {
  const t = String(text ?? "").trim();
  if (!t) return "";
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return t;
  }
}

function truncateText(text, max = MAX_PAYLOAD_CHARS) {
  const s = String(text ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…（已截断，全文 ${s.length} 字符）`;
}

function formatPayload(text) {
  if (!text) return "";
  return truncateText(prettyJson(text));
}

function buildRequestUrl(req) {
  if (!req?.url) return "—";
  if (typeof req.url === "string") return req.url;
  const u = req.url;
  let proto = "";
  if (u.protocol) proto = String(u.protocol).endsWith("://") ? u.protocol : `${u.protocol}://`;
  const host = Array.isArray(u.host) ? u.host.join(".") : u.host || "";
  const port = u.port ? `:${u.port}` : "";
  const pathPart = Array.isArray(u.path) ? `/${u.path.join("/")}` : u.path || "";
  const query = (u.query || [])
    .filter((q) => q.key)
    .map((q) => `${encodeURIComponent(q.key)}=${encodeURIComponent(q.value ?? "")}`)
    .join("&");
  return `${proto}${host}${port}${pathPart}${query ? `?${query}` : ""}`;
}

function apiPathLabel(url, method) {
  const s = String(url);
  try {
    const u = new URL(s);
    return `${method} ${u.pathname}${u.search}`;
  } catch {
    const m = s.match(/\/private\/v1\/pm[^\s?]*/);
    if (m) return `${method} ${m[0]}`;
    const m2 = s.match(/\/ce\/pm\/v1\/api[^\s?]*/);
    if (m2) return `${method} ${m2[0]}`;
    return `${method} ${s.slice(0, 80)}`;
  }
}

function pickHeaders(headers) {
  if (!Array.isArray(headers)) return [];
  return headers
    .filter((h) => h.key && !h.system && !SKIP_HEADER_KEYS.has(h.key))
    .map((h) => `${h.key}: ${h.value}`);
}

function getRequestBody(req) {
  const body = req?.body;
  if (!body) return "";
  if (body.mode === "raw" && body.raw) return body.raw;
  return "";
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

function fmtVal(v) {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** 从 Responses 壳提取测试最关心的字段 */
function extractHighlights(bodyText) {
  const highlights = [];
  try {
    const j = JSON.parse(String(bodyText || "").trim());
    if (j.ret_code != null) highlights.push({ k: "ret_code", v: j.ret_code, important: true });
    if (j.ret_msg) highlights.push({ k: "ret_msg", v: j.ret_msg, important: j.ret_code !== 0 });
    const r = j.result;
    if (r == null) return highlights;

    if (Array.isArray(r)) {
      highlights.push({ k: "result", v: `数组 ${r.length} 条` });
      if (r[0] && typeof r[0] === "object") {
        for (const k of ["id", "status", "name", "valid"]) {
          if (r[0][k] != null) highlights.push({ k: `[0].${k}`, v: r[0][k] });
        }
      }
      return highlights;
    }

    if (r.items && Array.isArray(r.items)) {
      highlights.push({ k: "items", v: `${r.items.length} 条`, important: true });
      if (r.total != null) highlights.push({ k: "total", v: r.total });
      const first = r.items[0];
      if (first) {
        for (const k of [
          "id", "status", "eventId", "seriesSlug", "asset", "valid", "syncRunId",
          "successCount", "failedCount", "workflowStatus", "captureStatus",
        ]) {
          if (first[k] != null) highlights.push({ k: `items[0].${k}`, v: first[k] });
        }
      }
      return highlights;
    }

    const priority = [
      "id", "status", "valid", "syncRunId", "message", "name", "seriesSlug", "asset",
      "autoSyncEnabled", "autoOnlineVolumeThreshold", "onlineCount", "manualCount",
      "eventId", "successCount", "failedCount", "total", "triggerType",
      "fetchedCount", "insertedCount", "updatedCount", "failedCount",
    ];
    for (const k of priority) {
      if (r[k] != null && r[k] !== "") highlights.push({ k, v: r[k], important: ["id", "status", "valid", "syncRunId"].includes(k) });
    }
    for (const k of Object.keys(r)) {
      if (priority.includes(k)) continue;
      const v = r[k];
      if (v != null && typeof v !== "object" && highlights.length < 12) {
        highlights.push({ k, v });
      }
    }
  } catch {
    /* 非 JSON */
  }
  return highlights;
}

function highlightsHtml(highlights) {
  if (!highlights.length) return '<span class="muted">—</span>';
  return highlights
    .map((h) => {
      const cls = h.important ? "kv important" : "kv";
      return `<span class="${cls}"><b>${esc(h.k)}</b>=${esc(fmtVal(h.v))}</span>`;
    })
    .join("");
}

function highlightsText(highlights) {
  if (!highlights.length) return "—";
  return highlights.map((h) => `${h.k}=${fmtVal(h.v)}`).join(" · ");
}

function buildPayloadBlock(label, content) {
  if (!content) return "";
  return `<div class="payload-block">
        <div class="payload-label">${esc(label)}</div>
        <pre class="payload">${esc(content)}</pre>
      </div>`;
}

function buildReqResHtml(req, res, method, url, code) {
  const reqUrl = buildRequestUrl(req) !== "—" ? buildRequestUrl(req) : url;
  const reqHeaders = pickHeaders(req?.header);
  const reqBody = getRequestBody(req);
  const reqLines = [`${method} ${reqUrl}`];
  if (reqHeaders.length) reqLines.push(...reqHeaders);
  const reqText = reqLines.join("\n") + (reqBody ? `\n\n${formatPayload(reqBody)}` : "");

  const resBodyRaw = decodeResponseBody(res);
  const resLines = [`HTTP ${code}`];
  const ct = (res?.header || []).find((h) => h.key?.toLowerCase() === "content-type");
  if (ct) resLines.push(`Content-Type: ${ct.value}`);
  const resText = resLines.join("\n") + (resBodyRaw ? `\n\n${formatPayload(resBodyRaw)}` : "");

  return buildPayloadBlock("请求", reqText) + buildPayloadBlock("响应", resText);
}

const raw = fs.readFileSync(inPath, "utf8");
const data = JSON.parse(raw);
const run = data.run;
if (!run) {
  console.error("JSON 中缺少 run 字段");
  process.exit(1);
}

const collectionName = data.collection?.info?.name || "Postman 集合";
const reportTitle = controllerMeta?.title || collectionName;
const reportSubtitle = controllerMeta?.controller || collectionName;
const collection = data.collection || {};
const stats = run.stats || {};
const timings = run.timings || {};
const executions = run.executions || [];
const failures = run.failures || [];
const generatedAt = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

const pass =
  (stats.assertions?.failed ?? 0) === 0 &&
  (stats.requests?.failed ?? 0) === 0 &&
  failures.length === 0;

function buildRequestFolderMap(items) {
  const map = new Map();
  function walk(nodes, folderName) {
    for (const node of nodes || []) {
      if (Array.isArray(node.item)) walk(node.item, node.name || folderName || "未分组");
      else if (node.id) map.set(node.id, folderName || "未分组");
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
  const url = buildRequestUrl(ex.request) || ex.request?.url?.raw || ex.request?.url || "—";
  const apiLabel = apiPathLabel(url, method);
  const code = ex.response?.code ?? "—";
  const rt = ex.response?.responseTime ?? "—";
  const size = ex.response?.responseSize ?? "—";
  const resBodyRaw = decodeResponseBody(ex.response);
  const highlights = extractHighlights(resBodyRaw);
  const assertions = (ex.assertions || []).map((a) => {
    const err = a.error;
    const ok = !err;
    return { name: a.assertion || "断言", ok, err: err ? String(err.message || err) : "" };
  });
  const assertFail = assertions.filter((a) => !a.ok).length;
  const reqResHtml = buildReqResHtml(ex.request, ex.response, method, url, code);
  const anchor = `req-${idx + 1}`;
  return {
    idx: idx + 1, name, folder, method, url, apiLabel, code, rt, size,
    highlights, highlightsText: highlightsText(highlights), assertions, assertFail, reqResHtml, anchor,
  };
});

const folderOrder = [];
const folderToRows = new Map();
for (const r of rows) {
  if (!folderToRows.has(r.folder)) {
    folderOrder.push(r.folder);
    folderToRows.set(r.folder, []);
  }
  folderToRows.get(r.folder).push(r);
}

function inferApiGroupId(url, method) {
  const s = String(url);
  for (const g of API_REPORT_GROUPS) {
    if (g.id === "other") continue;
    if (g.method && g.method !== method) continue;
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
          return `<details class="details-req" id="${esc(r.anchor)}"${openReq}>
      <summary><span class="sum-title"><span class="status-dot ${dotClass}"></span>${esc(r.name)}</span><span class="sum-meta">${esc(r.apiLabel)} · HTTP ${esc(r.code)} · ${fmtResponseMs(r.rt)}${failBadge}</span></summary>
      <div class="details-body">
        <div class="focus-card">
          <div class="focus-title">测试要点</div>
          <div class="kv-grid">${highlightsHtml(r.highlights)}</div>
        </div>
        <div class="meta">响应体积 ${esc(r.size)} 字节</div>
        <div class="meta">${esc(r.url)}</div>
        ${r.reqResHtml}
        <table>
          <tbody>
            ${r.assertions.map((a) => `
            <tr>
              <th>断言</th>
              <td class="${a.ok ? "assert-ok" : "assert-bad"}">${a.ok ? "通过" : "失败"} — ${esc(a.name)}${a.err ? `<br/><small>${esc(a.err)}</small>` : ""}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </details>`;
        })
        .join("\n");
      const folderMeta = fails > 0
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
  const keys = new Set(list.map((r) => inferApiGroupId(r.url, r.method)));
  if (keys.size === 1) foldersByGroupId[[...keys][0]].push(folder);
  else foldersByGroupId.other.push(folder);
}

function aggregateByApi(rows) {
  const agg = {};
  for (const g of API_REPORT_GROUPS) agg[g.id] = { label: g.summaryLabel, reqs: 0, assertTotal: 0, assertFail: 0 };
  for (const r of rows) {
    const k = inferApiGroupId(r.url, r.method);
    agg[k].reqs += 1;
    agg[k].assertTotal += r.assertions.length;
    agg[k].assertFail += r.assertFail;
  }
  return agg;
}

const byApi = aggregateByApi(rows);

const summaryTableRows = API_REPORT_GROUPS.map((g) => {
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
}).join("\n");

const caseOverviewRows = rows.map((r) => {
  const ok = r.assertFail === 0 && Number(r.code) >= 200 && Number(r.code) < 400;
  const retCode = r.highlights.find((h) => h.k === "ret_code");
  const retDisplay = retCode != null
    ? `<span class="${retCode.v === 0 ? "assert-ok" : "assert-bad"}">${esc(retCode.v)}</span>`
    : "—";
  return `<tr class="${ok ? "" : "row-fail"}">
    <td>${r.idx}</td>
    <td><a href="#${esc(r.anchor)}">${esc(r.name)}</a><div class="row-folder">${esc(r.folder)}</div></td>
    <td><code class="api-code">${esc(r.apiLabel)}</code></td>
    <td>${esc(r.code)}</td>
    <td>${retDisplay}</td>
    <td class="focus-cell">${highlightsHtml(r.highlights)}</td>
    <td>${r.assertions.length}</td>
    <td class="${r.assertFail ? "assert-bad" : "assert-ok"}">${r.assertFail || "0"}</td>
    <td>${fmtResponseMs(r.rt)}</td>
  </tr>`;
}).join("\n");

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
    parts.push(`<section id="api-${esc(g.id)}">
    <h2>${num}${esc(g.summaryLabel)}</h2>
    ${body}
  </section>`);
  }
  if ((foldersByGroupId.other || []).length) {
    parts.push(`<section id="api-other">
    <h2>其它请求</h2>
    ${buildFolderSectionsHtml(foldersByGroupId.other)}
  </section>`);
  }
  return parts.join("\n\n");
}

const failBlocks = failures.map((f, i) => ({
  name: f.source?.name || f.error?.name || `失败项 ${i + 1}`,
  msg: f.error?.message || f.error?.test || JSON.stringify(f.error || f, null, 2),
}));

const assertTotal = stats.assertions?.total ?? 0;
const assertFailed = stats.assertions?.failed ?? 0;
const assertPassed = Math.max(0, assertTotal - assertFailed);

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(reportTitle)} · Newman 报告</title>
  <style>
    :root {
      --bg: #f2f2f2; --surface: #fff; --border: #e5e5e5; --text: #333; --muted: #888;
      --header: #1e293b; --passed: #16a34a; --failed: #dc2626; --accent: #2563eb;
      --shadow: 0 1px 3px rgba(0,0,0,.08); --radius: 6px;
    }
    * { box-sizing: border-box; }
    body { margin:0; font-family: ui-sans-serif, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; font-size: 14px; }
    .topbar { background: var(--header); color: #fff; padding: 16px clamp(16px,4vw,40px); }
    .topbar h1 { margin: 0 0 4px; font-size: 1.3rem; }
    .topbar .sub { color: rgba(255,255,255,.75); font-size: .85rem; }
    .topbar a { color: #93c5fd; text-decoration: none; font-size: .85rem; }
    .topbar a:hover { text-decoration: underline; }
    .page { padding: 20px clamp(16px,4vw,40px) 48px; max-width: 1320px; margin: 0 auto; }
    .widgets { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .widget { background: var(--surface); border-radius: var(--radius); padding: 12px 14px; border-left: 4px solid var(--accent); box-shadow: var(--shadow); }
    .widget h3 { margin: 0 0 6px; font-size: .7rem; text-transform: uppercase; color: var(--muted); }
    .widget .val { font-size: 1.5rem; font-weight: 700; }
    .widget.passed { border-left-color: var(--passed); } .widget.passed .val { color: var(--passed); }
    .widget.failed { border-left-color: var(--failed); } .widget.failed .val { color: var(--failed); }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: .8rem; font-weight: 600; color: #fff; margin-bottom: 20px; }
    .badge.ok { background: var(--passed); } .badge.bad { background: var(--failed); }
    section { margin-top: 28px; }
    section h2 { font-size: .92rem; font-weight: 600; text-transform: uppercase; color: var(--muted); margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid var(--border); }
    .hint { color: var(--muted); font-size: .82rem; margin: -6px 0 12px; }
    table { width: 100%; border-collapse: collapse; font-size: .86rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow); }
    th, td { padding: 9px 11px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
    th { background: #fafafa; color: var(--muted); font-size: .72rem; text-transform: uppercase; font-weight: 600; }
    tr:last-child td { border-bottom: none; }
    tr.row-fail { background: #fff5f5; }
    .row-folder { font-size: .75rem; color: var(--muted); }
    .api-code { font-size: .78rem; word-break: break-all; }
    .focus-cell .kv { display: inline-block; margin: 2px 6px 2px 0; padding: 2px 6px; background: #f3f4f6; border-radius: 4px; font-size: .78rem; }
    .focus-cell .kv.important { background: #eff6ff; border: 1px solid #bfdbfe; }
    .focus-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: var(--radius); padding: 10px 12px; margin-bottom: 10px; }
    .focus-title { font-size: .72rem; font-weight: 600; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
    .kv-grid .kv { display: inline-block; margin: 3px 8px 3px 0; font-size: .82rem; }
    .kv-grid .kv.important b { color: var(--accent); }
    .summary-api code { font-size: .82rem; }
    details.details-folder, details.details-req { border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 8px; background: var(--surface); box-shadow: var(--shadow); }
    details > summary { list-style: none; cursor: pointer; padding: 10px 14px; display: flex; flex-wrap: wrap; gap: 8px 14px; user-select: none; background: #fafafa; }
    details[open] > summary { border-bottom: 1px solid var(--border); }
    details > summary::-webkit-details-marker { display: none; }
    details > summary::before { content: "▸"; color: var(--muted); margin-right: 6px; transition: transform .15s; }
    details[open] > summary::before { transform: rotate(90deg); }
    .folder-inner { padding: 8px 10px 10px; }
    details.details-req { margin-left: 10px; }
    .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
    .status-dot.passed { background: var(--passed); } .status-dot.failed { background: var(--failed); }
    .sum-meta, .folder-meta, .meta { color: var(--muted); font-size: .8rem; }
    .sum-title { font-weight: 600; }
    .details-body { padding: 12px; }
    .payload { max-height: 280px; overflow: auto; background: #f8f8f8; border: 1px solid var(--border); border-radius: var(--radius); padding: 10px; font-size: .78rem; white-space: pre-wrap; word-break: break-word; }
    .payload-label { font-size: .7rem; font-weight: 600; color: var(--muted); margin: 10px 0 4px; text-transform: uppercase; }
    .fail-card { border-left: 4px solid var(--failed); background: #fff5f5; padding: 12px; margin-bottom: 10px; border-radius: var(--radius); }
    .assert-ok { color: var(--passed); font-weight: 600; }
    .assert-bad { color: var(--failed); font-weight: 600; }
    .bad { color: var(--failed); font-weight: 600; }
    .ok-inline { color: var(--passed); }
    .muted { color: var(--muted); }
    footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid var(--border); color: var(--muted); font-size: .78rem; }
    footer a { color: var(--accent); }
  </style>
</head>
<body>
  <div class="topbar">
    <p><a href="../index.html">← 返回汇总</a></p>
    <h1>${esc(reportTitle)}</h1>
    <div class="sub">${esc(reportSubtitle)} · ${esc(collectionName)} · 生成 ${esc(generatedAt)}</div>
  </div>
  <div class="page">
    <div class="widgets">
      <div class="widget"><h3>请求</h3><div class="val">${stats.requests?.total ?? 0}</div></div>
      <div class="widget"><h3>断言</h3><div class="val">${assertTotal}</div></div>
      <div class="widget ${assertFailed > 0 ? "failed" : "passed"}"><h3>失败断言</h3><div class="val">${assertFailed}</div></div>
      <div class="widget"><h3>平均耗时</h3><div class="val" style="font-size:1rem">${fmtResponseMs(timings.responseAverage)}</div></div>
    </div>
    <span class="badge ${pass ? "ok" : "bad"}">${pass ? "全部通过" : "存在失败"}</span>

    <section>
      <h2>用例一览（测试要点）</h2>
      <p class="hint">点击用例名跳转明细；<code>ret_code</code> 与 <code>result</code> 关键字段已提取。</p>
      <table class="case-overview">
        <thead><tr>
          <th>#</th><th>用例</th><th>API</th><th>HTTP</th><th>ret_code</th>
          <th>测试要点</th><th>断言</th><th>失败</th><th>耗时</th>
        </tr></thead>
        <tbody>${caseOverviewRows}</tbody>
      </table>
    </section>

    <section>
      <h2>接口汇总</h2>
      <table class="summary-api">
        <thead><tr><th>接口</th><th>用例</th><th>断言</th><th>失败</th><th>结果</th></tr></thead>
        <tbody>${summaryTableRows}</tbody>
      </table>
    </section>

    ${failBlocks.length ? `<section><h2>失败详情</h2>${failBlocks.map((f) => `<div class="fail-card"><strong>${esc(f.name)}</strong><pre class="payload">${esc(f.msg)}</pre></div>`).join("")}</section>` : ""}

    <section><h2>分节明细</h2>${buildDetailSectionsHtml()}</section>

    <footer>由 <code>newman-json-to-zh-html.mjs</code> 生成${controllerMeta ? ` · registry <code>${esc(controllerMeta.id)}</code>` : ""}</footer>
  </div>
</body>
</html>`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, "utf8");
console.log("已写入报告:", outPath);

// 自动刷新汇总页
import { spawnSync } from "child_process";
const idx = path.join(__dirname, "build-reports-index.mjs");
spawnSync(process.execPath, [idx], { stdio: "inherit" });
