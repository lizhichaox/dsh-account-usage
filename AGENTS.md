# AGENTS.md — 账号用量插件：长期要求与约定

> 这是用户对本插件的**长期要求清单**。接手前先读本文件，不要重复询问已经写在这里的偏好；
> 用户不想反复重申。若实现与本文件冲突，以用户当次明确指示为准，并在完成后回写本文件。

最后更新：2026-11-08 · 插件版本：`1.0.3`

- 插件目录：`/Users/lizhichao/vc/macos/dsh/dsh-preset/account-usage-panel`
- GitHub：<https://github.com/lizhichaox/dsh-account-usage>
- npm：<https://www.npmjs.com/package/dsh-account-usage>（包名 `dsh-account-usage`，作者 `chaox`）
- 市场索引：<https://lizhichaox.github.io/dsh-account-usage/market/index.json>

## 1. 产品定位

- DeepSeek Harness 右侧边栏插件，名称固定为 **「账号用量」**（四个中文）。
- 面板固定三张卡片，顺序：**会话消耗 → 用量统计 → 账户余额**。
- 右侧栏 tab 用短标题「用量」（英文 `Usage`），**保留钱包图标**，且必须**照抄宿主的写法**：
  tab title 组件返回 **Fragment（裸 SVG + 纯文本）**，不要包一层 `span` 容器——
  宿主的 `GuideTitle` 就是 `<CompassGlyph/> + tab.title` 这种结构，包容器会让 tab 宽度测量错乱、
  切 tab 时文字被压扁变形。图标用 `.aup-tab-icon`（14px、`vertical-align:-2px`），
  **不要自己加 margin**：图标与文字的间距由宿主 chip 的 gap 负责，否则选中/未选中两种状态下间距会不一致。
- **样式表必须注入 `document.head`**（apply 时用 `<style data-plugin-css="dsh-account-usage">`），
  不能只写在面板 body 里：tab chip 在面板 body 之外，面板切走后 body 卸载、样式随之消失，tab 会「变形」。
- 面板头部是一条横条，**它的下边线必须是「中间会话区 header 下边线的延长线」**：
  - 线样式要与宿主一致：`.5px solid var(--dsw-alias-border-l3)`（宿主会话 header 用的就是它）
  - 横条高度**运行时测量**：`conversation.header` 的 `bottom` 减去本面板 root 的 `top`，
    写入 CSS 变量 `--aup-head-h`；找不到时用 `[data-phase]` 会话根的第一个子元素 bottom 兜底
  - root 的 `padding-top` 必须为 0，横条才能从面板顶端开始，测量值才对得上
  - 面板边界留白要克制：root `padding: 0 8px 8px`、卡片间距 8px（不要回到 16px，会显得空旷）；
    横条用**负外边距 `margin:0 -8px` + `padding:0 8px` 铺满面板整宽**（线必须顶到面板左右边缘），
    否则线和中间会话区的线之间会留出面板 padding 的空档、看起来「没连起来」
  - **线永远不能消失**：测量失败或数值不合理时退回默认 44px 的横条高度，绝不隐藏这条线
  - 定位方式：在 `[data-phase]` 会话根内做 BFS，取第一个「宽度>120 且有 `border-bottom`」的元素底边，
    因为它就是中间那条线的绘制元素；`data-slot` 包装层可能 `display:contents`（零尺寸），不能只看它
  - 左侧设置齿轮、右侧刷新按钮在横条内**垂直居中**；中间是问候语（`aup-head-greeting`）
- 问候语优先级：**24 节气 > 法定节假日/农历节日 > 时段问候**；再叠加一句随机小祝福（按天稳定 seed）。
  节气用 `Y*0.2422+C` 近似公式（21 世纪常数表）；农历节日用 `Intl.DateTimeFormat('zh-CN-u-ca-chinese')`
  取月/日判定（正月初一/十五、五月初五、七月初七、八月十五、九月初九、除夕）；非中文显示英文名称。
- 数据必须是**真实数据**：DeepSeek 平台私有 usage 接口 / 余额接口；不得用估算冒充真实值。
  只有平台登录态或接口失败时才回退本地估算，且金额必须带 `≈` 并说明原因。
- 界面统一用语 **「DeepSeek API」**（替代「DeepSeek 账号 / DeepSeek 平台」）；API Key 路线叫「DeepSeek API Key」。
- 不显示账号身份信息（头像、姓名、手机号、邮箱、内部 ID 一律不要）。
- 不放置「查看用量 / 充值」等跳转链接。

## 2. 卡片与布局

- 卡片标题：三张卡标题都用**四个中文字符**（会话消耗 / 用量统计 / 账户余额），**居中**，
  标题下方有 `.aup-divider` 细分割线。
