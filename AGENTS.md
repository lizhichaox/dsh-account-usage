# AGENTS.md — 账号用量插件：长期要求与约定

> 这是用户对本插件的**长期要求清单**。接手前先读本文件，不要重复询问已经写在这里的偏好；
> 用户不想反复重申。若实现与本文件冲突，以用户当次明确指示为准，并在完成后回写本文件。

最后更新：2026-11-09 · 插件版本：`1.0.15`

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
| 4 | **标题上不许挂 provider 标记** | 供应商只出现在账户卡来源行 | `no provider badge inside a card head` / `no provider name inside a card head` |
| 5 | **面板充满右侧栏整高整宽、底部不留白，且空间按信息密度分配** | 会话卡吸收剩余并均匀摊开；余额卡按内容收紧 | `cards size to their content and are never squeezed` / `the dense session card absorbs the leftover height` / `the balance card hugs its content` / layout-check 的 `space allocation` 断言 |
| 6 | **卡内不许大块空白** | 底部块 `margin-top:auto`、拉伸块 `flex:1` | `session footer sits on the card bottom` / `stats footer sits on the card bottom` |
| 7 | 宽度也必须撑满 | 不写 `scrollbar-gutter`、不留右侧内边距 | `the card column spans the full pane width` |
| 8 | **内容不要被遮挡 / 裁切 / 省略** | `overflow:visible`、`min-height:auto`、无 ellipsis | `card text never uses ellipsis` |
| 9 | **所有文字同一个字号，只能加粗** | 单一 `--aup-fs-text`，层级靠 font-weight | `exactly one font size token exists` |
| 10 | **切 tab / 切维度不许闪动** | 固定槽位补齐列表高度 + 样式进 head｜详见第 20 行 | `the detail list is content sized` / `the list keeps a constant slot count` |
| 11 | tab chip 切走后不许变形 | 样式表注入 `document.head` | `the stylesheet is injected into document.head` |
| 12 | 快捷键开栏 **绝不擅自改宽度** | 只在实测 < 300px 时纠正，松手后才动（300 是宿主最窄值；340 是舒适宽度） | `opening never resizes a wide sidebar on its own` |
| 13 | 开始页要显示键位 | guide entry 带 `commandId` = `SHORTCUT_ID` | `guide card links to the shortcut for its key hint` |
| 14 | **不许把 DSH 搞崩** | 禁止 ResizeObserver+setState 自反馈布局 | `row trimming never feeds back from a resize observer` |
| 15 | 底栏会话统计默认隐藏 | `<html data-account-usage-hide-stats>` | `the composer dock stats are hidden by default` |
| 16 | 头部齿轮设置（7 项） | `.aup-pop` 弹层 + localStorage | `settings button` |
| 17 | 不显示身份信息、不放跳转链接 | 不读用户资料、无外链 | `account reader does not fetch the profile` |
| 18 | **要求写进 AGENTS.md，别让人重复** | 本节 §0 | 见各条 |
| 19 | **英文文本不许看着浅** | 拉丁字体栈优先 + 根 500 基线 + `--aup-label-2` 混色 | `Latin families precede CJK ones in the stack` / `secondary text is darkened from theme tokens` / `the panel root sets a 500 baseline weight` |
| 20 | **切维度不许抖动** | 固定槽位 `SERIES_ROW_SLOTS=4` + 固定行距 + 全维度预热 | `the list keeps a constant slot count` / `spare slots pad the list in quarter/year` / `period rows keep a fixed pitch across dimensions` / `every dimension is warmed widest-first` |
| 21 | **放不下就少放点，绝不许遮挡，也不许留白** | 卡片按内容撑开**永不被压缩**（遮挡从结构上不可能）+ 实测媒体查询阶梯按窗口高度减内容 + `npm run verify:ui` 真机测量 | `cards size to their content and are never squeezed` / `cards never clip their content` / `the summary is in normal flow, never positioned over the rows` / `short windows shed the decorative token bar via CSS only` |
| 22 | **不允许滚动、不允许出现滚动条，且尽量显示全部信息** | 先压缩高度（三来源夹具内容 763px）+ 面板容器查询阶梯（820/811/751/667/608，按来源数追加预算）+ 阶梯末尾带 `!important` + `scrollbar-width:none`；会话卡永不截断行 | `the panel root is a size container` / `the measured shedding ladder contains: …` / `the old viewport ladder is gone` / `cards are padding 8 / gap 3` / `the card column never shows a scrollbar` |
| 23 | **同一组行左右对齐 + 行内垂直居中** | 父级网格 + 行 `grid-template-columns:subgrid` + 行 `align-items:center` | `the source rows share one grid` / `rows take their columns from the shared grid` / `the period rows share one grid` / `subgrid rows centre their cells vertically` / layout-check 的 `srcLabelLeft`、`acctValueRight`、`srcLabel`（居中）断言 |
| 24 | **用量统计是三列严格对齐的表（无胶囊条）** | 描述 / 用量 / 金额共用一个网格；每行 3 格；第三方行第 3 列写短标记 `PLAN`（中文「套餐」） | `one shared table` / `the card declares the three columns once` / `the English marker stays short: PLAN` / layout-check 的 `table` 断言（labelLeft、tokensRight、amountRight 唯一） |
| 25 | **金额只留货币符号，且一律后置**（2026-11-08 扩展：所有货币） | `Intl.formatToParts` 重排，任何货币都是「数字 + 符号」：`23.28¥`、`9.50$`、`12.00€`；不显示货币代码 | `amounts use the narrow currency symbol` / `the spend row ends with the ¥ symbol` / `every currency keeps its symbol after the amount` / `no currency keeps the prefix form` |
| 26 | **期数标签带年份** | 日/周 `YYYY-MM-DD`、月 `YYYY-MM`、季 `YYYY Qn`、年「全」`YYYY` | `day and week labels carry the year` / `day rows show YYYY-MM-DD` |
| 27 | **无障碍与动效是原则** | reduced-motion 全量关闭；装饰条 `aria-hidden`；所有控件有 focus 环 | `reduced motion covers every transition and animation` / `the refresh button keeps a keyboard ring` / `no capsule bar outside the session card: …` |
| 28 | **两处卡片页脚统一左中右结构** | 图例与合计行共用三列网格；合计行恒 3 格 | `the two footers share one left/centre/right grid` / `the third cell is pinned to the right edge` / layout-check 的 `footer` 断言（首格贴左、中格居中、末格贴右） |
| 29 | **点 tab 不改变高度** | loading 骨架与 ready 同构、空范围保留 4 槽位、合计行线高统一、缓存优先 | `the loading frame reserves all four period slots` / `the period list is not hidden for an empty range` / `range stability: every range + loading + empty frame measures …` |
| 30 | **统一优化所有 provider，不混数据、不串错误** | 独立来源状态、每来源一行、独立刷新、原始身份 | `errors are never shared between providers` / `requested source identity overrides provider aliases` / `every source row reads name left, figures right` |
| 31 | **账户卡不用 tab、不换行、不留白**（2026-11-08） | 每来源一行：名称左对齐，「短标签 数值」对右对齐；不加任何装饰圆点 | `one aligned row per source` / `no tabs to switch` / `every source row has exactly two cells` / `no current-source dot` |
| 32 | **除会话卡外不要胶囊进度条**（2026-11-08：「没什么信息量」） | 统计表、账户卡只写数字；会话卡构成条/上下文条保留 | `no capsule bar outside the session card: …` |
| 33 | **不许连着两条分割线**（2026-11-08） | 每条 `aup-session-sep` 绑定它引出的区块，阶梯隐藏区块时一起隐藏 | `each session separator belongs to one block: …` |
| 34 | **OpenAI / Anthropic 先调研 API，确实不行才写 Unsupported** | 已调研：找到组织花费 API，未找到公开余额 API；余额卡不写花费 → `Unsupported`，不请求花费接口 | provider-host `openai/anthropic unsupported` 测试 / provider-client `OpenAI Unsupported` |
| 35 | **余额卡只写剩余，不写 costs**（2026-11-08） | 只显示 Balance / Bonus / Key / 套餐剩余；`Used`、本月花费一律不出现；花费在用量统计卡 | `the balance card shows what is left, never costs` / `no spend (Used) in the balance card` |
| 36 | **额度显示规范** | 套餐：`5HW 63%  WEK 70%  MON 85%`（全是剩余，不写 left）；DeepSeek：`Balance 199.54¥  Bonus 0.00¥`（中文 `余额 / 赠送`） | `plan windows read 5HW / WEK / MON as the share left` / `DeepSeek reads Balance x Bonus y on the right` |
| 37 | **不需要 Retry 按钮，获取不到就算了**（2026-11-08） | 所有卡片失败只显示状态，不显示重试按钮、不添加失败后自动重试；保留既有顶部刷新及定时刷新 | `failed reads never render Retry buttons` / provider-client 全部错误态无按钮、顶部刷新和旧响应回归 |
| 38 | **上架图标要体现 usage**（2026-11-08：「一点也没体现出来 usage 的概念」） | `icon.svg` = 蓝色圆角块 + 三条递增白色柱状条；设置里的已安装列表与市场 Discover 共用这份图 | `the icon draws three usage bars` / `the wallet artwork is gone` |
| 39 | **当前会话在用的 Account 要凸显**（2026-11-08） | 最新 assistant 消息的 provider 对应的那一行：整行淡品牌色背景 + 名称加粗；无圆点、无胶囊、不改变列宽与左右边缘；`aria-current` 暴露给读屏 | `exactly one account row is highlighted` / `the row in use is the highlighted one` / `the highlight is exposed to assistive tech` / `the highlight is a background tint, not a pill` |
| 40 | **介绍语 20 字以内**（2026-11-08，先要 50 再收紧到 20） | 插件列表/市场 Discover 共用一句短介绍：`Balances + tokens.`（18 字符）/「余额与 Token 用量」（12 字）；`package.json.description`、`scripts/finalize-release.mjs`、`market/index.json` 三处同步，`market/check.mjs` 强制 ≤20 | `the plugin intro stays within 20 characters` / `the intro names balances and tokens` / market check 的 `description must stay within 20 characters` |
| 41 | **账户行在最小宽度也不许换行**（2026-11-08 / 2026-11-09：「争取一行放完」） | 三级、全部不缩放字号：≥340px 舒适档（任何值单行）；≤330px 窄屏档（间距收紧、`proportional-nums`、图例/合计 `nowrap`）；≤320px 超窄档（内边距 5px、名称字距 -0.4、对的间距 2px+2px），**三个 `100%`** 这种最坏情况由**确定性 class**（按数值文本长度，非测量）再加紧一档，300px 仍单行 | layout-check 62 态：340px + 全 `100%`；320/310/300 的 worst（三个 `100%`）与 mixed（两个 `100%`）都断言 `lines === 1` / `legend wrapped` / `summary wrapped` |
| 42 | **分隔符前后不留空格**（2026-11-09：「去掉-横向前后的空格以及其他空格」） | 所有用作分隔的符号紧贴两侧文字：模型行 `Provider-model`、轮/步 `106/11550`、上下文 `595K/1M（60%）`、中文 `轮/步`；只保留单词之间的必要空格 | `provider and model share one line without spaces around the dash` / `model rows merge provider and model without separator spaces` / smoke 的 `轮/步` 标签断言 |
| 43 | **Command Code 额度也进右侧栏**（2026-11-09：「可以把这个插件集成到 usage 插件吗？」：装 `@mars-sea/dsh-commandcode-provider` 后额度只能在设置里看，用户习惯在右侧栏看） | Host 读 `GET https://api.commandcode.ai/alpha/billing/credits`（Bearer `COMMANDCODE_API_KEY`，只走 Host）；账户卡该来源一行：`5HW / WEK` 两档**剩余**百分比 + `CRED / 额度` 剩余金额（USD，符号后置）；`cap` 为 0 的窗口不画、缺额度就不写；**只写剩余不写 Used/花费**；用量统计卡照常显示该来源本会话 Token + `PLAN` | smoke `Command Code windows read the share left` / smoke `Command Code credits read the amount left with the symbol last` / provider-host `Command Code plan windows and credits come from the billing endpoint` / provider-client `windows read the share left in fixed order and credits stay the amount left` / verify:ui `command code` 单行断言 |
| 44 | **入口图标与左侧快捷簇一致**（2026-11-09：「我们的插件 icon 也用左侧这个按钮的 icon 吧 保持一致」） | 右侧栏 tab、开始页卡片都用 `IconGaugeOutlineRegular`（宿主 primitives，失败回退同形内联 SVG），与 shell 的「用量」按钮同一符号；钱包图标不再用于入口 | smoke `the tab glyph is the shell quick-action gauge` / `the guide card uses the same gauge glyph` |
| 45 | **会话卡里的信息一律不许隐藏**（2026-11-09：「session usage 里的任何信息都是不允许隐藏的」；截图圈出「1 more models」） | 模型行**全量渲染**，取消「最多 3 行 + 另有 N 个模型」截断；高度靠压缩框架换取（卡片 `gap:3px`、会话体 `gap:4px`、统计/网格间距收紧、`aup-model-more` 样式与文案删除），三来源整屏内容 793→763px；短面板仍按阶梯整块隐藏，但绝不截断行；layout-check 断言模型行要么全显示、要么整块被隐藏（绝不出现部分行） | smoke `all four model rows render, none truncated` / `the fourth model is a row, not a counter` / `no truncation line exists`；layout-check `model rows truncated` |

