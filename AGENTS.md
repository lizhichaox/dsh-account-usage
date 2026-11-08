# AGENTS.md — 账号用量插件：长期要求与约定

> 这是用户对本插件的**长期要求清单**。接手前先读本文件，不要重复询问已经写在这里的偏好；
> 用户不想反复重申。若实现与本文件冲突，以用户当次明确指示为准，并在完成后回写本文件。

最后更新：2026-11-08 · 插件版本：`1.0.3`

- 插件目录：`/Users/lizhichao/vc/macos/dsh/dsh-preset/account-usage-panel`
- GitHub：<https://github.com/lizhichaox/dsh-account-usage>
- npm：<https://www.npmjs.com/package/dsh-account-usage>（包名 `dsh-account-usage`，作者 `chaox`）
- 市场索引：<https://lizhichaox.github.io/dsh-account-usage/market/index.json>

## 0. 元规则：用户说过一次的要求，绝不让他说第二次

用户 2026-11-08 明确要求：「要把我对你的要求写入 AGENTS.md，不要总让我重复」。
这是一条**工作方式的硬要求**，和具体样式同等重要：

1. **同一轮落盘**：任何一轮对话里用户提出的新要求，必须在**这一轮**同时完成三件事——
   ① 实现；② 写进本文件（落到具体小节，写清「要什么 / 为什么 / 怎么验证」）；
   ③ 在 `test/smoke.mjs` 补一条**会失败**的断言。
   只写代码不写文件 = 没做完；只答应不落盘 = 没做完。
2. **先查后问**：用户提出任何要求前，先在本文件和 `test/smoke.mjs` 里找是否已有对应条目。
   已写过就按文件执行，不要反问、不要要求用户重述。
3. **冲突以当次为准**：新要求与本文件冲突时，改实现 + 改本文件（并在 §13 记一句「取代了哪条」），
   不要两条规则并存。历史上的「卡片按内容自适应、剩余留底部」就是这样被「充满整高整宽」取代的。
4. **交付前自查**：逐条对照 §0.1 速查表。任何一条既没有实现、也没有断言，就是没交付。
5. **无法自动验证的**（真机像素、字体渲染、动画手感）：如实说明是靠 CSS/契约测试，
   并写清「需要用户肉眼确认的具体是哪几处」，不许假装验证过。
6. **用户重复同一句话，是我们失职**，不是用户啰嗦——重复发生时，把漏掉的那条补进本文件并为它补断言。

### 0.1 硬性要求速查表（每次交付前逐条勾）

> 断言名就是 `test/smoke.mjs` 里那句 `assert` 的说明文字；改实现时这些断言必须继续通过。

