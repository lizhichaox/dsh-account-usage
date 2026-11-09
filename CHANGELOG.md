# Changelog

## 1.0.16 — 2026-11-09

### 面板只剩两张卡：删掉「用量统计」，按 provider 的会话内消耗并入会话卡

- 用户原话：「第二个卡片的 usage statistics 没什么用，不想要了，把按 provider 类型对应的会话内消耗
  都归到 session usage，删掉，只剩下 session usage 和 Account balance」。
- 面板从三张卡收敛为**两张**：**会话消耗 → 账户余额**（与当前会话走哪个 Provider 无关，卡名不变，
  仍是四个中文字、居中、不挂 provider 徽标）。
- 会话卡在**统计表之后、按模型明细之前**新增「按 provider 的会话内消耗」块
  （`.aup-providers` / `.aup-provider-row` / `.aup-provider-name` / `.aup-provider-tokens`）：
  每个 provider 一行「名称 Tokens」，只写该 provider **本会话** Token 合计，**不含金额**；
  引出它的分割线 `.aup-sep-providers` 与该块**同生共死**（阶梯隐藏时一起隐藏，不留连续两条线）。
  按 provider 行与账户余额来源行共用同一套父级网格 + subgrid + `align-items:center`。
- 随卡片一并删除：日 / 周 / 月 / 季 / 年 / 全维度 tab、`SERIES_ROW_SLOTS=4` 固定槽位、
  维度缓存 `dimensionResults` 与全维度预热 `WARM_ORDER`、骨架槽位、
  `描述 | 用量 | 金额` 三列表格、`PLAN` 套餐标记、平台来源行 `.aup-srcs`、逐期明细列表、
  两卡共用的三列页脚网格、设置里的维度/金额/明细开关。
- 后果：**平台周期用量与消费金额不再在面板任何位置展示**。Host 侧平台用量路由
  （`GET /account-usage/platform/usage` 等）**保留未删**，`test/provider-host.mjs` 仍在覆盖，
  只是面板内没有消费方；client 不再调用 `readUsage`，用量 2 分钟自动刷新随之移除，余额 5 分钟刷新不变。
- 设置从 7 项收敛为 **4 项开关 + 恢复默认**：会话消耗卡、账户余额卡、自动刷新、隐藏底栏会话统计。
  删除「默认维度」「显示消费金额」「用量明细列表」；旧 localStorage 键
  `dimension` / `showCost` / `usageList` / `cards.stats` **静默忽略**（不报错、不迁移、不提示）。
- 高度与阶梯（`node test/layout-check.mjs --tiers` 真实 markup 实测，420px 宽三来源夹具）：
  删卡后整屏内容 **526px**（会话卡 408 + 余额卡 112 + 6），面板 chrome 另占 **58px**，
  所以**面板 ≥ 584px 即可全部显示**（旧的 820px）。
  阶梯整体下移并新增「去按 provider 行」一级：**584 去 Token 彩条 → 575 去按模型明细 →
  532 去统计行 → 448 去按 provider 行 → 384 去上下文块 → 325 去 Token 2×2 明细**
  （对应内容 526 / 517 / 474 / 390 / 326 / 267 / 185，各 + 58 chrome），
  区块与引出它的分割线一起隐藏；来源预算改为 **`(n-3)×44`**（4/5/7 来源 570/614/702），
  7 来源兜底从 802px 降到 **343px**。规则仍带 `!important` 放在样式表最末。
- 两卡高度按信息密度分摊（#47，用户：「底部太挤了 上面太空了 两个卡片的高度没安排好」）：
  剩余高度不再全部灌进会话卡，按 **3:1** 分摊（会话卡约四分之三、余额卡约四分之一），
  会话卡 `flex:3 1 auto`、余额卡 `flex:1 1 auto`，
  余额卡内部 `.aup-acct-srcs{align-content:space-evenly}` 用行距摊开；
  实测 1080px → 780/236、1200px → 870/266，余额卡始终 ≤ 列高 34%。
