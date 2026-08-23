#!/usr/bin/env node
/**
 * 将 postman/skeletons/*.yaml 编译为 Newman 可跑的 collection JSON。
 * 用法：node scripts/yaml-to-postman.mjs [yaml...]
 * 无参数时编译 skeletons 目录下全部 yaml。
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skeletonsDir = join(root, 'postman/skeletons');

const args = process.argv.slice(2);
const files = args.length
  ? args.map((p) => resolve(root, p))
  : readdirSync(skeletonsDir)
      .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
      .map((f) => join(skeletonsDir, f));

if (!files.length) {
  console.error('没有可编译的 YAML');
  process.exit(1);
}

for (const file of files) {
  compile(file);
}

function compile(file) {
  const spec = load(readFileSync(file, 'utf8'));
  if (!spec?.output || !spec?.folders) {
    throw new Error(`${file}: 需要 output 与 folders`);
  }
  const out = join(root, spec.output);
  const collection = {
    info: {
      _postman_id: spec.postman_id || spec.id,
      name: spec.title || spec.id,
      description: generatedDescription(file, spec),
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    variable: [
      { key: 'apiBase', value: '' },
      { key: 'loginData', value: '' },
      { key: 'accessToken', value: '' },
      { key: 'managerToken', value: '' },
      { key: 'pendingApprovalId', value: '' }
    ],
    event: collectionEvents(),
    item: spec.folders.map(folderToItem)
  };
  writeFileSync(out, `${JSON.stringify(collection, null, 2)}\n`);
  console.log(`compiled ${file.replace(`${root}/`, '')} -> ${spec.output}`);
}

function generatedDescription(file, spec) {
  const rel = file.replace(`${root}/`, '');
  return [
    `由 \`${rel}\` 生成，不要手改本 JSON。修改 YAML 后执行 \`npm run pm:skeleton:compile\`。`,
    spec.controller ? `Controller：\`${spec.controller}\`` : ''
  ]
    .filter(Boolean)
    .join('\n\n');
}

function folderToItem(folder) {
  return {
    name: folder.name,
    item: (folder.cases || []).map(caseToItem)
  };
}

function caseToItem(c) {
  const tag = c.kind === 'err' ? '[err]' : '[ok]';
  const name = `${tag} ${c.id} ${c.name}`;
  const event = [];
  const pre = prerequestLines(c);
  if (pre.length) {
    event.push(scriptEvent('prerequest', pre));
  }
  event.push(scriptEvent('test', testLines(c)));
  return {
    name,
    event,
    request: buildRequest(c)
  };
}

function prerequestLines(c) {
  const lines = [];
  if (c.login_as === 'manager' || c.login_as === 'bd') {
    const emailKey = c.login_as === 'manager' ? 'managerEmail' : 'bdEmail';
    const passKey = c.login_as === 'manager' ? 'managerPassword' : 'bdPassword';
    lines.push(
      `const email = pm.environment.get('${emailKey}');`,
      `const password = pm.environment.get('${passKey}');`,
      "const brokerId = pm.environment.get('brokerId') || '1';",
      'const plain = JSON.stringify({ email, password, broker_id: Number(brokerId) });',
      "pm.collectionVariables.set('loginData', JSON.stringify(plain));"
    );
  }
  if (c.auth === 'none') {
    lines.push("pm.request.headers.remove('Authorization');");
  }
  if (c.skip) {
    lines.push(...skipGuardLines(c.skip, true));
  }
  return lines;
}

function skipGuardLines(skip, inPrerequest) {
  const envKey = skip.env || 'runApprovalDecision';
  const varKey = skip.var || 'pendingApprovalId';
  const lines = [
    `const id = (pm.environment.get('${varKey}') || pm.collectionVariables.get('${varKey}') || '').trim();`,
    `const run = String(pm.environment.get('${envKey}') || '').toLowerCase() === 'true';`,
    'if (!run || !id) {'
  ];
  if (inPrerequest) {
    lines.push(
      `  console.log('跳过：设置 ${envKey}=true 且提供 ${varKey}');`,
      '  if (typeof pm.execution !== "undefined" && pm.execution.skipRequest) {',
      '    pm.execution.skipRequest();',
      '  }',
      '}'
    );
  } else {
    lines.push(
      `  pm.test('已跳过（未开启 ${envKey} 或无 ${varKey}）', () => {`,
      '    pm.expect(true).to.be.true;',
      '  });',
      '  return;',
      '}'
    );
  }
  return lines;
}

function testLines(c) {
  const lines = [];
  if (c.skip) {
    lines.push(...skipGuardLines(c.skip, false));
  }
  const http = c.then?.http ?? 200;
  const ret = c.then?.ret_code;
  lines.push(`pm.test('HTTP ${http}', () => pm.response.to.have.status(${http}));`);
  lines.push('const body = pm.response.json();');
  if (ret !== undefined && ret !== null) {
    lines.push(`pm.test('ret_code=${ret}', () => pm.expect(body.ret_code).to.eql(${ret}));`);
  }
  const asserts = c.asserts || [];
  if (asserts.some((a) => String(a.path || '').startsWith('result') || a.type === 'result_keys' || a.type === 'result_null' || a.type === 'save_pending_id' || a.type === 'list_field' || a.type === 'list_max')) {
    lines.push('const r = body.result || {};');
  }
  for (const a of asserts) {
    lines.push(...assertLines(a, c));
  }
  if (c.login_as === 'manager') {
    lines.push(
      "pm.collectionVariables.set('managerToken', body.token);",
      "pm.environment.set('managerToken', body.token);"
    );
  } else if (c.login_as === 'bd') {
    lines.push(
      "pm.collectionVariables.set('accessToken', body.token);",
      "pm.environment.set('accessToken', body.token);"
    );
  }
  return lines;
}

function resultExpr(path) {
  if (!path || path === 'result') {
    return 'r';
  }
  if (path.startsWith('result.')) {
    return `r${path
      .slice('result'.length)
      .split('.')
      .map((p) => (/^\d+$/.test(p) ? `[${p}]` : `.${p}`))
      .join('')}`;
  }
  return `body.${path}`;
}

function jsValue(v) {
  return JSON.stringify(v);
}

function assertLines(a) {
  switch (a.type) {
    case 'token_nonempty':
      return [
        "pm.test('token 非空', () => {",
        "  pm.expect(body.token).to.be.a('string').and.not.eql('');",
        "  pm.expect(body.result.token).to.eql(body.token);",
        '});'
      ];
    case 'result_keys':
      return [
        `pm.test('分页结构', () => {`,
        `  pm.expect(r).to.include.keys(${a.keys.map(jsValue).join(', ')});`,
        "  pm.expect(r.list).to.be.an('array');",
        '});'
      ];
    case 'eql':
      return [`pm.test('${a.path}=${a.value}', () => pm.expect(${resultExpr(a.path)}).to.eql(${jsValue(a.value)}));`];
    case 'is_array':
      return [`pm.test('${a.path} 为数组', () => pm.expect(${resultExpr(a.path)}).to.be.an('array'));`];
    case 'list_field':
      return [
        `(${resultExpr(a.path)} || []).forEach((it) => {`,
        `  pm.expect(it.${a.field}).to.eql(${jsValue(a.value)});`,
        '});'
      ];
    case 'list_max':
      return [
        `pm.test('${a.path}.length<=${a.value}', () => {`,
        `  pm.expect((${resultExpr(a.path)} || []).length).to.be.at.most(${a.value});`,
        '});'
      ];
    case 'result_null':
      return ["pm.test('result 为 null', () => pm.expect(body.result).to.eql(null));"];
    case 'save_pending_id':
      return [
        "const envId = (pm.environment.get('pendingApprovalId') || '').trim();",
        'if (envId) {',
        "  pm.collectionVariables.set('pendingApprovalId', envId);",
        '} else if (r.list && r.list.length > 0 && r.list[0].id != null) {',
        "  pm.collectionVariables.set('pendingApprovalId', String(r.list[0].id));",
        '}'
      ];
    default:
      throw new Error(`未知 asserts.type: ${a.type}`);
  }
}

function buildRequest(c) {
  const when = c.when || {};
  const req = {
    method: when.method || 'GET',
    header: [],
    url: buildUrl(when)
  };
  if (c.login_as) {
    req.body = {
      mode: 'raw',
      raw: '{\n  "data": {{loginData}},\n  "broker_id": {{brokerId}}\n}'
    };
  } else if (when.body && typeof when.body === 'object') {
    req.body = {
      mode: 'raw',
      raw: JSON.stringify(when.body, null, 2)
    };
  }
  return req;
}

function buildUrl(when) {
  const path = when.path || '/';
  const q = when.query || {};
  const keys = Object.keys(q);
  const qs = keys.length
    ? `?${keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(q[k]))}`).join('&')}`
    : '';
  return `{{apiBase}}${path}${qs}`;
}

function scriptEvent(listen, lines) {
  return {
    listen,
    script: {
      type: 'text/javascript',
      exec: lines
    }
  };
}

function collectionEvents() {
  return [
    scriptEvent('prerequest', [
      "pm.request.headers.upsert({ key: 'Accept', value: 'application/json' });",
      "if (pm.request.body && pm.request.body.mode === 'raw') {",
      "  pm.request.headers.upsert({ key: 'Content-Type', value: 'application/json' });",
      '}',
      "const referer = (pm.environment.get('referer') || '').trim();",
      'if (referer) {',
      "  pm.request.headers.upsert({ key: 'Referer', value: referer });",
      '}',
      "const name = (pm.info && pm.info.requestName) || '';",
      'const url = pm.request.url.toString();',
      'const useManager = /Manager 登录/.test(name)',
      '  || (/\\/leads\\/approvals/i.test(url) && !/BD token|无\\s*Token/.test(name));',
      'const token = useManager',
      "  ? (pm.environment.get('managerToken') || pm.collectionVariables.get('managerToken') || '')",
      "  : (pm.environment.get('accessToken') || pm.collectionVariables.get('accessToken') || '');",
      "const needsAuth = /\\/leads\\/approvals/i.test(url);",
      "const skipAuth = /无\\s*Token/.test(name);",
      'if (needsAuth && token && !skipAuth) {',
      "  pm.request.headers.upsert({ key: 'Authorization', value: 'Bearer ' + token.trim() });",
      '}'
    ]),
    scriptEvent('test', [
      'if (!pm.response || pm.response.code === undefined) {',
      "  const err = (pm.response && pm.response.reason && pm.response.reason().message) || '请求失败';",
      "  pm.test('请求可达（请检查 apiBase 是否为真实地址）', () => {",
      '    pm.expect.fail(err);',
      '  });',
      '  return;',
      '}',
      "const ct = (pm.response.headers.get('Content-Type') || '').toLowerCase();",
      "const text = pm.response.text() || '';",
      "if (ct.includes('text/html') || text.trimStart().startsWith('<!')) {",
      "  pm.test('响应应为 JSON API（非 HTML）', () => {",
      "    pm.expect.fail('got HTML — 请检查 apiBase 是否正确');",
      '  });',
      '  return;',
      '}',
      'try {',
      '  const body = pm.response.json();',
      "  if (body && body.ret_code === 0 && typeof body.token === 'string' && body.token) {",
      "    const n = (pm.info && pm.info.requestName) || '';",
      '    if (/Manager 登录/.test(n)) {',
      "      pm.environment.set('managerToken', body.token);",
      "      pm.collectionVariables.set('managerToken', body.token);",
      "    } else if (/login/i.test(pm.request.url.toString())) {",
      "      pm.environment.set('accessToken', body.token);",
      "      pm.collectionVariables.set('accessToken', body.token);",
      '    }',
      '  }',
      '} catch (e) { /* ignore */ }'
    ])
  ];
}