| # | 要求（用户原话要点） | 实现要点 | 冒烟断言 |
|---|---|---|---|
| 1 | 右侧栏能看到额度 / 费用 / tokens | Host 读真实平台接口，三卡面板 | `real platform amount shown` |
| 2 | 只用真实数据，不许假估算 | 平台 usage / 余额接口，失败才回退并带 `≈` | `account reader does not fetch the profile` |
| 3 | 三张卡、四字中文标题、居中、**不许改名、不许第四张** | 会话消耗 / 用量统计 / 账户余额 | `four-character card titles` |
| 4 | **标题上不许挂 provider 标记** | 供应商只出现在账户卡来源 tab | `no provider badge inside a card head` / `no provider name inside a card head` |
| 5 | **面板充满右侧栏整高整宽、底部不留白，且空间按信息密度分配** | 会话卡吸收剩余并均匀摊开；余额卡按内容收紧 | `cards size to their content and are never squeezed` / `the dense session card absorbs the leftover height` / `the balance card hugs its content` / layout-check 的 `space allocation` 断言 |
| 6 | **卡内不许大块空白** | 底部块 `margin-top:auto`、拉伸块 `flex:1` | `session footer sits on the card bottom` / `stats footer sits on the card bottom` |
| 7 | 宽度也必须撑满 | 不写 `scrollbar-gutter`、不留右侧内边距 | `the card column spans the full pane width` |
| 8 | **内容不要被遮挡 / 裁切 / 省略** | `overflow:visible`、`min-height:auto`、无 ellipsis | `card text never uses ellipsis` |
| 9 | **所有文字同一个字号，只能加粗** | 单一 `--aup-fs-text`，层级靠 font-weight | `exactly one font size token exists` |
| 10 | **切 tab / 切维度不许闪动** | 固定槽位补齐列表高度 + 样式进 head｜详见第 20 行 | `the detail list is content sized` / `the list keeps a constant slot count` |
| 11 | tab chip 切走后不许变形 | 样式表注入 `document.head` | `the stylesheet is injected into document.head` |
| 12 | 快捷键开栏 **绝不擅自改宽度** | 只在实测 < 340px 时纠正，松手后才动 | `opening never resizes a wide sidebar on its own` |
| 13 | 开始页要显示键位 | guide entry 带 `commandId` = `SHORTCUT_ID` | `guide card links to the shortcut for its key hint` |
| 14 | **不许把 DSH 搞崩** | 禁止 ResizeObserver+setState 自反馈布局 | `row trimming never feeds back from a resize observer` |
| 15 | 底栏会话统计默认隐藏 | `<html data-account-usage-hide-stats>` | `the composer dock stats are hidden by default` |
| 16 | 头部齿轮设置（7 项） | `.aup-pop` 弹层 + localStorage | `settings button` |
| 17 | 不显示身份信息、不放跳转链接 | 不读用户资料、无外链 | `account reader does not fetch the profile` |
| 18 | **要求写进 AGENTS.md，别让人重复** | 本节 §0 | 见各条 |
| 19 | **英文文本不许看着浅** | 拉丁字体栈优先 + 根 500 基线 + `--aup-label-2` 混色 | `Latin families precede CJK ones in the stack` / `secondary text is darkened from theme tokens` / `the panel root sets a 500 baseline weight` |
| 20 | **切维度不许抖动** | 固定槽位 `SERIES_ROW_SLOTS=4` + 固定行距 + 骨架行数对齐 + 全维度预热 | `the list keeps a constant slot count` / `spare slots pad the list in quarter/year` / `period rows keep a fixed pitch across dimensions` / `the loading frame matches the target row count` / `every dimension is warmed widest-first` |
| 21 | **放不下就少放点，绝不许遮挡，也不许留白** | 卡片按内容撑开**永不被压缩**（遮挡从结构上不可能）+ 实测媒体查询阶梯按窗口高度减内容 + `npm run verify:ui` 真机测量 | `cards size to their content and are never squeezed` / `cards never clip their content` / `the summary is in normal flow, never positioned over the rows` / `short windows shed the decorative token bar via CSS only` |
| 22 | **不允许滚动、不允许出现滚动条，且尽量显示全部信息** | 先压缩高度（886→790px）+ 面板容器查询阶梯（856/835/776/702/680）+ 阶梯末尾带 `!important` + `scrollbar-width:none` | `the panel root is a size container` / `the measured shedding ladder contains: …` / `the old viewport ladder is gone` / `cards are padding 8 / gap 4` / `the card column never shows a scrollbar` |
| 23 | **同一组行左右对齐 + 行内垂直居中** | 父级网格 + 行 `grid-template-columns:subgrid` + 行 `align-items:center` | `the source rows share one grid` / `rows take their columns from the shared grid` / `the period rows share one grid` / `subgrid rows centre their cells vertically` / layout-check 的 `srcTrackLeft`、`srcBar`（居中）断言 |
| 26 | **期数标签带年份** | 日/周 `YYYY-MM-DD`、月 `YYYY-MM`、季 `YYYY Qn`、年「全」`YYYY` | `day and week labels carry the year` / `day rows show YYYY-MM-DD` |
| 24 | **用量统计是四列严格对齐的表** | 描述 / 胶囊条 / 用量 / 金额共用一个网格；每行 4 格；第三方行第 4 列写短标记 `PLAN`（中文「套餐」） | `one shared table` / `the card declares the four columns once` / `the English marker stays short: PLAN` / layout-check 的 `table` 断言（barLeft、tokensRight、amountRight 唯一） |
| 25 | **金额只留货币符号，¥ 后置** | `Intl.formatToParts` 重排；仅 CNY 后置，其它货币按惯例 | `amounts use the narrow currency symbol` / `the spend row ends with the ¥ symbol` / `only the ¥ moves behind the amount` |

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
  - 面板边界留白要克制：root `padding: 0 8px 6px`、卡片间距 6px（不要回到 16px，会显得空旷）；
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
- **布局只用确定性 CSS，任何高度都不许靠运行时测量决定**（2026-11-08 反复踩坑后的最终架构）：
  1. **卡片高度 = 内容高度（`flex:0 0 auto`）**：卡片永远按内容撑开，**绝不可能被压缩到内容以下**，
     因此卡内文字不可能互相遮挡——遮挡的唯一成因就是卡片被挤小，此条从结构上杜绝。
  2. **剩余高度按信息密度分配，不是按位置分配**（用户 2026-11-08：
     「最不该占用空间的卡片占了大片空间…信息量多的地方多占点」）：
     - **会话卡吸收剩余高度**：`.aup-cards>.aup-card-session-fixed{flex:1 1 auto;min-height:auto}`，
       内部 `.aup-session-body{flex:1 1 auto;justify-content:space-evenly}`，多出来的高度被均匀摊在
       会话卡的各段之间，**不会在面板底部留白带**。
     - **账户余额卡按内容高度收紧**：`flex:0 0 auto`，内部 `.aup-account-body` / `.aup-provider-body` /
       `.aup-balance` 一律 `flex:0 0 auto` + `justify-content:flex-start`，
       **禁止**再用 `space-evenly` / `flex:1 1 auto` 把自己的几行数字撑成一大片空白。
     - 历史教训：曾让「最后一张卡」吸收高度，结果信息最少的余额卡吃掉了整屏空白，
       被用户点名骂——**分配空间要看卡片内容量，不要看它在 DOM 里的位置**。
  3. **明细列表固定槽位**：`SERIES_ROW_SLOTS = 4`，按维度渲染 1..N 行，剩余用**不可见占位行**
     （`.aup-series-slot`，`min-height:19px`）补齐；这样**切维度时列表高度恒定**，下面的卡片一动不动。
  4. **绝不允许滚动、绝不出现滚动条，并且尽量把信息全部显示出来**
     （用户 2026-11-08：「依然存在可滚动的窗口 优化一下 不滚动 显示全部信息」）。两层措施：
     - **先压缩：不删信息，只压高度**。卡片 `padding:8px` / `gap:4px`、卡间距 6px、根底部 6px、
       统计表行高 18px、逐期行 `min-height:19px`、会话体/统计体 gap 6px、Token 网格 gap 6px、模型行 gap 0。
       实测整屏内容高度从 **886px 压到 790px**（面板只需 848px 就能全显示，之前要 946px）。
     - **再按面板自身高度逐级收窄，用 `@container`（不是 `@media`）**：
       `.aup-root{container-type:size;container-name:aup-panel}`，
       阈值 `856px 去 Token 彩条 → 835px 去按模型明细 → 776px 去统计表 → 702px 去上下文块 → 680px 去 Token 2×2 明细`。
       **必须用容器查询**：窗口比面板高（右侧栏 tab 条 + 面板横条约 90px），
       之前用 `@media (max-height)` 判定基准错了，所以「阶梯明明写了却还滚」——这是反复踩的坑。
     - 阈值由 `node test/layout-check.mjs --tiers` 用**真实面板 markup** 逐级量出，
       规则放在样式表最末并带 `!important`（查询不增加特异性）。
     - 结论：面板高度 ≥ 848px 时全部信息可见；仅当 < 856px 才隐藏那条装饰性 Token 彩条；
       `< 586px` 属于极端窗口，只剩隐形兜底（此时仍无滚动条外观）。
  5. 明令禁止：用 `ResizeObserver`/`getBoundingClientRect` 的内容高度去反推行数并 `setState`
     （09:29 崩溃的成因）、用 `overflow:hidden` 或省略号假装解决放不下。
  6. **必须用真机浏览器验证几何，而且必须量真实 markup**：
     `test/render-fixture.mjs` 用与冒烟测试相同的桩**启动真正的 client.js**、用真实状态渲染面板、
     把元素树序列化成 HTML；`npm run verify:ui`（`test/layout-check.mjs`）再把它放进本机 Chrome
     无头模式的固定面板里测量，覆盖 420px/340px 两种宽度 × 700→1200px 七档高度 × 日/月/全 三种维度，
     断言 **文本零重叠、卡片零溢出、无横向溢出、最后一张卡贴底（无空白带）、卡片列从不滚动、
     跨行列边缘对齐、行内垂直居中**。
     曾经用手写 markup 近似面板，结果和真实渲染脱节、把真实溢出藏了起来——**禁止再手写 markup 近似**。