- 按模型明细不再与按 provider 行重复（#48，用户：「重复了 provider+type 保留一次统计即可」，
  截图里 provider 行与 `Provider-模型` 行数值一一相同）：**只有本会话跑了 ≥2 个模型的 provider
  才逐模型画行**；单模型 provider **不画模型行**，它的数值由上方「按 provider 的会话内消耗」行承担，
  **零信息丢失**；多模型 provider 的模型行之和仍等于其 provider 行。这是「不画」而不是截断，
  也仍不写「另有 N 个模型」。阶梯里的「去按模型明细」一级（`.aup-models` + `.aup-sep-models`）不变。
- 文档：AGENTS.md 速查表新增 **#46**（删统计卡）、**#47**（两卡高度按密度分摊）、
  **#48**（provider 与模型不重复统计），并在 §13 记录这三条决策取代 / 修订了哪些旧规则
  （#46 → #3 / #10 / #20 / #24 / #26 / #28 / #29 以及「三张卡固定叫…」「全 (ALL) tab」
  「用量统计统一为按来源一行 + 合计」；#47 → #5 里「余额卡按内容收紧」那半条；
  #48 修订 #45：不隐藏信息 = **该画的行全量渲染**，而不是每个 provider 都画模型行）。
- 验证：`npm run verify`（语法 + 冒烟 + 敏感信息扫描 + 索引自检）；`npm run verify:ui`
  （真实 client.js 渲染的真实 markup 在本机 Chrome 无头里量几何）。
  新增冒烟断言：`the panel renders exactly two cards` / `the deleted statistics card never renders` /
  `four-character card titles` / `the deleted statistics copy is gone` / `one row per provider used this session` /
  `each provider row names its provider` / `each provider row totals that provider session tokens` /
  `the per-provider rows carry no amount` / `the provider block sits after the statistics table` /
  `the provider block sits before the per-model detail` / `the provider block has exactly one separator` /
  `the provider separator goes with its block` / `the client no longer calls the platform usage reader` /
  `the deleted statistics surface is gone`；设置区：`settings keep exactly four switches` /
  `the four switches are the two cards, the composer-stats toggle and auto refresh` /
  `no range picker remains in the settings` / `reset action present` / `settings title is short` /
  `settings can be closed from the header` / `footer hint is one short line: …`。
  #47 的断言：`the dense session card absorbs the largest share of the leftover height` /
  `the balance card shares the leftover height instead of hugging its content` /
  `the provider balance card takes the same share as the plain one` /
  `no balance card rule pins the card to its content` / `the balance card never outgrows the session card` /
  `the session content spreads evenly over the space it gets` / `the balance rows fill the space their card is given` /
  `the balance rows spread out inside the balance card` / `the panel fills the pane height` /
  `no card earns space just for being last`，外加 layout-check 的 `space allocation`
  （余额卡随面板增长 ≥20px、会话卡增长更多、余额卡 ≤ 列高 34%）。
  #48 的断言：`an all-single-model session renders no per-model detail` /
  `one provider row per provider, never one per model: …` /
  `a folded single-model provider row still carries that model tokens, so nothing is lost: …` /
  `no "另有 N 个模型" counter replaces a folded provider` / `a multi-model provider keeps one row per model: …` /
  `the multi-model provider row is the sum of its model rows: …` /
  `a mixed session details exactly the multi-model model rows: …` /
  `every detail row belongs to the multi-model provider: …` /
  `a single-model provider is not repeated in the per-model detail` /
  `the per-model separator goes with the dropped detail`。
  `verify:ui` 覆盖 420px 宽 × `325/384/448/532/575/584/585/700/900/1080/1200`px 与 340px 宽 ×
  `584/900/1080`px；`detailModelCount()` 先算出应画行数 M（多模型 provider 的模型数），再断言
  `${label}: model rows truncated -> N/M`；另加负向断言 `the old viewport ladder is gone`。

## 1.0.13 — 2026-11-09

### 第三方 Provider

