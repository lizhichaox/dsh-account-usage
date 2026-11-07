# AGENTS.md — 账号用量插件：长期要求与约定

> 这是用户对本插件的**长期要求清单**。接手前先读本文件，不要重复询问已经写在这里的偏好；
> 用户不想反复重申。若实现与本文件冲突，以用户当次明确指示为准，并在完成后回写本文件。

最后更新：2026-11-07 · 插件版本：`1.0.2`（本地已实现，尚未发布；npm/市场线上为 `1.0.1`）

- 插件目录：`/Users/lizhichao/vc/macos/dsh/dsh-preset/account-usage-panel`
- GitHub：<https://github.com/lizhichaox/dsh-account-usage>
- npm：<https://www.npmjs.com/package/dsh-account-usage>（包名 `dsh-account-usage`，作者 `chaox`）
- 市场索引：<https://lizhichaox.github.io/dsh-account-usage/market/index.json>

## 1. 产品定位

- DeepSeek Harness 右侧边栏插件，名称固定为 **「账号用量」**（四个中文）。
- 面板固定三张卡片，顺序：**会话消耗 → 用量统计 → 账户余额**。
- 数据必须是**真实数据**：DeepSeek 平台私有 usage 接口 / 余额接口；不得用估算冒充真实值。
  只有平台登录态或接口失败时才回退本地估算，且金额必须带 `≈` 并说明原因。
- 不显示账号身份信息（头像、姓名、手机号、邮箱、内部 ID 一律不要）。
- 不放置「查看用量 / 充值」等跳转链接。

## 2. 卡片与布局

- 卡片标题：三张卡标题都用**四个中文字符**（会话消耗 / 用量统计 / 账户余额），**居中**，
  标题下方有 `.aup-divider` 细分割线。
- 卡片高度：
  - 会话消耗卡：**按内容高度**（不拉伸、不留内部大片空白）
  - 用量统计卡：占用剩余高度（自身 7 行数据填满）
  - 账户余额卡：**按内容自适应**，紧凑两列布局，不再占 25% 高度浪费空间
  - 第三方 Provider 会话：平台用量卡隐藏；会话卡与 Provider 余额卡都按内容高度
- 卡内**不允许滚动**；空间不足时只能隐藏次要信息或换行/缩字号，不能裁切文本。
- 所有可用空间应尽量被有意义的内容覆盖；不要出现卡片内部的大块空白。

## 3. 文本与排版（重点，多次强调）

- 中文正文/标签统一 **13px、500 字重**；标题也是 13px/500，金额数字可以层级不同。
- 金额数字可大小不同；中文文本字号/字重必须一致。
- **右侧卡片内所有文本禁止折叠、遮挡、省略、截断**。允许：
  - 自动换行（长模型名、Provider 名、说明、标签）
  - 简化文案（如「余额由 OpenRouter 提供」）
  - 较长金额自动降字号（`aup-value-long` / `aup-value-longer`）
  - 列宽按内容自适应（日期列用 `max-content`）
- 不允许出现 `text-overflow: ellipsis`（当前全文件已清零）。
- Token 单位自动 `K → M → B → T`，最多两位小数；金额固定两位小数（正数按平台规则截断）。
- 主题：只用 DSH 主题 token（`--dsw-alias-*`，图表色可用 `--dsw-static-*` + 十六进制 fallback），
  禁止硬编码普通颜色；浅色/深色都要验证对比度（当前主文本 18.9:1 / 15.0:1）。
- 禁止使用 `--dsw-alias-bg-layer-2`（浅色下等于 bg-layer-1，会看不见）；
  边框/分隔线用 `border-l2`，轨道/骨架用 `bg-skeleton`。

## 4. 会话卡内容

必须覆盖原 DSH 底栏 + 「会话统计」弹窗能看到的全部数据：

- Token 合计、输入（未缓存）、输出、缓存读取、缓存写入
- 轮数、步数、请求次数、缓存命中率、平均每请求、输出速度（tok/s）
- 模型用时、工具用时、首 token 平均（TTFT）
- 输出 Tokens
- 按模型统计（Provider 作为分组小标题，模型名完整显示，最多 3 个）
- 上下文占用 `已用 / 窗口（百分比）`、系统/工具/消息构成条与百分比

## 5. 快捷键与右侧栏

- `⌘U`（macOS 桌面）/ `Ctrl+U`（Win/Linux）/ Web 用 `⌘⌥U` / `Ctrl+Alt+U`。
- 快捷键打开面板时，**自动把右侧栏收到最窄宽度**（驱动宿主 resize 手柄，失败静默回退），
  不允许要求用户手动拖窄。
- 左侧栏底部不再放插件入口。
- 快捷键必须在 DSH 快捷键设置里可见、可改；无会话时返回 blocked 并提示「请先选择会话」。

## 6. 设置（右上角齿轮）

标题就叫 **「设置」**；弹层要精简、优雅：

- 默认维度（日/周/月/季/年）
- 显示卡片（会话消耗 / 用量统计 / 账户余额）
- 显示消费金额（关掉后只显示 Token）
- 自动刷新（开/关；用量 2 分钟、余额 5 分钟；页面隐藏暂停）
- **隐藏底栏会话统计**（默认开；关掉可恢复 DSH 原底栏）
- 恢复默认

要求：

- 底部提示单行，不换行、不省略
- 设置持久化到 localStorage（`dsh.account-usage.settings.v1`）
- `Esc` / 遮罩 / `×` 可关闭，关闭后焦点回到齿轮
- 开关 `role="switch"`，键盘可操作

## 7. 第三方 Provider（非 DeepSeek 账号）