- **任何地方都不允许滚动**（用户 2026-11-08，取代旧的「卡内不滚、卡片列可滚」）：
  `.aup-cards` 的 `overflow-y:auto` 只是一层**不可见的兜底**（滚动条已 `display:none`），
  正常情况由上面的**容器查询阶梯**保证内容装得下，永远滚不动。优先级：
  **先减内容（阶梯）→ 装不下才轮到隐形兜底 → 绝不裁切、绝不遮挡**。
- **同一组数据行必须共用一个网格，左右都要对齐**（用户 2026-11-08：「左侧没对齐」）：
  来源行（`.aup-srcs`）、逐期行（`.aup-series`）都是**一个父级网格**，
  每行用 `display:grid;grid-template-columns:subgrid;grid-column:1/-1` 继承父级列宽。
  **禁止每行各写一套 `grid-template-columns`**：那样标签列按行取 `max-content`，
  进度条起点和右侧数值都会随行漂移（实测差 13px）。
  另外**行内单元格必须垂直居中**：subgrid 行要显式写 `align-items:center`，
  漏掉就会退化成 stretch/顶对齐，进度条会比文字高出一截（实测偏 7px，用户报「没居中对齐」）。
- **用量统计卡是一张四列表**（用户 2026-11-08：「左侧描述列 胶囊进度条 用量 金额 分为四个列 严谨对齐」）：
  `描述 | 胶囊进度条 | 用量 | 金额`。实现必须满足：
  - **整张卡只声明一次列模板**：`.aup-stats-body{display:grid;grid-template-columns:minmax(0,max-content) minmax(24px,1fr) minmax(52px,max-content) minmax(0,max-content)}`；
    来源组与逐期组都用 `display:contents` 把行提升为这张表的行。
  - **每行 4 个单元格**（`grid-template-columns:subgrid;grid-column:1/-1`），
    空值也要输出空 `span`，**绝不允许条件性少一个单元格**——少一个会把后面所有列错位（踩过）。
  - 第 2 列是**同样的胶囊条**（`border-radius:999px`，高度 6px，两组一致）；第 3、4 列一律 `justify-self:end` 右对齐。
  - 第 4 列的含义：DeepSeek API 行是**真实金额**；第三方 Provider 行没有平台金额，
    显示**套餐标记**——英文 `PLAN`、中文「套餐」（用户 2026-11-08：先要求把 `session` 换成订阅名词并大写，
    随即说 `SUBSCRIPTION` 太长要缩写，因此用短词 `PLAN`，同时与账户卡的「套餐剩余 / Plan left」用词一致）。
    **禁止**再用 `session` / `本会话` 这类作用域提示。
  - 两行组之间用 `::before` 画一条 hairline 分隔，**不能用 padding/border 撑行高**（会让行内元素偏离中线，被 `verify:ui` 的居中断言抓到）。
  - **期数标签一律带年份**（用户 2026-11-08：「或许把年份放出来这样可以更协调和优雅」）：
    日/周显示 `YYYY-MM-DD`，月 `YYYY-MM`，季 `YYYY Qn`，年 `YYYY`，全 `YYYY`。
    只写 `11-05` 会让描述列空出一截、整张表看着参差。