- **Command Code 额度也能在右侧栏看**（用户：装了 `@mars-sea/dsh-commandcode-provider` 后额度只能在设置里看，
  习惯在右侧栏看额度状态）。账户卡的 Command Code 来源行显示 `5HW / WEK` 两档**剩余**百分比与
  `CRED / 额度` 剩余金额，例如 `5HW 0%  WEK 50%  CRED 6.99$`；不新开 tab、不改它的设置页。
- Host 侧读取它官方的 `GET https://api.commandcode.ai/alpha/billing/credits`
  （Bearer `COMMANDCODE_API_KEY`，只走 Host，60 秒缓存）：一次请求同时拿到 5 小时 / 周两个窗口的
  `used` / `cap` 与 `monthlyCredits`（套餐剩余）/ `purchasedCredits` + `freeCredits`（充值/赠送）。
  `cap` 为 0（套餐未设限）的窗口不画；额度缺失就不写额度对；失败只显示短状态，无 Retry。
- 用量统计卡照常显示 Command Code 来源的本会话 Token 与 `PLAN` 标记。
- 测试：`provider-host` 覆盖窗口换算、未设限窗口、额度为零/缺失、鉴权与格式错误；`provider-client` 覆盖
  中英文行文案、只有额度/只有窗口两种降级；冒烟测试锁定 `5HW / WEK` 与 `CRED` 的格式。

## 1.0.15 — 2026-11-09

### 会话卡不再隐藏任何信息

- 取消「最多 3 个模型 + 另有 N 个模型」的截断：模型有多少就列多少，**会话卡里任何一行都不再折叠**。
- 高度改由框架压缩换取：卡片 `gap` 4→3、会话体 `gap` 6→4、会话统计行距 2→1、Token 彩条 8→6、
  总量行高 26→24、模型名行高 18→17；三来源整屏内容 **793px → 763px**，面板 820px 即可全显示。
- 短面板的收窄阶梯随之下移：`820/811/751/667/608`，按来源追加预算改为 `(n-3)×69`；
  阶梯只会整块隐藏，绝不出现「部分模型行」。`verify:ui` 断言模型行数量要么全显示、要么为 0。

## 1.0.14 — 2026-11-09

### 图标

- 右侧栏「用量」tab 与开始页卡片的图标改为宿主 primitives 的 `IconGaugeOutlineRegular`（仪表盘），
  与窗口左上角快捷簇里的「用量」按钮同一符号；primitives 不可用时回退到同形内联 SVG。
  钱包图标不再作为入口图标（账户余额卡内部的卡片图标保留）。

## 1.0.12 — 2026-11-09

### 排版

- **分隔符前后不再留空格**：模型行 `OpenCode Go-deepseek-v4.1-flash`、
  轮/步 `8/317`、上下文 `595K/1M（60%）`、中文标签「轮/步」；
  横线与斜杠紧贴文字，窄面板因此少占 ~30px 横向空间，同时模型行在 300px 也能单行。
- `verify:ui` 的窄屏断言新增「模型行不折行」；冒烟测试锁定无空格分隔符。

## 1.0.11 — 2026-11-09

### 窄屏

- **300px 的最坏情况也能单行**：新增 ≤320px 超窄档（内边距 5px、名称字距 -0.4、
  对内间距 2px），三个窗口全为 `100%` 的行按数值文本长度自动再紧一档（确定性 class，不测量）。
- `verify:ui` 扩到 62 个状态：320/310/300px 同时覆盖「三个 `100%`」与「两个 `100%` + 84%」两种夹具。

## 1.0.10 — 2026-11-08

### 窄屏

- **最小宽度护栏从 340px 降到 300px**（宿主最窄值）：拖到最窄不再回弹，340px 保留为舒适宽度。
- **≤330px 自动进入窄屏紧凑档**：余额行间距再收紧、数字用 proportional-nums，
  上下文图例与合计行改为不换行；典型数值在 ~300px 仍单行显示，不缩放字号。
- `verify:ui` 增加 330/300px 全面板几何与单行断言。

## 1.0.9 — 2026-11-08

### 账户卡