- **标题区只放图标 + 标题**：不放供应商徽标/标记（供应商名只在账户卡的来源 tab 里出现）；
  标题 `white-space:nowrap`，`aup-card-head` 用绝对定位的 `aup-card-head-extra` 承载必要的小标记，
  绝不能把标题挤成两行。
- **面板必须充满右侧栏的整高整宽**（用户 2026-11-08 明确要求，取代旧的「卡片按内容自适应、剩余留底部」）：
  - `.aup-root` / `.aup-cards` 都是 `width:100%`，卡片按比例拉伸填满剩余高度：
    `.aup-card{flex:1 1 auto;min-height:auto}`（`min-height:auto` 是防裁切的关键，别改回 0）
  - 卡内**不许出现大块空白**：把「底部那行」锚到卡片底边吸收剩余高度——
    会话卡的 `.aup-context`、用量卡的 `.aup-stats-summary` 用 `margin-top:auto`；
    用量卡的 `.aup-series`、账户卡的 `.aup-balance` / `.aup-provider-body` 用 `flex:1 1 auto` + 均匀分布
  - 卡片列**不许留滚动条槽**（不写 `scrollbar-gutter`），否则右侧会多出一条空带、卡片撑不满整宽
  - **任何会话都只有三张卡**（会话消耗 / 用量统计 / 账户余额）
- **卡内不允许滚动**，但**卡片列可以滚动**：`.aup-cards` 允许 `overflow-y:auto`（细滚动条），
  作为最后一道保险——内容再高也不会把「账户余额」卡顶出可视区、更不会被裁切。
  优先级：先减内容（明细行封顶）→ 再让卡片列滚动，绝不裁切。
- 所有可用空间应尽量被有意义的内容覆盖；不要出现卡片内部的大块空白。

## 3. 文本与排版（重点，多次强调）

- **全局只有一个字号：13px**（`--aup-fs-text`）。中文、英文、数字、符号**全部同字号**，
  禁止出现任何第二档（不许 11/12/14/16/20px）。层级只能靠 **字重** 表达：
  主数字/合计 600，常规数值与标签 500，极少数说明文字 400。
  - 字族：`--aup-font-ui`（`-apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`），
    中文、英文、数字、符号共用；数字容器加 `font-variant-numeric:tabular-nums`
  - 长数字/长模型名**不许降字号**：只能靠 `letter-spacing` 微调、换行或自适应列宽解决
- **右侧卡片内所有文本禁止折叠、遮挡、省略、截断**。允许：
  - 自动换行（长模型名、Provider 名、说明、标签）
  - 简化文案（如「余额由 OpenRouter 提供」）
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
- 上下文占用 `已用 / 窗口（百分比）`、系统/工具/消息构成条与百分比

## 5. 快捷键与右侧栏

- `⌘U`（macOS 桌面）/ `Ctrl+U`（Win/Linux）/ Web 用 `⌘⌥U` / `Ctrl+Alt+U`。
- **绝不擅自改宽度**：快捷键只是打开面板，**不做任何收窄/加宽**（用户手动拖出来的宽度必须保持）。
  唯一例外：面板实际宽度低于 340px 且**能测量到**时，才把它加宽回 340px（否则排版会挤爆）；测不到宽度就不要猜。
  切 tab、切窗口回来都不许触发任何宽度变化。
- **最小宽度护栏**：面板打开期间监听自身宽度，低于 `PANEL_MIN_WIDTH`（340px）时自动加宽回去。
  **只在用户松手后纠正**（监听全局 `pointerdown/pointerup`，按下期间绝不发合成手势），
  否则会和用户拖动打架、导致宿主拖拽手柄卡死；合成手势的 `setPointerCapture` 覆写必须 try/finally 还原。
- 左侧栏底部不再放插件入口。
- 快捷键必须在 DSH 快捷键设置里可见、可改；无会话时返回 blocked 并提示「请先选择会话」。
- **开始页（Guide）卡片的快捷键提示**：guide entry 必须带 `commandId`，且要等于注册的快捷键 id，
  宿主才会在卡片右侧显示键位（如 ⌘U）；id 统一用常量 `SHORTCUT_ID`，两处不能各写各的。

## 6. 设置（头部左侧齿轮）

标题就叫 **「设置」**；弹层要精简、优雅：

- 默认维度（日/周/月/季/年）
- 显示卡片（会话消耗 / 用量统计 / 账户余额）
- 显示消费金额（关掉后只显示 Token）
- 自动刷新（开/关；用量 2 分钟、余额 5 分钟；页面隐藏暂停）
- **隐藏底栏会话统计**（默认开；关掉可恢复 DSH 原底栏）
- **用量明细列表**（默认关：只显示来源行 + 合计；打开后在来源行下方追加逐期 `Token · 金额`）
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
  - opencode / opencode-go / opencode-zen：`GET https://opencode.ai/zen/go/v1/usage`（Bearer Key），
    返回套餐百分比；卡片显示「套餐剩余 xx%」+ 进度条 + 5 小时/本周/本月三档已用
    （`opencode-go` 的凭据引用是 `OPENCODE_GO_API_KEY`；`opencode`/`-zen` 用 `OPENCODE_API_KEY`）
  - 其他不支持的 Provider 显示「暂未开放余额接口」并改为展示本会话 Token/请求数（不给无效重试按钮）；未配置 Key 显示「未配置 … API Key」
  - Provider 卡为大号余额 + 使用率进度条（已用百分比与金额同行，总额只出现一次）+ 更新时间 + 单行说明