会话可能走 OpenRouter、Anthropic、OpenAI、DeepSeek API Key 等：

- 从**当前会话持久日志**读取 `assistant/message` 的 `source.provider` 判断
- 全部第三方：
  - **隐藏 DeepSeek 账户余额与 DeepSeek 平台用量**
  - 账户卡改为显示对应 Provider 的余额（OpenRouter `/api/v1/credits`，失败回退 `/api/v1/key`；
    DeepSeek API Key 用 `/user/balance`）
  - 不支持的 Provider 显示「不支持余额查询」，未配置 Key 显示「未配置 … API Key」
  - Provider 卡为大号余额 + 使用率进度条 + 已用/总额 + 单行说明
- 混合会话：保留 DeepSeek 余额 + 提示「部分使用 …」，平台用量卡加「DeepSeek 平台」标记
- Provider 余额缓存 60 秒；手动刷新强制重新查询
- **API Key 只在 Host 侧读取**（`ctx.credentials`），不得下发到浏览器/客户端

## 8. 底栏会话统计

- 插件启用后默认隐藏 DSH 输入框底部的会话统计（含 `ContextMeter` 的上下文环形 `%`）：
  通过 `<html data-account-usage-hide-stats>` + 隐藏 `[data-composer-dock]` 容器实现，
  并对 `[data-composer-stat]` 兜底
- 隐藏后相关信息必须完整出现在右侧面板（见第 4 节）
- 插件停用/卸载时清理该属性；设置里可关闭隐藏恢复原底栏
- 目标：输入区底部与输入卡顶齐，不再多一行

## 8.5 多语言

- 跟随 DSH 语言设置：中文（`zh`）显示中文，**其它语言一律英文**
- 内置语言 `ja/es/fr/de/ru/pt` 显式注册英文词典，最终回退到 `en`
- 所有界面文案、Provider 名称、错误原因、时长/金额格式都随语言切换；切换即时生效
- `locale/*.json` 元数据对非中文语言提供英文回退
- 禁止在组件里硬编码中英文文案（指令、快捷键别名除外）

## 9. 性能

- 余额 5 分钟、用量 2 分钟自动刷新；页面隐藏时暂停，回前台补一次
- 月份缓存：已结束月份 7 天（localStorage 持久化），当前月 2 分钟；刷新只重读当前月
- 维度结果内存缓存，数据未变化不重渲染；切维度不闪屏、不串用其他维度数据
- 首次平台数据成功后预热「年」窗口；Host 侧平台登录态缓存 30 秒
- 首屏骨架屏；尊重 `prefers-reduced-motion`

## 10. 安全与隐私

- 平台 token 只在 Host 进程内存，不写日志、不进模型上下文、不下发客户端
- Host 路由只允许本机回环 + 同源（Host/Origin/sec-fetch-site 校验）；平台请求 `redirect: manual`、
  超时、响应大小上限
- 无遥测、无第三方域名（Provider 余额只请求 Provider 官方接口）
- 发布前 `npm prepack` 自动跑 `scripts/secret-scan.mjs`，命中密钥/个人信息拒绝打包
- 不要把用户临时提供的 npm token 写入仓库或长期配置；用完即删并提醒吊销
- 仓库内不得出现 token、个人数据、本机绝对路径

## 11. 发布

- npm：`dsh-account-usage`（author `chaox`，repo `lizhichaox/dsh-account-usage`）
- 市场索引由 `market/index.json` 生成：`npm run market:index`（Git 源）或
  `npm run market:index:npm`（npm 发布后）
- 发布前必须 `npm run verify`（语法 + 冒烟 + 敏感信息扫描 + 索引自检）
- 每次更新：`npm version patch` → `npm publish` → `npm run market:index:npm` → commit/push →
  等 Pages → 官方 `parseMarketIndex` 复核
- 版本要求 `engines.dsh: ^0.2.2-rc.1`
- 不擅自发布 npm：需要用户登录或提供一次性 token；发布后提醒吊销

## 12. 工程习惯

- 改完必须跑：`node --check index.js && node --check client.js && npm run verify`
- 视觉/交互改动要补冒烟测试；Host 折叠逻辑要有单元测试
- 无法用浏览器验证时，如实说明「基于 CSS/契约测试，非真机像素比对」
- 本地是 link 安装；改 `index.js` 需要 Plugin Manager 停用/启用一次，改 `client.js` 等 HMR
- 不把内部文件（test/market/AGENTS/README 等）打进 npm 包（`files` 白名单）
- 用户偏好：**主动做完、少提问、别让用户重复要求**；不确定时先按本文件默认执行

## 13. 已完成的关键决策（避免回退）

- 会话卡不再使用 `container-type: size`（会让内容高度塌陷成 0）
- 会话卡内容高度自适应；统计卡占剩余高度
- 会话卡用细分隔线分组：Token 明细 / 2×4 统计 / 按模型 / 上下文；模型显示短名；卡片内文本单行不换行
- 统计区为**对齐两列表格**（标签列定宽 60px、值列左对齐，四行整齐，行高 20px、列间距 16px）；时长使用紧凑格式（如 1时44分 / 2分57秒 / 1.7秒）；用量统计每日行单行显示 Token · 金额，行高有下限，禁止重叠
- 卡片文本无省略号；长文本换行、长金额降字号
- 底栏 dock + ContextMeter 一起隐藏（只隐藏 slot 不够）
- 第三方 Provider 会话不显示 DeepSeek 余额/平台用量，改显示 Provider 余额
- 快捷开栏自动收窄到宿主最小宽度（300px），失败静默
