# 发布到 Harness 插件市场

Harness 的「插件市场」（Discover）不是中心化商店，而是**索引文件机制**：用户配置一个或多个
索引 URL（format 1 JSON），DSH 读取索引、展示条目，并用 `plugin_manager.installBundle`
按条目里的**精确版本**安装。发布 = **可安装的公开包（npm 或 Git）+ 一条索引记录**。

本目录已经准备好发布所需的文件，下面是从本地插件到市场条目的完整步骤。

## 0. 发布前必须处理的包信息

| 项 | 当前值 | 发布前要做什么 |
|---|---|---|
| `name` | `dsh-account-usage` | 已定名并在 npm 查询为未占用（2026-11-07）；直接 `npm publish` 即可 |
| `version` | `1.0.0` | 按 SemVer 维护；每次发布递增 |
| `license` | `MIT` | 已加 `LICENSE` |
| `engines.dsh` | `^0.2.2-rc.1` | 与当前 runtime `0.2.2-rc.1` 匹配；市场按它判断兼容性 |
| `author` | `chaox` | 已设置 |
| `repository` / `homepage` | `github.com/lizhichaox/dsh-account-usage` | 已设置（仓库需要你在 GitHub 上创建同名仓库） |
| `private` | 已移除 | 允许 `npm publish` |
| `publishConfig.access` | `public` | 公开包 |

这些字段本仓库已设置好；如果要换包名（例如改成 scoped 的 `@lizhichaox/dsh-account-usage`），
需要同步三处，否则安装后 Loader 找不到模块：

1. `package.json` 的 `name`（同时更新 `repository`/`homepage` 如果要改仓库）
2. `cordis.patch.yml` 的插入行 `name`
3. `market/index-entry.example.json` 的 `plugins[].name` 与各 `versions`

```yaml
- insert:
    - id: account-usage-panel
      name: dsh-account-usage
```

改完本地要重装一次 bundle（Plugin Manager Remove + `install_bundle` 指向本目录），
浏览器里旧名字的 slot/entry 会随重装替换。

> ⚠️ 改包名后本地已安装的 bundle 会失效：先在 Plugin Manager 里 **Remove** 旧 bundle，
> 再用新名字重新安装（`plugin_manager install_bundle`，或 `dsh plugin --profile desktop add <新名字>`）。
> 这是重装一次的事，之后市场安装也走同一个名字。

## 1. 包内容要求（已在仓库中就绪）