## 1. 产品定位

- DeepSeek Harness 右侧边栏插件，名称固定为 **「账号用量」**（四个中文）。
- 面板固定三张卡片，顺序：**会话消耗 → 用量统计 → 账户余额**。
- 右侧栏 tab 用短标题「用量」（英文 `Usage`），图标**与左侧快捷簇的「用量」按钮一致**（2026-11-09：
  「我们的插件 icon 也用左侧这个按钮的 icon 吧 保持一致」）：用宿主 primitives 的
  `IconGaugeOutlineRegular`（仪表盘），拿不到时回退到同形内联 SVG，不再用钱包图标。
  tab title 组件返回 **Fragment（裸 SVG + 纯文本）**，不要包一层 `span` 容器——
  宿主的 `GuideTitle` 就是 `<CompassGlyph/> + tab.title` 这种结构，包容器会让 tab 宽度测量错乱、
  切 tab 时文字被压扁变形。图标用 `.aup-tab-icon`（14px、`vertical-align:-2px`），
  **不要自己加 margin**：图标与文字的间距由宿主 chip 的 gap 负责，否则选中/未选中两种状态下间距会不一致。
  开始页（Guide）卡片图标同样用这个仪表盘，保证「入口按钮 / 标签页 / 开始页」三处是同一个符号。
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
- **插件图标表达「用量」**（2026-11-08 用户：「一点也没体现出来 usage 的概念」）：
  蓝色圆角应用块 + **三条递增的白色柱状条**，一眼读成 usage / statistics；
  **不要**再用钱包、时钟、问号这类「余额」隐喻。24px 设计，缩到 16px 仍要能分辨。
  这份 `icon.svg` 同时用于设置里的「已安装插件」列表和市场 `market/index.json` 的 data URI，两处不能各画一套。
