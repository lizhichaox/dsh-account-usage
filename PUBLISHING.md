# 发布与上架

Harness 的「插件市场」（Discover）不是中心化商店，而是**索引文件机制**：用户配置一个或多个
索引 URL（format 1 JSON），DSH 读取索引、展示条目，并用 `plugin_manager.installBundle`
按条目里的**精确版本**安装。发布 = **可安装的公开源（npm 或 Git commit）+ 一条索引记录**。

## 当前状态（2026-11-08）

| 项 | 值 |
|---|---|
| GitHub 仓库 | <https://github.com/lizhichaox/dsh-account-usage>（public，`main`） |
| 市场索引 | <https://lizhichaox.github.io/dsh-account-usage/market/index.json> |
| 索引托管 | GitHub Pages（仓库根目录；`.nojekyll` 保证 JSON 原样输出，无重定向） |
| 当前安装源 | **npm**：`dsh-account-usage@1.0.14`（索引 `source.type = npm`） |
| 包名 / 版本 | `dsh-account-usage` / **1.0.14** |
| 兼容性 | `engines.dsh: ^0.2.2-rc.1`（与当前 runtime 匹配） |
| npm | **已发布**：<https://www.npmjs.com/package/dsh-account-usage>（`1.0.14`，2026-11-09 06:27:53Z，本地 14:27） |
| 校验 | `npm run verify` + `npm run verify:ui` 全绿（72 个状态）；npm 包 15 个文件 / 65.8 kB（shasum `16e66233`，与本地 `npm pack` 逐字节一致）；CI `verify` 全绿；Pages 索引已切到 1.0.14，并用官方 `parseMarketIndex` 复核通过 |

安装侧使用：

1. 在 Plugin Manager 启用实验性 bundle **plugin-market**（提供 Plugins → Discover）。
2. Discover 添加索引 URL：`https://lizhichaox.github.io/dsh-account-usage/market/index.json`
3. 安装「账号用量」。

## 更新发布流程

```sh
# 1. 改完代码 + 升版本号后自检（动过布局必须再跑真机几何测试）
npm run verify && npm run verify:ui

# 2. 提交并推送代码
git add -A && git commit -m "feat: ... v1.0.3" && git push

# 3. 发布 npm（需要 npm 登录；2FA 账号用带 bypass 2FA 的 granular token）
npm publish

# 4. 用 npm 上的真实发布时间重新生成索引（切到 npm 源）
npm run market:index:npm

# 5. 提交索引（GitHub Pages 会自动重建）
git add market/index.json && git commit -m "chore: update market index" && git push

# 6. tag / GitHub Release
git tag -a v1.0.4 -m "dsh-account-usage v1.0.4" && git push --tags
```

> 每次更新都必须重新生成 `market/index.json`；市场按 **精确版本** 安装。
> 纯 Git 分发也可以用 `npm run market:index`（commit pin），但当前索引走 npm。

## 连续发版（同一天多次）的约定

2026-11-08 用户说明：当天会**持续更新**，npm token 先不吊销，更新全部结束后再处理。因此：

- 每轮发版只做：`npm version patch` → `npm run verify && npm run verify:ui` → `npm publish`
  → `npm run market:index:npm` → commit/push → `git tag`/push → 等 Pages → 官方 `parseMarketIndex` 复核
- token 用临时 npmrc（`/tmp`，chmod 600，从会话记录取），**发布后立刻删除临时文件**，不在仓库或长期配置里落盘
- 不要每轮都提醒吊销；用户说「更新完了」时提醒一次
- 版本号逐次 patch（1.0.4、1.0.5…），索引每次都要重新生成，确保市场按精确版本安装

## npm 发布（可选，后续推荐）

开通 npm 分发只需要一次登录：

```sh
npm login
npm publish            # 无 scope 包默认 public；scoped 包用 --access public
npm run market:index:npm   # 读取 npm 上的真实发布时间，把索引切到 npm 源
git add market/index.json && git commit -m "chore: index npm source" && git push
```

- npm 包名 `dsh-account-usage`（2026-11-07 查询未占用）。
- `npm publish` 会先跑 `prepack` 的敏感信息扫描；`package.json` 的 `files` 只打包
  `index.js`、`client.js`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`（npm 自动附带 README/LICENSE）。
- 发布后 npm 页面与文件 CDN 会自动提供市场详情页文档（README）。

## 索引结构（format 1）

`market/index.json` 的关键字段：

| 字段 | 说明 |
|---|---|
| `format` | 固定 `1` |
| `title` / `description` | 中英双语（必须含 `en`） |
| `metadata.categories` / `labels` | 索引级声明的 id，条目只能引用已声明的 |
| `plugins[].name` | 必须是合法 npm 包名，且与实际安装包名一致（`dsh-account-usage`） |
| `plugins[].icon` | `data:image/svg+xml;base64,...`（解码后 815B，远低于 32 KiB 上限） |
| `plugins[].homepage` / `repository` | https URL |
| `plugins[].versions[]` | 精确 SemVer、`publishTimestamp`（Unix 秒）、`source`（`npm` 或 `git` + commit）、`engines.dsh` |

索引必须托管在 **https、无重定向** 的地址；GitHub Pages 已通过 `.nojekyll` 保证
`market/index.json` 原样返回（否则 Jekyll 构建会让 JSON 路径 404）。

## 官方校验

```sh
npm i -D @deepseek-ai/dsh-plugin-market-index
node --input-type=module -e "
  import { readFileSync } from 'node:fs';
  import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index';
  const url = 'https://lizhichaox.github.io/dsh-account-usage/market/index.json';
  const parsed = parseMarketIndex(JSON.parse(readFileSync('market/index.json', 'utf8')), url);
  console.log('ok:', parsed.plugins[0].name, parsed.plugins[0].versions[0].version);
"
```

本仓库另有轻量自检：`npm run market:check`。

## 安全与合规

- `npm run verify` = 语法检查 + 无头冒烟测试 + **敏感信息扫描** + 索引自检
- `npm prepack` 会对所有会进 npm 包的文件做密钥/个人信息扫描，命中即拒绝打包
- 仓库内无 token、无个人数据；Host 只在内存使用平台登录态，不写日志、不发第三方
- 平台用量接口是网页私有接口，改版时会自动回退本地估算（见 README「限制」）

## 改名 / 换仓库时需要同步

1. `package.json` 的 `name`（以及 `repository` / `homepage`）
2. `cordis.patch.yml` 插入行的 `name`
3. 重新跑 `npm run market:index` 生成索引（名称会跟随 `package.json`）
4. 本地重装一次 bundle（Plugin Manager Remove → `install_bundle` 指向本目录）
