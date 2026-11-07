#!/usr/bin/env node
/**
 * Refuse to pack/publish the bundle when a file that npm would ship contains a
 * secret or personal datum. Runs from `prepack`, so `npm pack` and
 * `npm publish` both go through it.
 *
 *   node scripts/secret-scan.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

/** Files npm includes even though `files` does not list them. */
const ALWAYS = ['package.json', 'README.md', 'README', 'LICENSE', 'LICENSE.md'];
/** Text extensions worth scanning; binary assets are skipped. */
const TEXT = new Set(['.js', '.mjs', '.cjs', '.json', '.md', '.yml', '.yaml', '.svg', '.txt']);

function expand(pattern) {
  if (!pattern.includes('*')) return [pattern];
  const directory = path.join(root, path.dirname(pattern));
  if (!fs.existsSync(directory)) return [];
  const matcher = new RegExp('^' + pattern.split('*').map((part) => part.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
  return fs
    .readdirSync(directory)
    .map((name) => path.posix.join(path.dirname(pattern).replaceAll('\\\\', '/'), name))
    .filter((candidate) => matcher.test(candidate));
}

const shipped = new Set();
for (const relative of ALWAYS) if (fs.existsSync(path.join(root, relative))) shipped.add(relative);
for (const pattern of manifest.files ?? []) {
  for (const relative of expand(pattern.replaceAll('\\\\', '/'))) shipped.add(relative);
}

const RULES = [
  { name: 'private key block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u },
  { name: 'npm token', pattern: /\bnpm_[A-Za-z0-9]{20,}/u },
  { name: 'GitHub token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u },
  { name: 'API key', pattern: /\b(?:sk|pk)-[A-Za-z0-9_-]{20,}/u },
  { name: 'bearer token literal', pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/u },
  { name: 'platform auth token literal', pattern: /['"]x-dsh-auth-token['"]\s*:\s*['"][A-Za-z0-9+/=]{16,}['"]/u },
  { name: 'long hex secret', pattern: /\b[a-f0-9]{64}\b/u },
  { name: 'absolute home path', pattern: /(?:\/Users\/|\/home\/|[A-Za-z]:\\\\Users\\\\)[^/\s\\]+/u },
  { name: 'email address', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/u },
  { name: 'mobile number', pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/u },
  { name: 'local debug artifact', pattern: /account-usage-(?:probe|debug|profile-probe)/u }
];

const findings = [];
for (const relative of shipped) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute) || !TEXT.has(path.extname(absolute))) continue;
  const text = fs.readFileSync(absolute, 'utf8');
  const lines = text.split(/\r?\n/u);
  for (const rule of RULES) {
    lines.forEach((line, index) => {
      if (rule.pattern.test(line)) findings.push({ file: relative, line: index + 1, rule: rule.name, sample: line.trim().slice(0, 120) });
    });
  }
}

if (findings.length > 0) {
  console.error('secret scan: refusing to pack, ' + String(findings.length) + ' finding(s):');
  for (const finding of findings) console.error('  ' + finding.file + ':' + String(finding.line) + ' [' + finding.rule + '] ' + finding.sample);
  process.exit(1);
}
console.log('secret scan passed: ' + String(shipped.size) + ' shipped file(s) contain no secrets or personal data');