- **余额行在最小宽度（340px）不再换行**：收紧「短标签 数值」对的间距与字距，
  三个窗口全为 `100%` 的最坏情况也能单行显示；`verify:ui` 新增 340px 单行断言。
- **所有货币符号都放到金额后面**：`9.50$`、`23.28¥`、`12.00€`（不再有 `$9.50` 前缀形态）。

## 1.0.8 — 2026-11-08

### 介绍语（收紧到 20 字）

- 介绍语从 49/25 字进一步压到 **20 字以内**：英文 `Balances + tokens.`（18 字符）、
  中文「余额与 Token 用量」（12 字）；不再罗列日/周/月/季/年。
- `market/check.mjs` 的上限同步改为 20 字。

## 1.0.7 — 2026-11-08

### 介绍语

- 插件列表 / 市场 Discover 的介绍语压到 50 字以内：
  英文 `Balances + tokens by day/week/month/quarter/year.`（49 字符），
  中文「余额与 Token 用量，按日/周/月/季/年汇总」（25 字）；
  `package.json`、索引生成器与 `market/index.json` 三处同步，`market/check.mjs` 强制 ≤50。

## 1.0.6 — 2026-11-08

### 图标

- 上架图标从「钱包 + 时钟」改为「蓝色圆角块 + 三条递增柱状条」，明确表达 usage；
  `icon.svg` 同时驱动设置里的已安装列表与 `market/index.json` 的 data URI。

### 账户卡

- 当前会话正在使用的来源（最新一条 assistant 消息的 provider）以整行淡品牌色背景 + 名称加粗凸显；
  不加圆点/胶囊，不改变列宽与左右边缘，`aria-current` 暴露给读屏；单账号会话不加强调。

## 1.0.5 — 2026-11-08

### 账户卡与进度条

- 账户卡去掉来源 tab：每个来源一行（名称左、数值和短说明右），三个以上来源不再换行，短内容不再预留空白；不显示当前来源圆点。
- 除会话卡外取消胶囊进度条：用量统计改为 `描述 | 用量 | 金额` 三列表，账户卡直接写余额或剩余额度。
- 余额卡只显示余额 / 赠送 / 套餐剩余，不显示 Used 或 costs。OpenAI / Anthropic 按用户决定显示 `Unsupported`，不读取管理员凭据、不请求组织花费接口；超时缩短为 `Timed out`。
- 统一数值格式：`Balance 199.54¥  Bonus 0.00¥`；套餐为 `5HW 63%  WEK 70%  MON 85%`，全部是剩余比例，无 left 字样。
- 去掉所有卡片错误态的 Retry 按钮；读取失败只保留状态，顶部刷新及定时刷新不变。
- 会话卡隐藏某个区块时，引出它的分隔线一起隐藏，不再出现连续两条线。
- 内容高度降到 793px（三来源夹具），阶梯重算为 `850 / 838 / 771 / 680 / 615`，来源数 ≥4 时追加 `16 + (n-3)×52` px；几何测试覆盖 3/4/5/7 个来源、中英文、340/420 宽。

### Provider 统一优化

- 修复跨来源回退数据：每行只显示自己的余额或错误，不再混入 Go 等其它来源的数据；会话 Token 留在统计卡。
- 余额、加载态、错误按请求 provider id 独立保存；保留 DeepSeek/OpenCode 别名身份，避免不同凭据串账。
- 未接入/缺密钥/鉴权/凭据存储/超时/网络/返回格式错误统一短状态。读取失败不额外重试，旧响应不会覆盖新结果。
- 取消中的平台请求不再让纯第三方会话的刷新按钮永久禁用。
- OpenRouter 账户余额必须同时有 credits 和 usage；回退密钥数据标注作用域，不能用缺失 usage 推断全额未用。
- 修复只验证范围 tab、却漏掉账户 tab 60px 位移的问题（后续已改为无 tab 的来源行）。
- 新增 18 项 Host 模拟测试（含 OpenAI/Anthropic 零凭据读取、零外部请求回归）、真实 Client 渲染/effects 回归及多来源中英文几何检查；修复夹具 ARIA 布尔属性序列化。测试不等同于当前 GUI 实时像素验收。
- 本轮不发布 npm，不修改市场版本。