- **介绍语一句话、20 字以内**（2026-11-08 用户先说 50 字、随即收紧到「二十字以内」）：
  设置里的已安装列表与市场 Discover 用的是同一句：英文 `Balances + tokens.`（18 字符）、
  中文「余额与 Token 用量」（12 字）。只需点到**余额**和 **Token**，不再罗列周期；
  **禁止**再写成长句。三处来源（`package.json.description`、`scripts/finalize-release.mjs` 的索引文案、
  生成后的 `market/index.json`）必须一致，`market/check.mjs` 会卡 20 字上限。
- 不放置「查看用量 / 充值」等跳转链接。

## 2. 卡片与布局

- 卡片标题：三张卡标题都用**四个中文字符**（会话消耗 / 用量统计 / 账户余额），**居中**，
  标题下方有 `.aup-divider` 细分割线。
- **标题区只放图标 + 标题**：不放供应商徽标/标记（供应商名只在账户卡的来源行里出现）；
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
     - **账户余额卡按内容高度收紧**：`flex:0 0 auto`，内部 `.aup-account-body` /
       `.aup-acct-srcs` 一律 `flex:0 0 auto` + `justify-content:flex-start`，
       **禁止**再用 `space-evenly` / `flex:1 1 auto` 把自己的几行数字撑成一大片空白。
     - 历史教训：曾让「最后一张卡」吸收高度，结果信息最少的余额卡吃掉了整屏空白，
       被用户点名骂——**分配空间要看卡片内容量，不要看它在 DOM 里的位置**。
  3. **明细列表固定槽位**：`SERIES_ROW_SLOTS = 4`，按维度渲染 1..N 行，剩余用**不可见占位行**
     （`.aup-series-slot`，`min-height:21px`）补齐；这样**切维度时列表高度恒定**，下面的卡片一动不动。
  4. **绝不允许滚动、绝不出现滚动条，并且尽量把信息全部显示出来**
     （用户 2026-11-08：「依然存在可滚动的窗口 优化一下 不滚动 显示全部信息」）。两层措施：
     - **先压缩：不删信息，只压高度**。卡片 `padding:8px` / `gap:3px`、卡间距 6px、根底部 6px、
       统计表行高 18px、逐期行 `min-height:21px`、会话体 gap 4px、Token 网格 gap 4px、模型行 gap 0。
       三来源夹具实测整屏内容 **763px**（每个模型行都渲染、不再截断；之前 793px），面板 820px 即可全显示。
     - **再按面板自身高度逐级收窄，用 `@container`（不是 `@media`）**：
       `.aup-root{container-type:size;container-name:aup-panel}`，
       阈值 `820px 去 Token 彩条 → 811px 去按模型明细 → 751px 去统计表 → 667px 去上下文块 → 608px 去 Token 2×2 明细`；
       每个区块与引出它的分割线（`aup-sep-models/-stats/-context`）**一起隐藏**，绝不留下连续两条线。
       来源 ≥4 时按 `data-source-count` 追加预算 `(n-3)×69` px（`--tiers N` 实测：每多一个来源 = 一行统计 + 一行余额 + 一行完整模型行 69px）。
       **必须用容器查询**：窗口比面板高（右侧栏 tab 条 + 面板横条约 90px），
       之前用 `@media (max-height)` 判定基准错了，所以「阶梯明明写了却还滚」——这是反复踩的坑。
     - 阈值由 `node test/layout-check.mjs --tiers` 用**真实面板 markup** 逐级量出，
       规则放在样式表最末并带 `!important`（查询不增加特异性）。
     - **夹具数据必须与生产同形**：曾经因为夹具没给上下文数据，面板跳过了上下文块、
       量出来的内容高度比生产少 36px，阶梯整体偏低、在 869–903px 的面板里仍会「看不见的滚动」。
       夹具里 `contextPressure`（projectedTokens/contextWindow）、`contextBreakdown`（三段 tokens）、
       `tokenUsage`、`sessionStats` 必须全部给真实形状。
     - 结论（三来源）：面板高度 ≥ 820px 时全部信息可见；≤ 820px 才隐藏那条装饰性 Token 彩条；
       `< 527px` 属于极端窗口，只剩隐形兜底（此时仍无滚动条外观）。7 个来源全部收窄后仍需约 802px。
       阈值每次都要用 `--tiers` 重新量、改完同步更新本文件这三处数字（内容高度 / 阶梯 / 结论）。
  5. 明令禁止：用 `ResizeObserver`/`getBoundingClientRect` 的内容高度去反推行数并 `setState`
     （09:29 崩溃的成因）、用 `overflow:hidden` 或省略号假装解决放不下。
  6. **必须用真机浏览器验证几何，而且必须量真实 markup**：
     `test/render-fixture.mjs` 用与冒烟测试相同的桩**启动真正的 client.js**、用真实状态渲染面板、
     把元素树序列化成 HTML；`npm run verify:ui`（`test/layout-check.mjs`）再把它放进本机 Chrome
     无头模式的固定面板里测量，覆盖 420px/340px/330px/300px 宽度 × 700→1200px 七档高度 × 日/月/全 三种维度，
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
  右侧数值会随行漂移（实测差 13px）。
  另外**行内单元格必须垂直居中**：subgrid 行要显式写 `align-items:center`，
  漏掉就会退化成 stretch/顶对齐（曾实测偏 7px，用户报「没居中对齐」）。