- 所有可用空间应尽量被有意义的内容覆盖；不要出现卡片内部的大块空白。

## 3. 文本与排版（重点，多次强调）

- **全局只有一个字号：13px**（`--aup-fs-text`）。中文、英文、数字、符号**全部同字号**，
  禁止出现任何第二档（不许 11/12/14/16/20px）。层级只能靠 **字重** 表达：
  主数字/合计 600，常规数值与标签 500，极少数说明文字 400。
  - 字族：`--aup-font-ui`（`-apple-system, "Segoe UI", "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`），
    中文、英文、数字、符号共用；数字容器加 `font-variant-numeric:tabular-nums`
  - 长数字/长模型名**不许降字号**：只能靠 `letter-spacing` 微调、换行或自适应列宽解决
- **英文/拉丁文字必须和中文一样「实」，不许发灰发浅**（用户 2026-11-08：「英文文本看着过于浅了」）。
  同字号同颜色下，拉丁字形比汉字笔画少、视觉墨色天然更浅，所以必须额外补偿，三条同时生效：
  1. **字体栈拉丁优先**：`Helvetica Neue`、`Arial` 必须排在 `PingFang SC` **之前**——
     一旦落到汉字字体的拉丁字形上会明显变细变浅（这是「英文发浅」最常见的原因）；
  2. **根上打 500 基线**：`.aup-root{font-weight:500}`，任何没有显式字重的文字都继承 Medium，
     **不允许出现继承默认 400 的情况**（全文件只保留 `.aup-pop-close-glyph` 的 × 是 400）；
  3. **次要文字色从主题 token 混出来**：`--aup-label-2: color-mix(in srgb, label-primary 30%, label-secondary)`，
     浅色约 8.6:1（裸 `label-secondary` 只有 5.8:1），深色自动反向变亮；
     文字一律用 `--aup-label-2`，只有**图标/描边**继续用裸 `label-secondary`。
  4. 0 用量行本来就淡化，叠上浅灰会看不见：`opacity` 提到 `.62`（轨道 `.6`），
     可以淡，但不能读不出来。
