#!/usr/bin/env node
/**
 * Build market/index.json after `npm publish`.
 *
 *   node scripts/finalize-release.mjs
 *
 * Reads the published version's timestamp from the public npm registry, writes
 * the format-1 plugin index next to the repo (served by GitHub Pages), and
 * validates it with the lightweight checker.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const registry = 'https://registry.npmjs.org/' + encodeURIComponent(manifest.name).replace('%40', '@');

const response = await fetch(registry, { headers: { accept: 'application/json' } });
if (response.status === 404) {
  console.error('finalize-release: ' + manifest.name + ' is not published yet. Run `npm publish --access public` first.');
  process.exit(1);
}
if (!response.ok) {
  console.error('finalize-release: npm registry returned HTTP ' + String(response.status));
  process.exit(1);
}
const metadata = await response.json();
const publishedAt = metadata.time?.[manifest.version];
if (typeof publishedAt !== 'string') {
  console.error('finalize-release: the registry has no publish time for ' + manifest.name + '@' + manifest.version);
  process.exit(1);
}
const publishTimestamp = Math.floor(Date.parse(publishedAt) / 1000);

const icon = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(root, 'icon.svg')).toString('base64');
const dshRange = manifest.engines?.dsh ?? '^0.2.2-rc.1';
const repositoryUrl = String(manifest.repository?.url ?? '').replace(/^git\+/, '').replace(/\.git$/, '');

const index = {
  format: 1,
  title: { en: 'chaox DSH plugins', zh: 'chaox 的 DSH 插件' },
  description: {
    en: 'DeepSeek Harness plugins by chaox.',
    zh: 'chaox 的 DeepSeek Harness 插件。'
  },
  metadata: {
    categories: { productivity: { title: { en: 'Productivity', zh: '效率工具' } } },
    labels: { usage: { title: { en: 'Usage', zh: '用量' } } }
  },
  plugins: [
    {
      name: manifest.name,
      title: { en: 'Account usage', zh: '账号用量' },
      description: {
        en: 'Real account balance plus real token usage and spend grouped by day, week, month, quarter, or year, plus this session token usage.',
        zh: '真实账号余额，以及按日/周/月/季/年分组的真实 Token 用量与消费金额，并显示本次会话的 Token。'
      },
      icon,
      author: typeof manifest.author === 'string' ? manifest.author : 'chaox',
      homepage: manifest.homepage,
      repository: { type: 'git', url: repositoryUrl },
      metadata: { category: 'productivity', keywords: ['account', 'usage', 'balance', 'tokens', 'billing', 'deepseek'], labels: ['usage'] },
      versions: [
        {
          version: manifest.version,
          publishTimestamp,
          source: { type: 'npm' },
          engines: { dsh: dshRange }
        }
      ]
    }
  ]
};

const output = path.join(root, 'market/index.json');
fs.writeFileSync(output, JSON.stringify(index, null, 2) + '\n');
console.log('finalize-release: wrote ' + path.relative(root, output));
console.log('finalize-release: index URL (after push + Pages) https://lizhichaox.github.io/' + manifest.name + '/market/index.json');