- **用量统计卡是一张三列表**（用户 2026-11-08 先要求「描述 胶囊进度条 用量 金额 四列严谨对齐」，
  随后要求「除了 session usage 卡片全都取消胶囊进度条，没什么信息量」，故删掉胶囊列）：
  `描述 | 用量 | 金额`。实现必须满足：
  - **整张卡只声明一次列模板**：`.aup-stats-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(52px,max-content) minmax(0,max-content)}`；
    来源组与逐期组都用 `display:contents` 把行提升为这张表的行。
  - **每行 3 个单元格**（`grid-template-columns:subgrid;grid-column:1/-1`），
    空值也要输出空 `span`，**绝不允许条件性少一个单元格**——少一个会把后面所有列错位（踩过）。
  - 不再有胶囊条；第 2、3 列一律 `justify-self:end` 右对齐，描述列 `1fr` 吃掉剩余宽度。
  - 第 3 列的含义：DeepSeek API 行是**真实金额**；第三方 Provider 行没有平台金额，
    显示**套餐标记**——英文 `PLAN`、中文「套餐」（用户 2026-11-08：先要求把 `session` 换成订阅名词并大写，
    随即说 `SUBSCRIPTION` 太长要缩写，因此用短词 `PLAN`，同时与账户卡的「套餐剩余 / Plan left」用词一致）。
    **禁止**再用 `session` / `本会话` 这类作用域提示。
  - 两行组之间用 `::before` 画一条 hairline 分隔，**不能用 padding/border 撑行高**（会让行内元素偏离中线，被 `verify:ui` 的居中断言抓到）。
  - **期数标签一律带年份**（用户 2026-11-08：「或许把年份放出来这样可以更协调和优雅」）：
    日/周显示 `YYYY-MM-DD`，月 `YYYY-MM`，季 `YYYY Qn`，年 `YYYY`，全 `YYYY`。
    只写 `11-05` 会让描述列空出一截、整张表看着参差。