- **右侧卡片内所有文本禁止折叠、遮挡、省略、截断**。允许：
  - 自动换行（长模型名、Provider 名、说明、标签）
  - 简化文案（如「余额由 OpenRouter 提供」）
  - 列宽按内容自适应（日期列用 `max-content`）
- 不允许出现 `text-overflow: ellipsis`（当前全文件已清零）。
- Token 单位自动 `K → M → B → T`，最多两位小数；金额固定两位小数（正数按平台规则截断）。
- **金额只显示货币符号、不显示货币代码，且 `¥` 放在数字后面**（用户 2026-11-08：
  「留个¥就行 CN 没必要」→「金额符号放在价格后面吧¥ 这样看着更协调」）：
  - 人民币一律 `23.28¥`（`Intl.formatToParts` 重排，保留千分位/小数点/负号），**不写 `CN¥` / `CNY`**
  - 其它货币保持自身惯例（`$11.04` 而不是 `11.04$`，否则和 Provider 余额放一起很别扭）
  - 判定逻辑在 `moneyText()`：`String(currency) === 'CNY'` 时才后置符号
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

- 默认维度（日/周/月/季/年/全）；「全」= 第六个 tab，汇总所有能取到的月份（最多回溯 6 年）
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
  用量统计卡统一为**一张四列表**：`描述 | 胶囊进度条 | 用量 | 金额`（见 §13），卡标题不挂任何徽标
