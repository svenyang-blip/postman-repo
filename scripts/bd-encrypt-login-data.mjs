#!/usr/bin/env node
/**
 * RSA-2048 PKCS#1 加密登录明文 JSON → Base64（对齐 bd-management docs/login.md）
 *
 * 用法：
 *   node scripts/bd-encrypt-login-data.mjs --email aiden@zoomex.com --password Passw0rd
 *   node scripts/bd-encrypt-login-data.mjs --email x --password y --json
 */
import { readFileSync } from 'node:fs';
import { publicEncrypt, constants } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PEM = join(__dirname, '../postman/keys/login_public.pem');

export function encryptLoginData(email, password, pemPath = DEFAULT_PEM) {
  const pem = readFileSync(pemPath, 'utf8');
  const plain = JSON.stringify({ email: String(email), password: String(password) });
  const encrypted = publicEncrypt(
    { key: pem, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(plain, 'utf8')
  );
  return encrypted.toString('base64');
}

function parseArgs(argv) {
  const args = { email: '', password: '', pem: DEFAULT_PEM, json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--email') args.email = argv[++i] ?? '';
    else if (a === '--password') args.password = argv[++i] ?? '';
    else if (a === '--pem') args.pem = argv[++i] ?? DEFAULT_PEM;
    else if (a === '--json') args.json = true;
    else if (a === '-h' || a === '--help') args.help = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.email || !args.password) {
    console.error('用法: node scripts/bd-encrypt-login-data.mjs --email <email> --password <password> [--pem path] [--json]');
    process.exit(args.help ? 0 : 1);
  }
  const data = encryptLoginData(args.email, args.password, args.pem);
  if (args.json) {
    console.log(JSON.stringify({ data }));
  } else {
    console.log(data);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