- **点 tab 不许改变高度**（用户 2026-11-08：「插件加载以后初始化以后 除非窗口发生变化
  不然仅仅点击 tab 是不要改变现有高度」）。窗口尺寸不变时，切换日/周/月/季/年/全：
  - **loading 骨架必须与 ready 卡片同构等高**：同样的来源行数（`sessionOnly ? provider 行数 : provider 行数 + 1`）
    + **固定 4 个逐期槽位** + 同样的合计行（骨架格子用 `display:inline-block` 撑住 18px 行高）；
  - **空数据范围也保留 4 个槽位**：不能因为某范围没数据就隐藏列表或塌成空提示
    （`series.total === 0` 时列表照常渲染 0 行）；
  - 有缓存时直接渲染缓存（`dimensionResults`），不出现 loading 帧；
  - 合计行三格线高统一 18px（历史上第三个格子被 26px 覆盖过，导致 ready 比 loading 高 16px，点击就抖）。
  - 验收：`npm run verify:ui` 会打印并断言「每个范围 × ready/loading/empty 三态在固定面板下卡片高度完全一致」。
- **两张卡的页脚共用同一套 左 / 中 / 右 三列网格**（用户 2026-11-08：「这两处可以保持 UI 一致性 左中右 结构」）：
  会话卡的上下文图例（System / Tools / Messages）与用量统计卡的合计行（合计 tokens / 请求数 / 金额）
  必须是同一个结构：`.aup-context-legend,.aup-stats-summary{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)}`，
  第 1 格左贴边、第 2 格真正居中对齐面板中线、第 3 格右贴边。
  **禁止**一边用 `space-between` 两段、另一边三段：那样两处看起来像两个不同的组件。
  合计行**永远输出 3 个单元格**（无金额时输出空 span），格数固定才不会被内容左右结构。
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
- **分隔符前后不留空格**（用户 2026-11-09）：`Provider-model`、`106/11550`、`595K/1M（60%）`、
  「轮/步」——横线、斜杠两侧都紧贴文字，只保留单词之间天然的空格。窄面板下每个空格都是
  宝贵的横向空间，逗号/句号同理不要前置空格。
- **金额只显示货币符号、不显示货币代码，且符号一律放在数字后面**（用户 2026-11-08：
  「留个¥就行 CN 没必要」→「金额符号放在价格后面吧¥」→「货币符号都放到金额后面」）：
  - 统一规则：`23.28¥`、`9.50$`、`12.00€`、`-5.00¥`；**不写** `CN¥` / `CNY` / `$11.04`
  - 实现：`Intl.NumberFormat({style:'currency', currencyDisplay:'narrowSymbol'})` 的
    `formatToParts` 里**丢掉 currency part，其余照原样拼起来再追加窄符号**，
    这样千分位/小数点/正负号/本地化分组都不受破坏
  - **禁止**再按货币判断分支（旧代码 `String(currency) === 'CNY'` 的特例已删除）
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
  唯一例外：面板实际宽度低于 300px 且**能测量到**时，才把它加宽回 300px（宿主最窄宽度；340px 是舒适宽度）；测不到宽度就不要猜。
  切 tab、切窗口回来都不许触发任何宽度变化。
- **最小宽度护栏**：面板打开期间监听自身宽度，低于 `PANEL_MIN_WIDTH`（300px，宿主最窄值）时自动加宽回去。
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
    返回套餐百分比；来源行固定显示 `5HW 63%  WEK 70%  MON 85%`（5 小时 / 周 / 月，**全部是剩余比例**，不写 left/剩余/已用；中英文同一套缩写），不画进度条
    （`opencode-go` 的凭据引用是 `OPENCODE_GO_API_KEY`；`opencode`/`-zen` 用 `OPENCODE_API_KEY`）
  - `commandcode`（`@mars-sea/dsh-commandcode-provider`）：`GET https://api.commandcode.ai/alpha/billing/credits`（Bearer `COMMANDCODE_API_KEY`），
    一次请求返回 5 小时 / 周两个窗口的 `used` / `cap` 与额度（`monthlyCredits` 套餐剩余 + `purchasedCredits` / `freeCredits` 充值/赠送）；
    来源行显示 `5HW 0%  WEK 50%  CRED 6.99$`（中文 `额度`），同样**全是剩余**、不写 Used；`cap` 为 0 的窗口不画（套餐未设限），
    额度缺失就不写额度对。该插件自己的设置页仍保留完整面板（账号、模型可见性等），这里只做额度只读镜像。
    这一行是全卡最长的第三方行（两档窗口 + 一档额度），因此 `aup-acct-pairs-tight` 从「仅在 ≤320px」改为
    **全宽度确定性加紧密**（按数值文本长度触发，覆盖额度），实测：**≥320px 任何值（含三个 `100%` 与 `999.99$`）单行**；
    300–319px 真实数值（如 `0% / 50% / 6.99$`）单行，只有超额金额（≥`99.99$`）会折两行——
    这是「名称更长的 Provider」在舒适宽度以下的已知物理极限，verify:ui 用 worst/typical 两个夹具分别锁定。
  - OpenAI / Anthropic：已调研（2026-11-08），调研到的官方接口是**组织花费**（OpenAI Costs API、Anthropic Cost Report，需相应组织权限），**未找到公开余额接口**；用户决定余额卡不写花费，所以两家显示 `Unsupported`，插件不请求花费接口。
  - 其余未接入的 Provider 显示「插件暂不支持 / Unsupported」，不暗示供应商没有 API；本会话 Token 在用量统计卡里看，账户卡不重复。
  - 未配置、鉴权失败、超时、网络失败、凭据读取失败分别显示短状态；不提供任何 Retry / 重试按钮，不因失败立即重发请求。既有顶部刷新与定时刷新保持不变。
  - **余额卡只写剩余**（用户：「Account balance 里不需要写 costs」）：`Balance` / `Bonus` / `Key`（OpenRouter 密钥额度）/ 套餐剩余；`Used`、本月花费不出现，花费看用量统计卡；只有用量没有剩余时写「无余额数据 / No balance」，绝不当成 0。
  - 统一显示规范：右侧是「短标签（次要色） 数值（加粗）」对，多对之间 8px，如 DeepSeek `Balance 199.54¥  Bonus 0.00¥`（中文 `余额 / 赠送`）。不画进度条。