### 修复

- **点击范围 tab 不再改变面板高度**（日/周/月/季/年/全 互切）：
  - 加载骨架改为与真实卡片同构等高（同样的来源行 + 固定 4 个逐期槽位 + 同高的合计行），
    此前骨架行数按维度取 4/3、且没有来源行和合计行，切换时会先塌一下再弹回
  - 没有用量的范围也保留 4 个槽位（渲染 0 行），不再因为「该范围没数据」而收掉整个列表
  - 合计行第三格被一条后置规则撑到 26px（其余两格 18px），已统一为 18px——
    这正是 ready 比 loading 高 16px 的来源
- 新增回归守护：`verify:ui` 在固定面板下测量 6 个范围 × ready/loading/empty 三种状态，
  卡片高度必须完全一致，实测均为 `572 / 279 / 159 px`（面板 1080px）

### 变更

- 阶梯阈值随内容高度重算（内容 838px、面板 896px 全显示）：`895 / 883 / 823 / 739 / 681`
- 浏览器几何用例的高度档位改为在 `895 / 896` 这两个临界值上验证

## 1.0.4 — 2026-11-08

### 优化（期数标签带年份）

- 用量表的期数标签一律带年份：日/周改为 `YYYY-MM-DD`（原来只有 `11-05`），
  月 `YYYY-MM`、季 `YYYY Qn`、年 `YYYY` 保持一致；描述列不再空出一截，整张表更齐整。

### 优化（金额显示）

- 金额只显示货币符号、不显示货币代码：`CN¥23.28` → `23.28¥`（`Intl.formatToParts` 重排，保留千分位/小数点/负号）。
  其它货币保持自身惯例（`$11.04`），只有人民币把 `¥` 放在数字后面。

### 优化（第三方行标记）

- 用量统计表第 4 列：DeepSeek API 行仍是真实金额；第三方 Provider 行（OpenCode Go / OpenRouter）
  没有平台金额，改为显示**套餐标记**——英文 `PLAN`、中文「套餐」，取代原来的 `session` / `本会话`
  作用域提示（曾试过 `SUBSCRIPTION`，因太长改为短词 `PLAN`，与账户卡「套餐剩余」用词一致）。

### 优化（用量统计改为四列严格对齐的表）

- 用量统计卡不再分「来源组」「逐期组」各写一套网格：**整张卡只有一张四列表**
  （`描述 | 胶囊进度条 | 用量 | 金额`），两组行都用 `display:contents` 成为同一张表的行，
  于是所有进度条落在同一条竖线、所有数字右对齐在同一列——此前两组列宽不同、条形与数字互相错位
- 每行固定 4 个单元格（空值也输出空单元格），行内垂直居中；行距 21px、组间 4px，
  两组之间用一条 0.5px hairline 分隔（`::before` 实现，不占布局）
- 胶囊条统一 6px 高、圆角 999px；用量/金额列一律右对齐

### 新增

- **「全」(ALL) 维度**：在「年」之后新增第六个 tab，汇总所有能取到的月份。
  窗口从 3 年开始，最老一个月仍有数据就继续往前扩（最多 6 年）；首次发现的最早月份写入
  `localStorage`，之后不再重复扫描。行按年份展示（最多 4 行），**合计永远是全部年份的总额**。
- 会话卡八项指标按语义成对重排：轮/步 + 请求数（量）→ 缓存命中 + 平均（效率）→
  输出速度 + 首 TTFT（响应）→ 模型用时 + 工具用时（时间分配），两列之间加一条 0.5px 分隔线。

### 优化（页脚结构统一 + 夹具修正）

- **两张卡的页脚统一为左 / 中 / 右三列**：会话卡的上下文图例（System / Tools / Messages）与用量统计卡的
  合计行（合计 tokens / 请求数 / 金额）现在共用同一套网格，中间格对齐面板中线；
  合计行固定输出 3 格（无金额时输出空格），结构不会再被内容左右。