- 只要出现第三方来源（含单 Provider 会话）账户卡就用**来源 tab**（`aup-src-tabs`）列出每个来源（DeepSeek API / 各第三方 Provider），
  点击切换显示该来源的余额；默认**自动选中当前会话正在使用的 Provider**（Host 返回 `lastRoute`，客户端映射成 `preferredSource`）；**禁止**使用「部分 {provider}」这类徽标或说明文字；
  所有 tab 共用一个内容盒（`aup-account-body`，min-height 96px、内容顶部对齐），
  **切换 tab 不允许改变卡片高度**；tab 模式下省略 Provider 说明/更新时间等附加行；
  第三方余额与 DeepSeek 钱包一样实时读取（opencode 走套餐百分比）；
  用量统计卡统一为「按来源一行 + 占比条 + 合计」（见 §13），卡标题不挂任何徽标
- 设置里的「用量明细列表」打开后，在来源行下方追加逐期 `Token · 金额` 明细（悬浮可看完整日期/Token/金额）
- 明细列表**高度恒定由「卡片拉伸填满面板」保证**：卡片高度由 flex 决定、与行数无关，
  所以切维度（日↔季↔年）时卡片总高不变、下方卡片与 tab 行不闪动；
  **不再使用不可见占位行**（`.aup-series-slot` 已删除，它会在拉伸后变成多余的空白）；
  行高只设 `min-height` 不设死高度，内容变长时行会长高而不是被压住。
- 明细列表模式下，期数按维度**固定封顶**（`DIMENSION_ROW_CAP`：日/周/月 4、季 3、年 3），
  只丢弃**最旧的**期数、保留最新的；合计跟随实际显示的行。
  **禁止用 ResizeObserver + setState 做「按高度动态减行」**：那会形成
  布局→setState→布局 的反馈环，曾经把 DSH 直接搞崩（2026-11-08 09:29 崩溃报告）。
  宁可少显示几行，也不要任何自反馈的布局测量。
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
- 面板充满右侧栏整高整宽：卡片 `flex:1 1 auto` 拉伸，卡内底部块 `margin-top:auto` 吸收剩余高度，绝不在面板底部留空白带
- 按模型统计：无冗余小标题，每行 `Provider - 模型短名    Tokens`（最多 3 行，过长换行，绝不降字号）
- 统计区为**对齐两列表格**（标签列 `max-content`、值列右对齐，行高 20px、列间距 16px）；
  数值过长时只允许收紧字距（`statValueClass` → letter-spacing），**绝不能改字号、也不能与相邻列重叠**；时长使用紧凑格式（如 1时44分 / 2分57秒 / 1.7秒）；用量统计每日行单行显示 Token · 金额，行高有下限，禁止重叠
- 卡片文本无省略号；长文本换行、长金额只收紧字距（字号恒 13px）
- 面板最小宽度 340px，低于它会被自动纠正；万一纠正失败，模型行 `Provider - 模型名` 换行显示（不降字号）
  （`.aup-model-row` 用 `flex-wrap`），token 数值 `margin-left:auto`，绝不压到文字上
- 底栏 dock + ContextMeter 一起隐藏（只隐藏 slot 不够）
- 三张卡固定叫「会话消耗 / 用量统计 / 账户余额」，**不许改名、不许新增第四张卡**（「会话明细」已废弃）；
  会话卡负责本会话 Token/统计/按模型/上下文，用量统计负责平台周期数据（纯第三方会话显示各来源小计），余额卡负责余额
- 第三方 Provider 会话不显示 DeepSeek 余额/平台用量，改显示 Provider 余额
- 上下文只保留一条按占用比例着色的堆叠条；Token 构成条与明细标签颜色圆点对应
- 用量统计统一为「按来源一行 + 占比条 + 合计」，不再使用趋势柱；明细列表逐期单行 Token · 金额，0 用量淡化
- **优先左右结构**：来源行用 `标签 | 占比条 | Tokens | 金额/本会话` 的四列网格；账户卡的余额/套餐标题与数值
  必须在同一行（标签左、数值右），不要把「套餐剩余 / 99%」上下堆叠导致右侧大片空白
- 快捷开栏**不改宽度**；只在面板实测宽度 < 340px 时自动加宽回 340px（测不到就不猜），失败静默