- 只要出现第三方来源（含单 Provider 会话），账户卡**每个来源一行**（`aup-acct-srcs`，取代来源 tab：tab 多于 3 个会换行、短 pane 留白，用户点名不美观），
  来源名左对齐，右侧「短标签 数值」对右对齐（如 `Balance 199.54¥  Bonus 0.00¥`、`5HW 63%  WEK 70%  MON 85%`、`Timed out`）；
  **不加任何装饰**（曾给当前来源加小圆点，用户：「没有用就删掉，别浪费注意力」）；没有任何切换，因此不存在「点 tab 改变高度」的问题；
  第三方余额与 DeepSeek 钱包一样实时读取（opencode 走套餐百分比）；
  用量统计卡统一为**一张三列表**：`描述 | 用量 | 金额`（见 §2），卡标题不挂任何徽标
- **当前会话正在使用的来源要凸显**（用户 2026-11-08：「给当前会话正在使用的 Account 加个凸显样式」）：
  判定 = 会话日志里**最新一条 assistant 消息的 `source.provider`**（`deepseek-account` 映射到 DeepSeek API 那一行），
  对应行加整行淡品牌色背景（`color-mix(in srgb, brand-primary 10%, transparent)`）+ 名称字重 600，
  `aria-current="true"` 暴露给读屏。
  **禁止**为此加圆点 / 胶囊 / 徽标，**禁止**改内边距或列宽——背景不会移动左右边缘，`verify:ui` 的
  `acctLabelLeft` / `acctValueRight` 唯一性断言必须继续通过；单账号会话（只有 DeepSeek 钱包、没有行列表）不加强调。
- **余额卡的行在最小宽度（300px）也必须单行，不允许换行**（用户 2026-11-08：「不允许缩到换行」→ 2026-11-09：「真的放不下吗？我觉得还可以优化争取一行放完」）：
  - ≥340px 舒适档：任何数值（含三个 `100%`）单行；
  - ≤330px 窄屏档：间距收紧 + `proportional-nums`，图例与合计行 `nowrap`；
  - ≤320px 超窄档：卡片左右内边距 5px、名称字距 -0.4px、对内间距 2px、对间 1px；
    三窗口全是 `100%` 的行按**数值文本长度**加 `aup-acct-pairs-tight` 再紧一档（**确定性，不测量**），
    这样 300px 也放得下。
  行仍用同一套网格，**禁止**靠加宽面板 / 隐藏窗口 / 改字号 / `transform: scale` 来回避。
  `verify:ui` 在 340px（全 `100%`）与 320/310/300px（worst + mixed）都要 `lines === 1`、未裁切。
  已知物理极限：<300px、或名称更长的新 provider，可能仍需要两行——这属于宿主最窄以下，不在保证内。
- 设置里的「用量明细列表」打开后，在来源行下方追加逐期 `Token · 金额` 明细（悬浮可看完整日期/Token/金额）
- 明细列表**高度恒定由固定槽位保证**：`SERIES_ROW_SLOTS = 4`，不足的槽位用不可见占位行（`min-height:21px`）补齐，
  切维度（日↔季↔年）时列表高度不变、下方卡片与 tab 行不闪动；行高只设 `min-height` 不设死高度，
  内容变长时行会长高而不是被压住。
- 明细列表模式下，期数按维度**固定封顶**（`DIMENSION_ROW_CAP`：日/周/月 4、季 3、年 3），
  只丢弃**最旧的**期数、保留最新的；合计跟随实际显示的行。
  **禁止用 ResizeObserver + setState 做「按高度动态减行」**：那会形成
  布局→setState→布局 的反馈环，曾经把 DSH 直接搞崩（2026-11-08 09:29 崩溃报告）。
  宁可少显示几行，也不要任何自反馈的布局测量。
- Provider 余额缓存 60 秒；手动刷新强制重新查询
- **API Key 只在 Host 侧读取**（`ctx.credentials`），不得下发到浏览器/客户端

### 7.1 Provider 统一优化（2026-11-08）