| 要求 | 本包 |
|---|---|
| `dsh.bundle.patch` 指向 `cordis.patch.yml` | ✅ |
| `dsh.client`（`platform: web`）+ `./client` 导出 | ✅ |
| `./icon` 导出 + 有效图标 | ✅ `icon.svg`（原创，815 字节） |
| `locale/en.json`、`locale/zh.json` 的 `meta.title` / `meta.description` | ✅（市场/插件页显示名） |
| README（市场详情页文档；也可用 `locale/<lang>.json` 的 `meta.detail` 指向 md） | ✅ |
| `files` 覆盖全部运行时文件 | ✅ 发布包只含 `index.js`、`client.js`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`（npm 自动附带 README/LICENSE） |

发布前验证文件清单：

```sh
npm run verify          # 语法检查 + 无头冒烟测试 + 索引模板自检（不联网）
npm pack --dry-run      # 确认只打包运行时文件，不含 test/、market/、PUBLISHING.md
```

## 2. 发布到 npm

```sh
npm publish --access public
```

- 必须是**公开可读**的包：市场详情页从 npm 文件 CDN（jsDelivr/unpkg/npmmirror）读 README 和
  `locale/*.json`；私有 registry 的包没有可读文件。
- npm 上的版本号必须与索引条目里的 `version` 完全一致。
- 记录 npm 的发布时间（Unix 秒），填到索引的 `publishTimestamp`。

也可以不用 npm，改用 **Git 源**：索引条目 `source.type: "git"` + `url` + 40 位 `commit` +
可选 `path`；安装会 pin 到该 commit。npm 方式更简单。

## 3. 编写市场索引（format 1）

索引是一个 JSON 文件，形如（可直接以 `market/index-entry.example.json` 为模板）：

```json
{
  "format": 1,
  "title": { "en": "My plugin index", "zh": "我的插件索引" },
  "description": { "en": "...", "zh": "..." },
  "metadata": {
    "categories": { "productivity": { "title": { "en": "Productivity", "zh": "效率工具" } } },
    "labels": { "usage": { "title": { "en": "Usage", "zh": "用量" } } }
  },
  "plugins": [
    {
      "name": "dsh-account-usage",
      "title": { "en": "Account usage", "zh": "账号用量" },
      "description": { "en": "...", "zh": "..." },
      "icon": "data:image/svg+xml;base64,...",
      "homepage": "https://github.com/lizhichaox/dsh-account-usage#readme",
      "repository": { "type": "git", "url": "https://github.com/lizhichaox/dsh-account-usage" },
      "metadata": {
        "category": "productivity",
        "keywords": ["account", "usage", "balance", "tokens"],
        "labels": ["usage"]
      },
      "versions": [
        {
          "version": "1.0.0",
          "publishTimestamp": 1790000000,
          "source": { "type": "npm" },
          "engines": { "dsh": "^0.2.2-rc.1" }
        }
      ]
    }
  ]
}
```

字段要点（DSH 的校验器很严格，见 `@deepseek-ai/dsh-plugin-market-index`）：

- `format` 必须是 `1`；`title` / `description` 可以是字符串，或 `{ "en": ... }` 必带 `en` 的多语言对象。
- `plugins[].name` 必须是合法 npm 包名，且与**实际发布包名一致**（校验器不替你核对）。
- `icon`：https URL，或 `data:image/svg+xml|png|jpeg|webp;base64,` 内联（解码后 ≤ 32 KiB）。
  本插件的 `icon.svg` 815 字节，已内联在模板里。
- `metadata.category` / `labels` 必须引用索引 `metadata` 中声明过的 id。
- `versions[]`：精确 SemVer；`publishTimestamp` 为 Unix 秒整数；`source.type` 为 `npm` 或 `git`；
  `engines.dsh` 与包 `engines.dsh` 保持一致（市场用它计算兼容性；DSH 安装时也会再校验包清单）。
- 更新版本 = 追加一条 `versions` 记录（新版本号 + 新发布时间），旧版本保留；市场会把安装状态
  显示为 `update-available`，安装方式是"卸载旧版 + 安装新版"。

**先跑本仓库的轻量自检**（覆盖常见错误，真正的权威校验仍是官方 parser）：

```sh
npm run market:check    # 校验 market/index-entry.example.json
```

**用官方校验器复核**（建议在索引仓库里装成 devDependency）：

```sh
npm i -D @deepseek-ai/dsh-plugin-market-index
node --input-type=module -e "
  import { readFileSync } from 'node:fs';
  import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index';
  const url = 'https://example.com/dsh-plugins/index.json';
  parseMarketIndex(JSON.parse(readFileSync('index.json', 'utf8')), url);
  console.log('index ok');
"
```

索引文件存放要求：`https`（或本地开发 http），**不能有重定向**、不能带 credentials/query/fragment；
DSH 抓取后缓存 10 分钟。

## 4. 上架流程

1. 发布 npm 包（或确定 Git commit）。
2. 生成/更新索引 JSON（把真实 name、版本、发布时间、engines 填好），校验通过后托管到一个
   静态地址（GitHub raw、对象存储、自己的站点均可，注意不要重定向）。
3. 在 DSH 的 **Plugins → Discover**（或配置 `pluginMarket.indexes`）里添加索引 URL。
4. 在市场里确认条目显示正常：标题、图标、描述、详情页（来自 README）、兼容性标记。
5. 点安装，走的是标准的 `plugin_manager.installBundle`：`name@version` + 精确版本，
   与本地安装完全一致。

## 5. 质量与审核清单（建议逐条自查）

- [ ] `npm run verify` 通过；从 npm 安装到干净 profile 后，面板能打开、数据能刷新
- [ ] 包内无凭据、无个人数据、无本地绝对路径；测试/构建脚本不在发布包内
      （`npm prepack` 会自动跑 `scripts/secret-scan.mjs`，命中即拒绝打包；也可手动 `npm run secret:scan`）
- [ ] README 有「数据与隐私」说明（读什么、发到哪里、缓存在哪、如何清理）
- [ ] 图标为原创或有可再分发授权；截图（如添加）不含账号隐私
- [ ] `engines.dsh` 与目标 DSH 版本一致；破坏性变更升 major
- [ ] 平台声明：默认全平台；如需限定，`dsh.bundle.platforms` 写 Node 平台名数组
      （如 `["darwin", "win32", "linux"]`），否则省略
- [ ] 变更记录（CHANGELOG）与版本号对应
- [ ] 平台私有用量接口失效时能自动回退本地估算（本插件已实现，见 README）
- [ ] 索引 JSON 本身不含 token/邮箱等隐私信息（`author` 可选；图标用内联或公开 URL 即可）
- [ ] 在**干净 profile** 里从 npm 安装并打开面板：全程无需填写任何配置即可看到余额/用量（零配置验收）

## 6. 已知的发布后维护点

- 平台私有接口 `/api/v0/usage/*` 可能随 DeepSeek 平台改版变化；失效时插件回退本地估算并显示原因，
  需要时发版修复。
- DSH 版本升级时同步检查客户端 API（右侧栏 slot、shortcuts、projection 等）与 `engines.dsh`。
- 市场条目里每个版本都要保留 `publishTimestamp`；删除旧版本条目会让老用户无法回退安装。