- 设置里的「用量明细列表」打开后，在来源行下方追加逐期 `Token · 金额` 明细（悬浮可看完整日期/Token/金额）
- 明细列表**高度恒定由固定槽位保证**：`SERIES_ROW_SLOTS = 4`，不足的槽位用不可见占位行补齐，
  切维度（日↔季↔年）时列表高度不变、下方卡片与 tab 行不闪动；行高只设 `min-height` 不设死高度，
  内容变长时行会长高而不是被压住。
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
- 首次平台数据成功后**预热全部维度**（`WARM_ORDER`：year → quarter → month → week → day → all，
  宽窗口优先，年窗口顺带填满月份缓存），保证切维度不出现加载帧、不抖动；Host 侧平台登录态缓存 30 秒
- 首屏骨架屏；尊重 `prefers-reduced-motion`

## 10. 安全与隐私

- 平台 token 只在 Host 进程内存，不写日志、不进模型上下文、不下发客户端
- Host 路由只允许本机回环 + 同源（Host/Origin/sec-fetch-site 校验）；平台请求 `redirect: manual`、
  超时、响应大小上限
- 无遥测、无第三方域名（Provider 余额只请求 Provider 官方接口）
- 发布前 `npm prepack` 自动跑 `scripts/secret-scan.mjs`，命中密钥/个人信息拒绝打包
- npm 发布用用户提供的 granual token，**只在内存/临时文件（`/tmp`，chmod 600）里用，绝不写进仓库或长期配置**，
  用完立刻删临时文件并提醒吊销。
  - **2026-11-08 用户明确指示：当天还要持续更新，token 先不吊销，更新全部结束后再处理**。
    这种情况不要反复提醒；每次发布时从会话记录重新取 token → 建临时 npmrc → 发布 → 立刻删除临时文件。
    等用户说「更新完了」再提醒吊销一次。
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
- 动布局/几何必须再跑 `npm run verify:ui`（真机 Chrome 无头 + 真实 markup，不是字符串断言、不是手写近似）
- 视觉/交互改动要补冒烟测试；Host 折叠逻辑要有单元测试
- 无法用浏览器验证时，如实说明「基于 CSS/契约测试，非真机像素比对」
- 本地是 link 安装；改 `index.js` 需要 Plugin Manager 停用/启用一次，改 `client.js` 等 HMR
- 不把内部文件（test/market/AGENTS/README 等）打进 npm 包（`files` 白名单）
- 用户偏好：**主动做完、少提问、别让用户重复要求**；不确定时先按本文件默认执行

## 13. 已完成的关键决策（避免回退）

- 布局几何一律用 `npm run verify:ui` 在真机 Chrome 里量；**不再靠「看代码推断布局」交付**
- **卡片**不使用 `container-type: size`（内容高度会塌陷成 0）；但**面板根节点必须用**
  `container-type:size;container-name:aup-panel`，让收窄阶梯按面板真实高度判定（见 §2）
- 面板充满右侧栏整高整宽、**剩余高度按信息密度分配**：会话卡（8 项指标）`flex:1 1 auto` 吸收并
  `justify-content:space-evenly` 摊开；余额卡（3 行数字）`flex:0 0 auto` 收紧；
  取代了「三张卡都 `flex:1 1 0` 平分」（会把卡片压到内容以下 → 叠字根因）
  和「最后一张卡吸收」（信息最少的余额卡吃掉整屏空白，被用户点名）两种写法
