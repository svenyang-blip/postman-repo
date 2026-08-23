#!/usr/bin/env node
/**
 * 为 testnet Postman 环境预生成 RSA 登录密文（写入环境 JSON）。
 *
 * 用法：
 *   node scripts/bd-prepare-testnet-login.mjs -e postman/environments/bd-management-testnet.private.postman_environment.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { encryptLoginData } from './bd-encrypt-login-data.mjs';

function parseArgs(argv) {
  const args = { env: 'postman/environments/bd-management-testnet.postman_environment.json' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '-e' || argv[i] === '--env') args.env = argv[++i];
    else if (argv[i] === '-h' || argv[i] === '--help') args.help = true;
  }
  return args;
}

function getEnvValue(values, key) {
  const item = values.find((v) => v.key === key);
  return item ? String(item.value ?? '') : '';
}

function setEnvValue(values, key, value, type = 'default') {
  let item = values.find((v) => v.key === key);
  if (!item) {
    item = { key, value: '', type, enabled: true };
    values.push(item);
  }
  item.value = value;
  item.type = type;
  item.enabled = true;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('用法: node scripts/bd-prepare-testnet-login.mjs [-e <postman_environment.json>]');
    process.exit(0);
  }

  const raw = readFileSync(args.env, 'utf8');
  const env = JSON.parse(raw);
  const values = env.values || [];

  const bdEmail = getEnvValue(values, 'bdEmail');
  const bdPassword = getEnvValue(values, 'bdPassword');
  const managerEmail = getEnvValue(values, 'managerEmail');
  const managerPassword = getEnvValue(values, 'managerPassword');
  const wrongPassword = getEnvValue(values, 'wrongPassword') || 'WrongPass1A';

  if (!bdEmail || !bdPassword) {
    console.error('环境缺少 bdEmail / bdPassword');
    process.exit(1);
  }
  if (!managerEmail || !managerPassword) {
    console.error('环境缺少 managerEmail / managerPassword');
    process.exit(1);
  }

  setEnvValue(values, 'loginDataEncryptedBd', encryptLoginData(bdEmail, bdPassword), 'secret');
  setEnvValue(values, 'loginDataEncryptedManager', encryptLoginData(managerEmail, managerPassword), 'secret');
  setEnvValue(values, 'loginDataEncryptedWrong', encryptLoginData(bdEmail, wrongPassword), 'secret');
  setEnvValue(values, 'useRsaLogin', 'true');

  env.values = values;
  writeFileSync(args.env, `${JSON.stringify(env, null, 2)}\n`, 'utf8');

  console.log(`已写入 RSA 登录密文 → ${args.env}`);
  console.log(`  loginDataEncryptedBd       (${bdEmail})`);
  console.log(`  loginDataEncryptedManager  (${managerEmail})`);
  console.log(`  loginDataEncryptedWrong    (${bdEmail} / wrong password)`);
}

main();