用户：「OpenAI 的请求信息过于杂乱了…其他 provider 可能也会有问题…统一优化」。必须统一处理，而非仅改一个 provider：
- 按原始请求 provider id 保存 `byProvider[id]`，独立 loading/ready/error。失败不覆盖其它来源的成功，禁止只取第一个全局错误。
- Host 和 Client 均保留请求身份；别名只复用读取实现，不合并不同来源/密钥的余额。Go/Zen 不可串账。
- 每个来源一行：失败/未接入只写短状态（英文 `Unsupported` 等单词级短语，太长难看），获取不到就停留在状态文字，不加重试按钮。
- 「插件暂不支持」不等于「供应商没有 API」；禁止暗示余额缺失就是 0。OpenRouter `/credits` 缺 usage 必须回退或失败；`/key` 标明密钥额度作用域。
- 刷新仍按 provider 独立读取，逐来源请求序号丢弃旧响应；会话变化/卸载后失效。取消的平台请求不得锁死纯第三方刷新按钮。
- 账户卡不再有 tab：所有来源同时可见，没有可点的东西，高度只随来源数量和窗口变化。没有备注的行数值独占右侧，不会因为别的行长而换行。
- 4–16 来源按数量追加预算 `(n-3)×69` px（`layout-check --tiers N` 实测）。不根据 DOM 高度反算布局。几何验证覆盖 3/4/5 来源（700/900/1080 高）与 7 来源（900/1080 高）；7 来源在 <802px 面板只能依赖隐形兜底。
- 验收：`test/provider-host.mjs` 模拟真实 Host route（不访问真实网络/凭据）；`test/provider-client.mjs` 渲染真实账户卡和 body effects，覆盖混合成功/失败、错误顺序、0 用量、所有失败态无重试按钮、旧响应与纯第三方刷新。
- `verify:ui` 另测来源数 × 中英文 × 340/420 宽 × 700/900/1080 高，并加测 330/300 窄屏：无重叠/溢出/滚动/底部空带，账户行名称左对齐、数值右对齐且垂直居中。夹具必须把 ARIA 布尔值写为字符串 true/false。
- 冒烟守护：`errors are never shared between providers` / `requested source identity overrides provider aliases` / `one aligned row per source` / `no tabs to switch` / `the English unsupported status stays one short word`。

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
- **无障碍与动效（属于原则，不是可选 polish）**：
  - 面板里**所有**过渡与动画都要在 `prefers-reduced-motion: reduce` 下关掉
    （`transition` 覆盖 icon-button / dim / series-row / pop-link / toggle，
    `animation` 覆盖 skeleton / spin），不允许只处理一两个控件
  - **装饰性进度条一律 `aria-hidden`**：紧邻的数字就是它的文本替代（会话构成条、上下文条；其余卡片已不使用进度条）
  - **每个可交互控件都有 `:focus-visible` 环**（含顶部刷新按钮），键盘用户不能有死角
  - 语义角色齐全：范围 tab 用 `role="tablist"`+`role="tab"`，账户来源用 `role="list"`+`listitem`，开关用 `role="switch"`，设置弹层 `role="dialog"`

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

- **账户卡来源行**（§7、§7.1）：取代「来源 tab + 共享网格等高 pane」（tab 换行、短 pane 留白，被用户点名不美观）。独立原始身份与状态保留。
- **获取不到就算了，不提供 Retry 按钮**：取代「余额失败时定向重试」，并移除统计卡错误态的重试按钮；只保留既有顶部刷新及定时刷新，不新增失败重试循环。
- **图标从钱包换成用量柱状图**（1.0.6）：取代「钱包 + 时钟」图标，已安装列表与市场索引共用 `icon.svg`。
- **介绍语压到 20 字以内**（1.0.8，先压到 50 又收紧）：取代原来 130 字符的长句，只剩「余额 + Token」。
- **余额行最小宽度单行**（1.0.9）：收紧对间距/字距，取代「窄面板允许换行」；340px 是舒适宽度（任何值单行）。
- **最小宽度护栏降到 300px**（1.0.10）：取代 340px 回弹；宿主最窄也能用，330px 以下自动进入紧凑档。
- **超窄档 + 确定性加紧密**（1.0.11）：取代「300px 下三个 `100%` 只能折行」；按数值文本长度决定是否再紧一档，300px 也单行。
- **Command Code 额度并入账户卡**（1.0.13）：不新开右侧栏 tab、不改 commandcode 提供的设置页，只在账户卡按统一来源行显示
  `5HW / WEK` 剩余 + `CRED` 剩余；Host 侧独立读取其官方 billing 接口（60 秒缓存、失败只写短状态）。
  同时把 `aup-acct-pairs-tight` 的加紧密从「只有 ≤320px」改为**全宽度**（-1.2px，≤320px 为 -1.45px），
  超窄档名称字距放宽到 -0.5px，保证这一行在 340/320px 仍单行；≤310px 的超额金额允许两行（已记录）。
- **会话卡不截断模型行**（1.0.15）：取消「最多 3 行 / 另有 N 个模型」，模型全量渲染；同时压缩框架（卡片 gap 4→3、会话体 gap 6→4、统计行距 2→1、token 条 8→6）把整屏内容从 793px 降到 763px，阶梯阈值随之下移（820/811/751/667/608），按来源预算改 `(n-3)×69`。
- **入口图标改用仪表盘**（1.0.14）：tab / 开始页与左侧快捷簇「用量」按钮同一符号，取代钱包图标；primitives 不可用时回退同形内联 SVG。
- **分隔符去空格**（1.0.12）：模型行改为 `Provider-model`，轮/步与上下文改成 `a/b`，取代带空格的 `Provider - model` / `106 / 11550`。
- **所有货币符号后置**（1.0.9）：取代「只有 ¥ 后置、其它货币按 $11.04 惯例」。
- **当前 Account 用整行背景凸显**（1.0.6）：取代「当前来源小圆点」（当时被判为无信息量而删除）；
  现在这条信息有意义，但只用**背景 + 字重**表达，不加任何新元素、不产生布局位移。