- **修正测试夹具**：真机几何测试的投影数据缺少上下文窗口，面板因此跳过了上下文块和图例，
  量出的内容高度比生产少 36px——阶梯系数整体偏低，在 869–903px 高的面板里仍会出现「看不见的滚动」。
  夹具补上 `contextPressure` / `contextBreakdown` 后重新量取：内容 846px、面板 904px 即可全显示，
  阶梯阈值改为 903 / 891 / 831 / 747 / 689，并在 903/904 两个临界高度加了回归用例。

### 优化（空间按信息密度分配）

- **剩余高度交给信息最密的卡片**：此前是「最后一张卡吸收剩余高度」，结果只有三行数字的
  账户余额卡被撑满整片空白（用户点名：最不该占空间的卡片占了大片空间）。
  现在会话卡（8 项指标 + 按模型 + 上下文）`flex:1 1 auto` 吸收剩余高度，内容用
  `justify-content:space-evenly` 均匀摊开；账户余额卡 `flex:0 0 auto` 按内容收紧，
  内部余额/套餐块不再拉伸。`verify:ui` 新增断言：面板变高时会话卡必须变高、余额卡高度必须不变。

### 优化（不滚动 + 全部信息）

- **面板彻底不滚动**：先压缩高度（卡片 `padding:8px` / `gap:4px`、行高 18px、逐期行 19px 等），
  整屏内容从 886px 压到 **790px** —— 面板高度 ≥ 848px 时三张卡的全部信息一次显示完
- **收窄阶梯改用容器查询**：`.aup-root` 加 `container-type:size`，按**面板自身高度**
  （856/835/776/702/680）依次收窄。此前用 `@media (max-height:)` 按窗口判定，
  而面板比窗口矮约 90px，阈值总是慢一拍，这才是「阶梯写了却仍滚」的真正原因
- 滚动条外观保持移除；`overflow-y:auto` 只作为极端窗口的隐形兜底

### 测试

- 新增 `test/render-fixture.mjs`：用与冒烟测试相同的桩启动**真正的 client.js**、以真实状态渲染面板
  并序列化成 HTML。`npm run verify:ui` 改为测量这份**真实 markup**（此前是手写近似，与真实渲染脱节，
  把真实溢出藏住了），覆盖 420/340px 两种宽度 × 700→1200px 七档高度 × 日/月/全 三种维度，
  断言零重叠、零溢出、无空白带、不滚动、列对齐、行内垂直居中。
- 阶梯阈值改由 `--tiers` 针对真实 markup 重新量取。

## 1.0.3 — 2026-11-08

### 布局（确定性，不再依赖运行时测量）

- **面板充满右侧边栏的整高整宽，底部不留空白带**：卡片高度 = 内容高度（`flex:0 0 auto`），
  由**最后一张卡**（`.aup-cards > .aup-card:last-child{flex:1 1 auto}`）吸收剩余高度。
  卡片永远不会被压缩到内容以下，因此卡内文字**不可能互相遮挡**。
- **任何情况都不滚动、不出现滚动条**：内容按窗口高度用媒体查询阶梯依次收窄
  （`989px` 去 Token 彩条 / `959px` 去上下文百分比图例 / `929px` 去按模型明细 /
  `889px` 去统计表 / `789px` 去整个上下文块 / `739px` 去 Token 2×2 明细）；
  阶梯阈值由真机测量得出，规则放在样式表**最末并带 `!important`**（媒体查询不增加特异性，
  早先被后面的基础规则盖掉，是「减内容一直不生效」的真正原因）；
  滚动条外观用 `scrollbar-width:none` + `::-webkit-scrollbar{width:0;height:0;display:none}` 移除。
- **切维度（日↔周↔月↔季↔年）零抖动**：明细列表固定 4 个槽位（不足补不可见占位行），
  行距固定；骨架行数对齐目标维度；后台按 `WARM_ORDER` 预热全部维度，切换不出现加载帧。

### 对齐

