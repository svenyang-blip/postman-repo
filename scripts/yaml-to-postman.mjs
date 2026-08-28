#!/usr/bin/env node
/**
 * 将 postman/skeletons/<模块>/*.yaml 编译为 Newman 可跑的 collection JSON。
 * 用法：node scripts/yaml-to-postman.mjs [yaml...]
 * 无参数时递归编译 skeletons 下全部 yaml。
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skeletonsDir = join(root, 'postman/skeletons');

function listYamlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      out.push(...listYamlFiles(p));
    } else if (name.endsWith('.yaml') || name.endsWith('.yml')) {
      out.push(p);
    }
  }
  return out.sort();
}

const args = process.argv.slice(2);
const files = args.length
  ? args.map((p) => resolve(root, p))
  : listYamlFiles(skeletonsDir);

if (!files.length) {
  console.error('没有可编译的 YAML');
  process.exit(1);
}

const LOGIN = {
  manager: { email: 'managerEmail', pass: 'managerPassword', token: 'managerToken' },
  bd: { email: 'bdEmail', pass: 'bdPassword', token: 'accessToken' },
  kr_manager: { email: 'krManagerEmail', pass: 'krManagerPassword', token: 'krManagerToken' },
  kr_bd: { email: 'krBdEmail', pass: 'krBdPassword', token: 'krBdToken' }
};

const AUTH_TOKEN = {
  manager: 'managerToken',
  bd: 'accessToken',
  kr_manager: 'krManagerToken',
  kr_bd: 'krBdToken'
};

for (const file of files) {
  compile(file);
}

function compile(file) {
  const spec = load(readFileSync(file, 'utf8'));
  if (!spec?.output || !spec?.folders) {
    throw new Error(`${file}: 需要 output 与 folders`);
  }
  const extraVars = (spec.variables || []).map((key) => ({ key, value: '' }));
  const out = join(root, spec.output);
  mkdirSync(dirname(out), { recursive: true });
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
      { key: 'pendingApprovalId', value: '' },
      ...extraVars
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
  const creds = LOGIN[c.login_as];
  if (creds) {
    lines.push(
      `const email = pm.environment.get('${creds.email}');`,
      `const password = pm.environment.get('${creds.pass}');`,
      "const brokerId = pm.environment.get('brokerId') || '1';",
      'const plain = JSON.stringify({ email, password, broker_id: Number(brokerId) });',
      "pm.collectionVariables.set('loginData', JSON.stringify(plain));"
    );
  }
  const tokenKey = AUTH_TOKEN[c.auth];
  if (c.auth === 'none') {
    lines.push("pm.request.headers.remove('Authorization');");
  } else if (tokenKey) {
    lines.push(
      `const _tok = (pm.environment.get('${tokenKey}') || pm.collectionVariables.get('${tokenKey}') || '').trim();`,
      "if (_tok) {",
      "  pm.request.headers.upsert({ key: 'Authorization', value: 'Bearer ' + _tok });",
      '}'
    );
  }
  if (c.skip_unless) {
    lines.push(...skipUnlessLines(c.skip_unless, true));
  }
  if (c.skip) {
    lines.push(...skipGuardLines(c.skip, true));
  }
  return lines;
}

function skipUnlessLines(keys, inPrerequest) {
  const list = (Array.isArray(keys) ? keys : [keys]).map((k) => String(k));
  const lines = [
    `const _need = ${JSON.stringify(list)};`,
    'const _missing = _need.filter((k) => !String(pm.environment.get(k) || pm.collectionVariables.get(k) || "").trim());',
    'if (_missing.length) {'
  ];
  if (inPrerequest) {
    lines.push(
      "  console.log('跳过：缺少 ' + _missing.join(', '));",
      '  if (typeof pm.execution !== "undefined" && pm.execution.skipRequest) {',
      '    pm.execution.skipRequest();',
      '  }',
      '}'
    );
  } else {
    lines.push(
      "  pm.test('已跳过（缺少 ' + _missing.join(', ') + '）', () => {",
      '    pm.expect(true).to.be.true;',
      '  });',
      '  return;',
      '}'
    );
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

function needsResultAlias(asserts) {
  return (asserts || []).some((a) => {
    const t = a.type;
    const p = String(a.path || a.list || '');
    return (
      p.startsWith('result') ||
      [
        'result_keys',
        'result_null',
        'save_pending_id',
        'list_field',
        'list_max',
        'list_item_keys',
        'save_var',
        'save_list_match',
        'find_in_list',
        'list_not_id',
        'period_range'
      ].includes(t)
    );
  });
}

function testLines(c) {
  const lines = [];
  if (c.skip_unless) {
    lines.push(...skipUnlessLines(c.skip_unless, false));
  }
  if (c.skip) {
    lines.push(...skipGuardLines(c.skip, false));
  }
  const http = c.then?.http ?? 200;
  const ret = c.then?.ret_code;
  const retIn = c.then?.ret_code_in;
  lines.push(`pm.test('HTTP ${http}', () => pm.response.to.have.status(${http}));`);
  lines.push('const body = pm.response.json();');
  if (ret !== undefined && ret !== null) {
    lines.push(`pm.test('ret_code=${ret}', () => pm.expect(body.ret_code).to.eql(${ret}));`);
  } else if (Array.isArray(retIn) && retIn.length) {
    lines.push(
      `pm.test('ret_code in ${JSON.stringify(retIn)}', () => pm.expect(${JSON.stringify(retIn)}).to.include(body.ret_code));`
    );
  }
  const asserts = c.asserts || [];
  if (needsResultAlias(asserts)) {
    lines.push('const r = body.result || {};');
  }
  for (const a of asserts) {
    lines.push(...assertLines(a, c));
  }
  const creds = LOGIN[c.login_as];
  if (creds && creds.token) {
    lines.push(
      `pm.collectionVariables.set('${creds.token}', body.token);`,
      `pm.environment.set('${creds.token}', body.token);`
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
      .slice('result.'.length)
      .split('.')
      .map((p) => (/^\d+$/.test(p) ? `[${p}]` : `.${p}`))
      .join('')}`;
  }
  return `body.${path}`;
}

function jsValue(v) {
  return JSON.stringify(v);
}

function lookupVar(name, coerceNumber) {
  const raw = `(pm.environment.get(${jsValue(name)}) || pm.collectionVariables.get(${jsValue(name)}) || '')`;
  return coerceNumber ? `Number(${raw})` : raw;
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
    case 'is_null':
      return [`pm.test('${a.path} 为 null', () => pm.expect(${resultExpr(a.path)}).to.eql(null));`];
    case 'list_field': {
      const expected = a.value_from
        ? lookupVar(a.value_from, a.coerce === 'number')
        : jsValue(a.value);
      return [
        `pm.test('${a.path}[].${a.field}', () => {`,
        `  (${resultExpr(a.path)} || []).forEach((it) => {`,
        `    pm.expect(it.${a.field}).to.eql(${expected});`,
        '  });',
        '});'
      ];
    }
    case 'list_max':
      return [
        `pm.test('${a.path}.length<=${a.value}', () => {`,
        `  pm.expect((${resultExpr(a.path)} || []).length).to.be.at.most(${a.value});`,
        '});'
      ];
    case 'list_item_keys':
      return [
        `pm.test('${a.path}[] 含 ${a.keys.join('/')}', () => {`,
        `  pm.expect(${resultExpr(a.path)}).to.be.an('array');`,
        `  (${resultExpr(a.path)} || []).forEach((it) => {`,
        `    pm.expect(it).to.include.keys(${a.keys.map(jsValue).join(', ')});`,
        '  });',
        '});'
      ];
    case 'list_not_id':
      return [
        `pm.test('${a.path} 不含 id=' + ${lookupVar(a.var, false)}, () => {`,
        `  const nid = ${lookupVar(a.var, true)};`,
        `  const hit = (${resultExpr(a.path)} || []).some((it) => Number(it.id) === nid);`,
        '  pm.expect(hit).to.eql(false);',
        '});'
      ];
    case 'save_var': {
      const expr = resultExpr(a.path);
      const setBoth = [
        `  pm.collectionVariables.set(${jsValue(a.var)}, _v);`,
        `  if (!(pm.environment.get(${jsValue(a.var)}) || '').toString().trim()) {`,
        `    pm.environment.set(${jsValue(a.var)}, _v);`,
        '  }'
      ];
      if (a.if_empty) {
        return [
          `if (${expr} != null && ${expr} !== '') {`,
          `  const _v = String(${expr});`,
          `  const _env = (pm.environment.get(${jsValue(a.var)}) || '').toString().trim();`,
          `  const _col = (pm.collectionVariables.get(${jsValue(a.var)}) || '').toString().trim();`,
          '  if (!_col) {',
          `    pm.collectionVariables.set(${jsValue(a.var)}, _v);`,
          '  }',
          '  if (!_env) {',
          `    pm.environment.set(${jsValue(a.var)}, _v);`,
          '  }',
          '}'
        ];
      }
      return [
        `if (${expr} != null && ${expr} !== '') {`,
        `  const _v = String(${expr});`,
        ...setBoth,
        '}'
      ];
    }
    case 'save_list_match': {
      const listExpr = resultExpr(a.list || 'result.list');
      const pk = a.period_key;
      const uidVar = a.bd_user_id_from;
      return [
        `{`,
        `  const _list = ${listExpr} || [];`,
        uidVar ? `  const _uid = ${lookupVar(uidVar, true)};` : '  const _uid = null;',
        pk != null ? `  const _pk = ${jsValue(pk)};` : '  const _pk = null;',
        '  const hit = _list.find((it) => {',
        '    if (_uid && Number(it.bd_user_id) !== _uid) { return false; }',
        '    if (_pk && it.period_key !== _pk) { return false; }',
        '    return true;',
        '  });',
        "  pm.test('列表能定位目标行', () => pm.expect(hit, 'missing matched okr row').to.exist);",
        `  if (hit && hit.${a.field || 'id'} != null) {`,
        `    const _id = String(hit.${a.field || 'id'});`,
        `    pm.collectionVariables.set(${jsValue(a.var)}, _id);`,
        `    if (!(pm.environment.get(${jsValue(a.var)}) || '').toString().trim()) {`,
        `      pm.environment.set(${jsValue(a.var)}, _id);`,
        '    }',
        '  }',
        '}'
      ];
    }
    case 'find_in_list': {
      const listExpr = resultExpr(a.list || 'result.list');
      const fieldChecks = Object.entries(a.fields || {}).map(
        ([k, v]) => `    pm.expect(hit.${k}).to.eql(${jsValue(v)});`
      );
      return [
        '{',
        `  const _id = ${lookupVar(a.match_var, true)};`,
        `  const hit = (${listExpr} || []).find((it) => Number(it.${a.match_field || 'id'}) === _id);`,
        `  pm.test('list 含 ${a.match_var}', () => pm.expect(hit, 'row ' + _id).to.exist);`,
        ...(fieldChecks.length ? ['  if (hit) {', ...fieldChecks, '  }'] : []),
        '}'
      ];
    }
    case 'period_range':
      return [
        "pm.test('year + 季/月/周条数', () => {",
        "  pm.expect(r.year).to.be.a('number');",
        "  pm.expect(r.quarters).to.be.an('array').and.have.lengthOf(4);",
        "  pm.expect(r.months).to.be.an('array').and.have.lengthOf(12);",
        "  pm.expect(r.weeks).to.be.an('array');",
        "  pm.expect(r.weeks.length).to.be.at.least(52);",
        '});',
        "pm.test('季为日历年闭区间', () => {",
        "  const y = r.year;",
        "  pm.expect(r.quarters[0]).to.include({ period: 'quarter', period_key: y + 'Q1', begin: y + '-01-01', end: y + '-03-31' });",
        "  pm.expect(r.quarters[3]).to.include({ period: 'quarter', period_key: y + 'Q4', begin: y + '-10-01', end: y + '-12-31' });",
        '});',
        "pm.test('月为 1 月1 日到 12 月末', () => {",
        "  pm.expect(r.months[0].period).to.eql('month');",
        "  pm.expect(r.months[0].begin).to.eql(r.year + '-01-01');",
        "  pm.expect(r.months[11].end).to.eql(r.year + '-12-31');",
        '});',
        "pm.test('季/月/周各恰好一条 current', () => {",
        "  ['quarters', 'months', 'weeks'].forEach((k) => {",
        "    const n = (r[k] || []).filter((it) => it.current === true).length;",
        '    pm.expect(n).to.eql(1);',
        '  });',
        '});',
        'if (r.year === 2026) {',
        "  pm.test('2026-W01 为 2025-12-29～2026-01-04', () => {",
        "    const w = (r.weeks || []).find((it) => it.period_key === '2026-W01');",
        "    pm.expect(w, 'missing 2026-W01').to.exist;",
        "    pm.expect(w.begin).to.eql('2025-12-29');",
        "    pm.expect(w.end).to.eql('2026-01-04');",
        '  });',
        '}'
      ];
    case 'result_null':
      return [
        "pm.test('result 为空（null 或省略）', () => {",
        "  pm.expect(body.result === null || body.result === undefined).to.eql(true);",
        '});'
      ];
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
  } else if (typeof when.body_raw === 'string') {
    req.body = {
      mode: 'raw',
      raw: when.body_raw.replace(/\n$/, '')
    };
  } else if (when.body && typeof when.body === 'object') {
    req.body = {
      mode: 'raw',
      raw: JSON.stringify(when.body, null, 2)
    };
  }
  return req;
}

function queryValue(v) {
  const s = String(v);
  if (s.includes('{{')) {
    return s;
  }
  return encodeURIComponent(s);
}

function buildUrl(when) {
  const path = when.path || '/';
  const q = when.query || {};
  const keys = Object.keys(q);
  const qs = keys.length
    ? `?${keys.map((k) => `${encodeURIComponent(k)}=${queryValue(q[k])}`).join('&')}`
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
      'const useKr = /KR Manager/.test(name) && !/登录/.test(name);',
      'const useManager = /Manager 登录/.test(name) && !/KR Manager 登录/.test(name)',
      '  || (!useKr && /\\/leads\\/approvals|\\/api\\/v1\\/okr/i.test(url) && !/BD token|无\\s*Token|普通 BD/.test(name))',
      '  || (/\\/bd-users\\/me/.test(url) && /Manager/.test(name) && !/KR Manager/.test(name));',
      'const token = useKr',
      "  ? (pm.environment.get('krManagerToken') || pm.collectionVariables.get('krManagerToken') || '')",
      '  : useManager',
      "  ? (pm.environment.get('managerToken') || pm.collectionVariables.get('managerToken') || '')",
      "  : (pm.environment.get('accessToken') || pm.collectionVariables.get('accessToken') || '');",
      "const needsAuth = /\\/leads\\/approvals|\\/api\\/v1\\/okr|\\/bd-users/i.test(url);",
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
      '    if (/KR Manager 登录/.test(n)) {',
      "      pm.environment.set('krManagerToken', body.token);",
      "      pm.collectionVariables.set('krManagerToken', body.token);",
      '    } else if (/KR BD 登录/.test(n)) {',
      "      pm.environment.set('krBdToken', body.token);",
      "      pm.collectionVariables.set('krBdToken', body.token);",
      '    } else if (/Manager 登录/.test(n)) {',
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