- 按模型统计：无冗余小标题，每行 `Provider - 模型短名    Tokens`（最多 3 行，过长换行，绝不降字号）
- 统计区为**对齐两列表格**（标签列 `max-content`、值列右对齐，行高 18px、列间距 16px）；
  数值过长时只允许收紧字距（`statValueClass` → letter-spacing），**绝不能改字号、也不能与相邻列重叠**；时长使用紧凑格式（如 1时44分 / 2分57秒 / 1.7秒）；用量统计每日行单行显示 Token · 金额，行高有下限，禁止重叠
- 卡片文本无省略号；长文本换行、长金额只收紧字距（字号恒 13px）
- **英文（拉丁）文字墨色与中文对齐**：字体栈拉丁优先、根 500 基线、次要色 `--aup-label-2`（color-mix 30% 主色）；
  取代了此前「次要文字直接用 `label-secondary`、字重从默认 400 继承」的写法（那样英文会明显发浅）
- **切维度零抖动**：明细列表固定 `SERIES_ROW_SLOTS=4` 槽位（不足补不可见行）、固定行距而非 space-between、
  骨架行数对齐 `DIMENSION_ROW_CAP`、后台预热全部维度
- **绝不遮挡 + 绝不滚动 + 尽量全显示**：卡片按内容撑开、永不被压缩（遮挡从结构上不可能）；
  先把面板压紧（padding 8 / gap 4 / 行高 18 / 逐期行 19，整屏内容 886→790px，面板 848px 即可全显示），
  再按**面板自身高度**用 `@container` 阶梯（856/835/776/702/680）依次隐藏彩条 / 按模型明细 / 统计表 /
  上下文块 / 2×2 明细；滚动条外观全部去掉，`overflow-y:auto` 只作隐形兜底；
  **禁止**任何基于运行时测量的行数调整（09:29 崩溃成因），也禁止 `overflow:hidden` 假装修好。
  取代了此前用 `@media (max-height:)` 按**窗口**判定的写法——窗口比面板高约 90px，判定基准错了，所以阶梯一直没能阻止滚动。
- 面板最小宽度 340px，低于它会被自动纠正；万一纠正失败，模型行 `Provider - 模型名` 换行显示（不降字号）
  （`.aup-model-row` 用 `flex-wrap`），token 数值 `margin-left:auto`，绝不压到文字上
- 底栏 dock + ContextMeter 一起隐藏（只隐藏 slot 不够）
- 三张卡固定叫「会话消耗 / 用量统计 / 账户余额」，**不许改名、不许新增第四张卡**（「会话明细」已废弃）；
  会话卡负责本会话 Token/统计/按模型/上下文，用量统计负责平台周期数据（纯第三方会话显示各来源小计），余额卡负责余额
- 第三方 Provider 会话不显示 DeepSeek 余额/平台用量，改显示 Provider 余额
- 上下文只保留一条按占用比例着色的堆叠条；Token 构成条与明细标签颜色圆点对应
- 用量统计统一为「按来源一行 + 占比条 + 合计」，不再使用趋势柱；明细列表逐期单行 Token · 金额，0 用量淡化
- **「全」(ALL) tab 在「年」之后**：按年分桶汇总所有可取的月份；窗口从 3 年开始、最老一个月有数据就往前扩到最多 6 年，
  首次发现的最早月份写进 localStorage（`dsh.account-usage.all-start.v1`）避免重复扫描；
  **合计永远是全部年份的总额**（即使行数受 4 个槽位限制、只显示最近 4 年）
- **优先左右结构**：来源行用 `标签 | 占比条 | Tokens | 金额/本会话` 的四列网格；账户卡的余额/套餐标题与数值
  必须在同一行（标签左、数值右），不要把「套餐剩余 / 99%」上下堆叠导致右侧大片空白
- 快捷开栏**不改宽度**；只在面板实测宽度 < 340px 时自动加宽回 340px（测不到就不猜），失败静默