- **同一组行共用一套网格**：来源行与逐期行改为父级网格 + 行内 `grid-template-columns:subgrid`，
  进度条起点、Tokens、金额右边缘全部对齐（此前每行各写一套网格，标签列按行取 `max-content`，实测差 13px）。
- **行内垂直居中**：subgrid 行显式 `align-items:center`，进度条穿过文字中线
  （漏写会退化成顶对齐，实测偏 7px）。

### 文本可读性

- **英文字不再发浅**：字体栈把 `Helvetica Neue` / `Arial` 排在中文字体之前，
  面板根节点统一 `font-weight:500` 基线，次要文字色用主题 token 混色
  `--aup-label-2`（浅色约 8.6:1，裸 `label-secondary` 仅 5.8:1，深色自动反向变亮）；
  0 用量行淡化系数从 `.45` 提到 `.62`。
- 字号仍然**全局只有一档 13px**，层级只靠字重（600 合计 / 500 常规）。

### 测试

- 新增 `test/layout-check.mjs`（`npm run verify:ui`）：用本机 Chrome 无头模式渲染真实样式表，
  让面板高度等于视口高度（与媒体查询判定基准一致），在 7 档窗口高度下测量真实几何，断言
  **文本零重叠、卡片零溢出、无横向溢出、最后一张卡贴住面板底、卡片列从不滚动、
  跨行列边缘对齐、行内垂直居中偏差 ≤ 1px**；关键断言都做过反向验证（改坏会立刻失败）。
- `npm run verify` 增加上述契约对应的字符串断言，`npm test` 现在同时跑冒烟与真机几何检查。

## 1.0.2 — 2026-11-07

### 新增

- 中英双语：跟随 DSH 语言设置，中文显示中文，其它语言统一英文
  （`ja / es / fr / de / ru / pt` 显式注册英文词典，语言包回退到 `en`）
- 第三方 Provider 会话支持：
  - 全部走第三方时隐藏 DeepSeek 余额与平台用量
  - 新增「会话明细」卡：会话统计 + 按模型 + 上下文
  - 账户卡改为 Provider 余额：剩余 / 已用 / 总额、使用率进度条、更新时间
  - 支持 OpenRouter（`/api/v1/credits`，回退 `/api/v1/key`）与 DeepSeek API Key
    （`/user/balance`）
  - Provider API Key 只在 Host 侧读取，不下发浏览器
- 会话统计指标：轮数 / 步数、请求次数、缓存命中、平均每请求、输出速度、
  模型用时、工具用时、首 token 平均、输出 Tokens
- 设置项「隐藏底栏会话统计」（默认开）：隐藏 DSH 输入框下方的统计 dock 与
  ContextMeter，数据完整并入右侧面板

### 优化

- 会话卡重新分组：Token 合计 / 构成条 / 2×2 明细 / 对齐统计表 / 按模型 / 上下文
- Provider 模式改为三卡（会话消耗 / 会话明细 / 账户余额），填满面板、无底部空白
- 数字层级统一为 `20px / 16px / 13px` 三级，全部 500 字重与 `tabular-nums`
- 账户余额卡紧凑化：标签与金额同一行，余额 / 赠送额度统一 16px
- 上下文两条进度条合并为一条按占用比例着色的堆叠条
- Token 构成彩条与 2×2 明细标签颜色圆点对应
- 用量统计每日行单行 `Token · 金额`；0 用量日期淡化
- 移除所有文本省略号；长模型名显示短名，金额过长自动降字号
- Provider 余额卡去重：已用百分比与金额同行，总额只出现一次

### 修复

- 修复卡片使用 `container-type: size` + 内容高度导致的塌陷/整块空白
- 修复统计标签与数值相互遮挡、每日行文字重叠
- 修复 Provider 会话与 DeepSeek 会话布局不统一

## 1.0.1 — 2026-11-07

- 右侧栏快捷键自动收窄、余额卡紧凑布局、浅色/深色主题细节等修复

## 1.0.0 — 2026-11-07

- 首个公开版本：真实账号余额、按日/周/月/季/年真实 Token 用量与消费、会话 Token