- **余额卡只写剩余**：取代「OpenRouter 显示已用」「OpenAI/Anthropic 显示本月花费 + 需管理员密钥」；也取代「当前来源小圆点」。
- **只有会话卡保留进度条**：取代「用量统计四列表含胶囊条」「账户卡胶囊条」。
- 763px/820px 是三来源、420px 宽夹具基准，多来源追加 `(n-3)×69`，英文窄栏的长状态会换行增高（因此英文状态都用短词）。
- 本轮 1.0.15 发布 npm；本地插件通过 Plugin Manager 重载，不能把 applied 等同于实时 GUI 像素验收。Client HMR 只有确认同 checkout 的 `pnpm run dev:web` watcher 在运行才可承诺；否则要求刷新现有页面，不开替代服务器。

- 布局几何一律用 `npm run verify:ui` 在真机 Chrome 里量；**不再靠「看代码推断布局」交付**
- **卡片**不使用 `container-type: size`（内容高度会塌陷成 0）；但**面板根节点必须用**
  `container-type:size;container-name:aup-panel`，让收窄阶梯按面板真实高度判定（见 §2）
- 面板充满右侧栏整高整宽、**剩余高度按信息密度分配**：会话卡（8 项指标）`flex:1 1 auto` 吸收并
  `justify-content:space-evenly` 摊开；余额卡（3 行数字）`flex:0 0 auto` 收紧；
  取代了「三张卡都 `flex:1 1 0` 平分」（会把卡片压到内容以下 → 叠字根因）
  和「最后一张卡吸收」（信息最少的余额卡吃掉整屏空白，被用户点名）两种写法
- 按模型统计：无冗余小标题，每行 `Provider-模型短名    Tokens`，**模型有多少行就显示多少行，绝不截断或写「另有 N 个模型」**（过长换行，绝不降字号）
- 统计区为**对齐两列表格**（标签列 `max-content`、值列右对齐，行高 18px、列间距 16px）；
  数值过长时只允许收紧字距（`statValueClass` → letter-spacing），**绝不能改字号、也不能与相邻列重叠**；时长使用紧凑格式（如 1时44分 / 2分57秒 / 1.7秒）；用量统计每日行单行显示 Token · 金额，行高有下限，禁止重叠
- 卡片文本无省略号；长文本换行、长金额只收紧字距（字号恒 13px）
- **英文（拉丁）文字墨色与中文对齐**：字体栈拉丁优先、根 500 基线、次要色 `--aup-label-2`（color-mix 30% 主色）；
  取代了此前「次要文字直接用 `label-secondary`、字重从默认 400 继承」的写法（那样英文会明显发浅）
- **切维度零抖动**：明细列表固定 `SERIES_ROW_SLOTS=4` 槽位（不足补不可见行）、固定行距而非 space-between、
  加载骨架与 ready 卡片同构等高、后台预热全部维度
- **绝不遮挡 + 绝不滚动 + 尽量全显示**：卡片按内容撑开、永不被压缩（遮挡从结构上不可能）；
  先把面板压紧（padding 8 / gap 3 / 行高 18 / 逐期行 21，三来源整屏内容 763px，面板 820px 即可全显示），
  再按**面板自身高度**用 `@container` 阶梯（820/811/751/667/608，区块连同引出它的分割线一起隐藏）依次隐藏彩条 / 按模型明细 / 统计表 /
  上下文块 / 2×2 明细；会话卡内部**永不截断**（模型行全量渲染）；滚动条外观全部去掉，`overflow-y:auto` 只作隐形兜底；
  **禁止**任何基于运行时测量的行数调整（09:29 崩溃成因），也禁止 `overflow:hidden` 假装修好。
  取代了此前用 `@media (max-height:)` 按**窗口**判定的写法——窗口比面板高约 90px，判定基准错了，所以阶梯一直没能阻止滚动。
- 面板最小宽度 300px（340px 是舒适宽度），低于它会被自动纠正；万一纠正失败，模型行 `Provider-模型名` 换行显示（不降字号）
  （`.aup-model-row` 用 `flex-wrap`），token 数值 `margin-left:auto`，绝不压到文字上
- 底栏 dock + ContextMeter 一起隐藏（只隐藏 slot 不够）
- 三张卡固定叫「会话消耗 / 用量统计 / 账户余额」，**不许改名、不许新增第四张卡**（「会话明细」已废弃）；
  会话卡负责本会话 Token/统计/按模型/上下文，用量统计负责平台周期数据（纯第三方会话显示各来源小计），余额卡负责余额
- 第三方 Provider 会话不显示 DeepSeek 余额/平台用量，改显示 Provider 余额
- 上下文只保留一条按占用比例着色的堆叠条；Token 构成条与明细标签颜色圆点对应
- 用量统计统一为「按来源一行 + 合计」（占比条已取消），不再使用趋势柱；明细列表逐期单行 Token · 金额，0 用量淡化
- **「全」(ALL) tab 在「年」之后**：按年分桶汇总所有可取的月份；窗口从 3 年开始、最老一个月有数据就往前扩到最多 6 年，
  首次发现的最早月份写进 localStorage（`dsh.account-usage.all-start.v1`）避免重复扫描；
  **合计永远是全部年份的总额**（即使行数受 4 个槽位限制、只显示最近 4 年）
- **优先左右结构**：统计来源行用 `标签 | Tokens | 金额/PLAN` 的三列网格；账户卡的余额/套餐标题与数值
  必须在同一行（标签左、数值右），不要把「套餐剩余 / 99%」上下堆叠导致右侧大片空白
- 快捷开栏**不改宽度**；只在面板实测宽度 < 300px 时自动加宽回 300px（测不到就不猜），失败静默
