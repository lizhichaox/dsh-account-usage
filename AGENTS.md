# AGENTS.md — 账号用量插件：长期要求与约定

> 这是用户对本插件的**长期要求清单**。接手前先读本文件，不要重复询问已经写在这里的偏好；
> 用户不想反复重申。若实现与本文件冲突，以用户当次明确指示为准，并在完成后回写本文件。

最后更新：2026-11-09 · 插件版本：`1.0.17`

- 插件目录：本仓库 `dsh-preset/account-usage-panel`（本地 link 安装）
- GitHub：<https://github.com/lizhichaox/dsh-account-usage>
- npm：<https://www.npmjs.com/package/dsh-account-usage>（包名 `dsh-account-usage`，作者 `chaox`）
- 市场索引：<https://lizhichaox.github.io/dsh-account-usage/market/index.json>

## 0. 元规则：用户说过一次的要求，绝不让他说第二次

用户 2026-11-08 明确要求：「要把我对你的要求写入 AGENTS.md，不要总让我重复」。这是**工作方式的硬要求**，和具体样式同等重要：

1. **同一轮落盘**：用户当轮提的新要求必须在**同一轮**完成三件事——① 实现；② 写进本文件（落到具体小节，写清「要什么 / 为什么 / 怎么验证」）；③ 在 `test/smoke.mjs` 补一条**会失败**的断言。只写代码不写文件 = 没做完；只答应不落盘 = 没做完。
2. **先查后问**：用户提要求前，先在本文件和 `test/smoke.mjs` 里找是否已有条目。已写过就按文件执行，不要反问、不要要求用户重述。
3. **冲突以当次为准**：新要求与本文件冲突时，改实现 + 改本文件（并在 §13 记一句「取代了哪条」），不要两条规则并存。
4. **交付前自查**：逐条对照 §0.1 速查表。任何一条既没有实现、也没有断言，就是没交付。
5. **无法自动验证的**（真机像素、字体渲染、动画手感）：如实说明是靠 CSS/契约测试，并写清「需要用户肉眼确认的具体是哪几处」，不许假装验证过。
6. **用户重复同一句话，是我们失职**，不是用户啰嗦——重复发生时，把漏掉的那条补进本文件并为它补断言。

### 0.1 硬性要求速查表（每次交付前逐条勾）

> 断言名就是 `test/smoke.mjs` 里那句 `assert` 的说明文字；改实现时这些断言必须继续通过。

| # | 要求（用户原话要点） | 实现要点 | 冒烟断言 |
|---|---|---|---|
| 1 | 右侧栏能看到额度 / 费用 / tokens | Host 读真实平台接口，两张卡面板（会话消耗 + 账户余额） | `real platform amount shown` |
| 2 | 只用真实数据，不许假估算 | 平台 usage / 余额接口，失败才回退并带 `≈` | `account reader does not fetch the profile` |
| 3 | 三张卡、四字中文标题、居中、**不许改名、不许第四张** | **已废弃（1.0.16，见 #46）**：删除「用量统计」卡，只剩两张；标题仍为四个中文字符、居中、不许改名、不许新增 | `four-character card titles` |
| 4 | **标题上不许挂 provider 标记** | 供应商只出现在账户卡来源行 | `no provider badge inside a card head` / `no provider name inside a card head` |
| 5 | **面板充满右侧栏整高整宽、底部不留白，空间按信息密度分配** | 剩余高度**按 3:1 密度分摊**：会话卡 `flex:3 1 auto` 吸收更多并均匀摊开，余额卡 `flex:1 1 auto` 拿小头、内部按行距摊开（1.0.16 #47 取代「余额卡按内容收紧 `flex:0 0 auto`」） | `cards size to their content and are never squeezed` / `the dense session card absorbs the largest share of the leftover height` / `the balance card shares the leftover height instead of hugging its content` / layout-check `space allocation` |
| 6 | **卡内不许大块空白** | 底部块 `margin-top:auto`、拉伸块 `flex:1`（统计卡合计行已随卡片删除） | `the context legend keeps its left/centre/right grid` / `the third cell is pinned to the right edge` |
| 7 | 宽度也必须撑满 | 不写 `scrollbar-gutter`、不留右侧内边距 | `the card column spans the full pane width` |
| 8 | **内容不要被遮挡 / 裁切 / 省略** | `overflow:visible`、`min-height:auto`、无 ellipsis | `card text never uses ellipsis` |
| 9 | **所有文字同一个字号，只能加粗** | 单一 `--aup-fs-text`，层级靠 font-weight | `exactly one font size token exists` |
| 10 | **切 tab / 切维度不许闪动** | **已废弃（1.0.16，见 #46）**：维度 tab 与逐期列表随统计卡删除，无消费方 | —（随统计卡删除） |
| 11 | tab chip 切走后不许变形 | 样式表注入 `document.head` | `the stylesheet is injected into document.head` |
| 12 | 快捷键开栏 **绝不擅自改宽度** | 只在实测 < 300px 时纠正，松手后才动（300 = 宿主最窄值；340 = 舒适宽度） | `opening never resizes a wide sidebar on its own` |
| 13 | 开始页要显示键位 | guide entry 带 `commandId` = `SHORTCUT_ID` | `guide card links to the shortcut for its key hint` |
| 14 | **不许把 DSH 搞崩** | 禁止 ResizeObserver + setState 自反馈布局 | `row trimming never feeds back from a resize observer` |
| 15 | 底栏会话统计默认隐藏 | `<html data-account-usage-hide-stats>` | `the composer dock stats are hidden by default` |
| 16 | 头部齿轮设置（1.0.17 #51 收敛为 **2 项开关**） | `.aup-pop` 弹层 + localStorage：隐藏底栏会话统计（默认开）、自动刷新（默认开）、恢复默认；两张卡**永远渲染**、没有显隐开关 | `settings button` / `settings keep exactly two switches` |
| 17 | 不显示身份信息、不放跳转链接 | 不读用户资料、无外链 | `account reader does not fetch the profile` |
| 18 | **要求写进 AGENTS.md，别让人重复** | 本节 §0 | 见各条 |
| 19 | **英文文本不许看着浅** | 拉丁字体栈优先 + 根 500 基线 + `--aup-label-2` 混色 | `Latin families precede CJK ones in the stack` / `secondary text is darkened from theme tokens` / `the panel root sets a 500 baseline weight` |
| 20 | **切维度不许抖动** | **已废弃（1.0.16，见 #46）**：维度 tab、固定槽位 `SERIES_ROW_SLOTS=4`、全维度预热只服务已删除的统计卡 | —（随统计卡删除） |
| 21 | **放不下就少放点，绝不许遮挡，也不许留白** | 卡片按内容撑开**永不被压缩**（遮挡从结构上不可能）+ `@container aup-panel`（**容器查询，按面板自身高度**判定，不是窗口高度）逐级整块隐藏 + `npm run verify:ui` 真机测量 | `cards size to their content and are never squeezed` / `cards never clip their content` / `the measured shedding ladder contains: …`（去 Token 彩条那一级）/ `the old viewport ladder is gone`（负向：`@media (max-height)` 写法已不存在）/ `the card column never shows a scrollbar` |
| 22 | **不允许滚动、不允许出现滚动条，且尽量显示全部信息** | 先压缩高度（三来源夹具内容 **526px** + 面板 chrome **58px**）+ 容器查询阶梯（**584/575/532/448/384/330**，按来源数追加预算 **`(n-3)×44`**）+ 阶梯末尾带 `!important` + `scrollbar-width:none`；会话卡永不截断行 | `the panel root is a size container` / `the measured shedding ladder contains: …` / `the old viewport ladder is gone` / `cards are padding 8 / gap 3` / `the card column never shows a scrollbar` |
| 23 | **同一组行左右对齐 + 行内垂直居中** | 父级网格 + 行 `grid-template-columns:subgrid` + 行 `align-items:center`；适用于账户卡来源行与按 provider 行（逐期行已随统计卡删除） | `the balance rows share one card grid` / `rows take their columns from the shared grid` / `subgrid rows centre their cells vertically` / `the provider rows share one parent grid` / `provider rows take their columns from the shared grid and centre their cells` / `the provider figure is pinned to the right edge`；layout-check 的 `acctLabelLeft`、`acctValueRight`、`provLabelLeft`、`provTokensRight` 边缘唯一性断言 + `${label}: ${name} not vertically centred` + `${label}: provider row wrapped` |
| 24 | **用量统计是三列严格对齐的表（无胶囊条）** | **已废弃（1.0.16，见 #46）**：整张统计卡（`描述 \| 用量 \| 金额`、`PLAN` 标记、逐期明细）随卡片删除，无消费方 | —（随统计卡删除） |
| 25 | **金额只留货币符号，且一律后置**（2026-11-08 扩展：所有货币） | `Intl.formatToParts` 重排，任何货币都是「数字 + 符号」：`23.28¥`、`9.50$`、`12.00€`；不显示货币代码 | `amounts use the narrow currency symbol` / `the balance row ends with the ¥ symbol` / `every currency keeps its symbol after the amount` / `no currency keeps the prefix form` |
| 26 | **期数标签带年份** | **已废弃（1.0.16，见 #46）**：期数 / 逐期列表随统计卡删除 | —（随统计卡删除） |
| 27 | **无障碍与动效是原则** | reduced-motion 全量关闭；装饰条 `aria-hidden`；所有控件有 focus 环 | `reduced motion covers every transition and animation` / `the refresh button keeps a keyboard ring` / `no capsule bar outside the session card: …` |
| 28 | **两处卡片页脚统一左中右结构** | **已废弃（1.0.16，见 #46）**：统计卡（含合计行）删除后只剩会话卡上下文图例一处，不再有「两处一致」；图例本身仍是左 / 中 / 右三列网格 | —（随统计卡删除） |
| 29 | **点 tab 不改变高度** | **已废弃（1.0.16，见 #46）**：维度 tab 与骨架槽位、维度缓存一并删除，面板内不再有范围切换控件 | —（随统计卡删除） |
| 30 | **统一优化所有 provider，不混数据、不串错误** | 独立来源状态、每来源一行、独立刷新、原始身份 | `errors are never shared between providers` / `requested source identity overrides provider aliases` / `every source row reads name left, figures right` |
| 31 | **账户卡不用 tab、不换行、不留白**（2026-11-08） | 每来源一行：名称左对齐，「短标签 数值」对右对齐；不加任何装饰圆点 | `one aligned row per source` / `no tabs to switch` / `every source row has exactly two cells` / `no dot decoration` |
| 32 | **除会话卡外不要胶囊进度条**（2026-11-08：「没什么信息量」） | 账户卡只写数字；会话卡 Token 构成条 / 上下文条保留（统计表已随卡片删除） | `no capsule bar outside the session card: …` |
| 33 | **不许连着两条分割线**（2026-11-08） | 每条 `aup-session-sep` 绑定它引出的区块，阶梯隐藏区块时一起隐藏 | `each session separator belongs to one block: …` |
| 34 | **OpenAI / Anthropic 先调研 API，确实不行才写 Unsupported** | 已调研（2026-11-08）：找到组织花费 API，未找到公开余额 API；余额卡不写花费 → `Unsupported`，不请求花费接口 | provider-host `openai/anthropic unsupported` 测试 / provider-client `OpenAI Unsupported` |
| 35 | **余额卡只写剩余，不写 costs**（2026-11-08） | 只显示 Balance / Bonus / Key / 套餐剩余；`Used`、本月花费一律不出现；**面板里不再展示消费金额**（#46），卡内也不许出现「花费」字样 | `the balance card shows what is left, never costs` / `no spend (Used) in the balance card` |
| 36 | **额度显示规范**（1.0.17 缩短标签，#50） | 套餐：`5H 63%  WE 70%  MO 85%`（全是剩余，不写 left）；DeepSeek：`Bal 199.54¥  Bon 0.00¥`（中文仍是 `余额 / 赠送`）；**标签与数值之间必须有可见间隙**（组间 12px / 对内 5px 起，见 #50） | `plan windows read the shortened 5H / WE / MO codes as the share left: …` / `the wallet labels are shortened to Bal / Bon` / `DeepSeek reads Balance x Bonus y on the right` |
| 37 | **不需要 Retry 按钮，获取不到就算了**（2026-11-08） | 失败只显示状态，不显示重试按钮、不自动重试；保留既有顶部刷新及定时刷新 | `failed reads never render Retry buttons` / provider-client 全部错误态无按钮、顶部刷新和旧响应回归 |
| 38 | **上架图标要体现 usage**（2026-11-08：「一点也没体现出来 usage 的概念」） | `icon.svg` = 蓝色圆角块 + 三条递增白色柱状条；设置里的已安装列表与市场 Discover 共用 | `the icon draws three usage bars` / `the wallet artwork is gone` |
| 39 | **当前会话在用的 Account 要凸显**（2026-11-08） | 最新 assistant 消息 provider 对应那一行：整行淡品牌色背景 + 名称加粗；无圆点、无胶囊、不改变列宽与左右边缘；`aria-current` 暴露给读屏 | `exactly one account row is highlighted` / `the row in use is the highlighted one` / `the highlight is exposed to assistive tech` / `the highlight is a background tint, not a pill` |
| 40 | **介绍语 20 字以内**（2026-11-08，先要 50 再收紧到 20） | 列表 / 市场 Discover 共用：`Balances + tokens.`（18 字符）/「余额与 Token 用量」（12 字）；`package.json.description`、`scripts/finalize-release.mjs`、`market/index.json` 同步，`market/check.mjs` 强制 ≤20 | `the plugin intro stays within 20 characters` / `the intro names balances and tokens` / market check `description must stay within 20 characters` |
| 41 | **账户行在最小宽度也不许换行**（2026-11-08 / 2026-11-09：「争取一行放完」） | 三级、全部不缩放字号：≥340px 舒适档（任何值单行）；≤330px 窄屏档（间距收紧、`proportional-nums`、图例 / 合计 `nowrap`）；≤320px 超窄档（内边距 5px、名称字距 -0.4、对的间距 2px+2px）；最坏情况（三个 `100%`）按**数值文本长度**用确定性 class 再紧一档（非测量），300px 仍单行；1.0.17 #50 起宽面板**不再用负字距**，变窄时按档收 `gap`（12 → 9 → 7 → 5），**任何档位都不许把标签与数值贴合** | layout-check 62 态：340px + 全 `100%`，320/310/300 的 worst（三个 `100%`）与 mixed（两个 `100%`）断言 `lines === 1` / `legend wrapped` / `summary wrapped` |
| 42 | **分隔符前后不留空格**（2026-11-09：「去掉-横向前后的空格以及其他空格」） | 所有分隔符号紧贴两侧文字：模型行 `Provider-model`、轮 / 步 `106/11550`、上下文 `595K/1M（60%）`、中文 `轮/步`；只保留单词之间的必要空格 | `provider and model share one line without spaces around the dash` / `model rows merge provider and model without separator spaces` / smoke 的 `轮/步` 标签断言 |
| 43 | **Command Code 额度也进右侧栏**（2026-11-09：「可以把这个插件集成到 usage 插件吗？」） | Host 读 `GET https://api.commandcode.ai/alpha/billing/credits`（Bearer `COMMANDCODE_API_KEY`，只走 Host）；账户卡该来源一行：`5H / WE` 两档**剩余**百分比 + `CR / 额度` 剩余金额（USD，符号后置）；`cap` 为 0 的窗口不画、缺额度就不写；**只写剩余不写 Used / 花费**；本会话 Token 出现在会话卡「按 provider 的会话内消耗」行 | smoke `Command Code windows read the share left` / `Command Code credits read the amount left with the symbol last` / provider-host `Command Code plan windows and credits come from the billing endpoint` / provider-client `windows read the share left in fixed order and credits stay the amount left` / verify:ui `command code` 单行断言 |
| 44 | **入口图标与左侧快捷簇一致**（2026-11-09：「我们的插件 icon 也用左侧这个按钮的 icon 吧 保持一致」） | 右侧栏 tab、开始页卡片都用 `IconGaugeOutlineRegular`（宿主 primitives，失败回退同形内联 SVG），与 shell「用量」按钮同一符号；钱包图标不再用于入口 | `the tab glyph is the shell quick-action gauge` / `the guide card uses the same gauge glyph` |
| 45 | **会话卡里的信息一律不许隐藏**（2026-11-09：「session usage 里的任何信息都是不允许隐藏的」） | 模型行**该画的行全量渲染**（单模型 provider 的行按 #48 不画），取消「最多 3 行 + 另有 N 个模型」；高度靠压缩框架换取（卡片 `gap:3px`、会话体 `gap:4px`、统计 / 网格间距收紧、`aup-model-more` 样式与文案删除）；短面板仍按阶梯整块隐藏，但绝不截断行 | smoke `every model of a multi-model provider renders, none truncated` / `the fourth model is folded, never a counter` / `no truncation line exists`；layout-check `${label}: model rows truncated` |
| 46 | **删掉「用量统计」卡，按 provider 的会话内消耗并入会话卡**（2026-11-09：「第二个卡片的 usage statistics 没什么用，不想要了，把按 provider 类型对应的会话内消耗都归到 session usage，删掉，只剩下 session usage 和 Account balance」） | 面板只剩**两张卡**：会话消耗 + 账户余额；会话卡在「按模型明细」**之前**新增「按 provider 的会话内消耗」块：容器 `.aup-providers`、行 `.aup-provider-row`、名称 `.aup-provider-name`、数值 `.aup-provider-tokens`，分割线 `span.aup-session-sep.aup-sep-providers` 与块**同生共死**，位于 `.aup-stat-list` 之后、`.aup-models` 之前；每行 = 该 provider 本会话 Token 合计，**不含金额**。同时删除：维度 tab、`SERIES_ROW_SLOTS`、维度缓存与预热、三列表格、`PLAN` 标记、逐期明细、平台来源行 `.aup-srcs`、两卡页脚三列网格；client 不再调用 `readUsage`，Host 路由**保留未删**但面板内无消费方；设置 7 项 → 4 项（§6），1.0.17 #51 再收敛为 **2 项**。被取代的规则：#3 #10 #20 #24 #26 #28 #29 | smoke `the panel renders exactly two cards: 2` / `the deleted statistics card never renders` / `four-character card titles` 等 15 条（完整清单见 `test/smoke.mjs`）；设置区断言见 #51（1.0.17 起只有 2 项开关） |
| 47 | **两张卡的高度要按信息密度分摊，别「底部太挤、上面太空」**（2026-11-09：「底部太挤了 上面太空了 两个卡片的高度没安排好」） | 删掉统计卡后剩余高度**不再全部**灌进会话卡：`.aup-cards>.aup-card-session-fixed{flex:3 1 auto}` / `.aup-card-account{flex:1 1 auto}` / `.aup-card-account-provider{flex:1 1 auto}`（原写死 `flex:0 0 auto` 是「底部太挤」的生效点），余额卡内部 `.aup-acct-srcs{flex:1 1 auto;min-height:0;align-content:space-evenly}` 摊行距；确定性 CSS、无测量（实测 1080px → 780/236、1200px → 870/266，余额卡 ≤ 列高 34%）。**取代** #5 中「余额卡按内容收紧 / 禁止 `space-evenly`」那半条 | 剩余高度按 **3:1** 分摊（会话卡约四分之三、余额卡约四分之一）；smoke `the dense session card absorbs the largest share of the leftover height` / `the balance card shares the leftover height instead of hugging its content` / `the balance rows spread out inside the balance card` 等 10 条；layout-check `space allocation`（余额卡随面板增长 ≥20px、会话卡增长更多、余额卡 ≤ 列高 34%） |
| 48 | **provider 与模型重复统计只保留一次**（2026-11-09：「重复了 provider+type 保留一次统计即可」，截图里 provider 行与 `Provider-模型` 行数值一一相同） | 按模型明细**只为「该 provider 本会话跑了 ≥2 个模型」画行**；单模型 provider **不画模型行**——它的模型行与按 provider 行数值完全相同，属于纯重复，信息由上方「按 provider 的会话内消耗」行承担（合计 = 该模型 tokens），**零信息丢失**，#45 不破；多模型 provider 仍逐模型一行 `Provider-model`（#42），和 = provider 行；阶梯里的「去按模型明细」一级（`.aup-models` + `.aup-sep-models`）不变（#49 后它在合计行之前）。单模型 provider 是**不画**，不是截断，也仍不写「另有 N 个模型」 | layout-check `${label}: model rows truncated -> N/M`（M = 应画行数 = 多模型 provider 的模型数；夹具助手 `detailModelCount()`）；smoke `an all-single-model session renders no per-model detail` / `one provider row per provider, never one per model: …` / `a folded single-model provider row still carries that model tokens, so nothing is lost: …` 等 10 条 |
| 49 | **上下文占用与合计对调**（2026-11-09：「我想 contextusage 的位置和 total 换一下是不是更好」） | `.aup-context` 打头、合计收尾；`aup-sep-context` 删除、`aup-sep-total` 与合计同生共死；阶梯末档 325→**330**（chrome 58） | `the context block opens the session card` / `the session total closes the session card` / `context usage is read before the session total` |
| 50 | **缩短标签、英文与数字留空隙**（2026-11-09：「缩短一下…能看懂就行」「英文和数字之间也加个空格吧」「数字重叠严重」） | 窗口 `5H/WE/MO`、英文 `Bal/Bon/CR`（中文「余额/赠送/额度」不变）；`.aup-acct-pairs{gap:2px 12px}` / `.aup-acct-pair{gap:5px}`，窄档 9/4 → 7/3 → 5/2；宽面板取消负字距 | `the window code is shortened to 5H`（WE / MO 同形）/ `the wallet labels are shortened to Bal / Bon` / `no pair glues its label to the figure` |
| 51 | **设置只留 2 项开关**（2026-11-09：「这两项配置删掉 就俩卡片 没有配置的必要」） | 隐藏底栏会话统计 + 自动刷新 + 恢复默认，提示行「余额每 5 分钟自动刷新」；`DEFAULT_SETTINGS={autoRefresh,hideComposerStats}`，持久化删 `cards`，`.aup-empty` 删除 | `settings keep exactly two switches` / `the two switches are the composer-stats toggle and auto refresh` / `no per-card switch copy remains` |

## 1. 产品定位

- DeepSeek Harness 右侧边栏插件，名称固定为 **「账号用量」**（英文 `Account usage`）。
- 面板固定**两张卡片**，顺序：**会话消耗 → 账户余额**；平台周期用量与消费金额不再在面板任何位置展示（#46）。
- 右侧栏 tab 用短标题「用量」（英文 `Usage`）。tab 图标固定为宿主的 `IconGaugeOutlineRegular`（仪表盘），与左侧快捷簇「用量」按钮同一符号，拿不到 primitives 时回退同形内联 SVG；**不要自己加 margin**，图标与文字的间距由组件给 (#44)。
- tab title 组件返回 **Fragment（裸 SVG + 纯文本）**，不要用 `Host` 包一层、不要写成普通字符串：宿主的 `GuideTitle` 就是 `<CompassGlyph/> + tab.title` 结构，形状不一致时切 tab 文字会被压扁变形。开始页（Guide）卡片图标同样用这个仪表盘 (#44)。
- **样式表必须注入 `document.head`**（apply 时）——tab chip 在面板 body 之外，只写 body 里管不到它 (#11)。
- 面板头部是一条横条，**它的下边线必须与宿主会话区的中线连成一条直线**：
  - 线样式与宿主一致：`.5px solid var(--dsw-alias-border-l2)`；
  - 横条高度**运行时测量** `conversation.header`，写入 CSS 变量 `--aup-head-h`，找不到时用 `[data-phase]` 会话根兜底；
  - root `padding-top` 必须为 0，横条才能从面板顶端起算；root `padding: 0 8px 6px`，横条用负外边距 `margin:0 -8px` + `padding:0 8px` 对齐两侧，否则线和中间会话区的线之间会留出面板 padding 的缝；
  - **线永远不能消失**：测量失败或数值不合理时回退默认高度，绝不写 `0` 或 `none`；
  - 定位方式：在 `[data-phase]` 会话根内做 BFS 找到 `[data-slot="conversation.header"]`（它就是那条线的绘制元素）；
  - 左侧设置齿轮、右侧刷新按钮在横条内**垂直居中**。
- 问候语优先级：**24 节气 > 法定节假日 / 农历节日 > 普通问候**；节气用 `Y*0.24+C` 近似公式（21 世纪常数表），节日按农历月 / 日判定（正月初一 / 十五、五月初五、八月十五等）。
- 数据必须是**真实数据**：DeepSeek 平台私有 usage / 余额接口；只有平台登录态或接口失败时才回退本地估算，且必须带 `≈` 标记。
- 界面统一用语 **「DeepSeek API」**（替代「DeepSeek 账号」等旧称）。
- 不显示账号身份信息（头像、姓名、手机号、邮箱等），不放置「查看用量 / 充值」等跳转链接 (#17)。
- **插件图标表达「用量」**：蓝色圆角应用块 + **三条递增的白色柱状条**；不要再用钱包、时钟、问号这类「余额」符号。这份 `icon.svg` 同时用于设置里的已安装列表与市场 Discover（#38）。
- **介绍语一句话、20 字以内**：`Balances + tokens.`（英文）/「余额与 Token 用量」（中文）；三处来源（`package.json.description`、`scripts/finalize-release.mjs`、生成后的 `market/index.json`）必须一致，`market/check.mjs` 强制 ≤20，**禁止**再写成长句（#40）。

## 2. 卡片与布局

- 卡片标题：**两张**卡标题都用**四个中文字符**（会话消耗 / 账户余额），居中；标题下方有 `.aup-divider` 细分割线；「用量统计」这张卡已删除，**不许改名、不许新增第三张卡** (#3 / #46)。
- **标题区只放图标 + 标题**：不放供应商徽标 / 标记（供应商只在账户卡来源行）。标题 `white-space:nowrap`，`aup-card-head` 用绝对定位的 `aup-card-head-inner` 让标题真正居中而图标不参与居中计算；绝不能把标题挤成两行 (#4)。
- **布局只用确定性 CSS，任何高度都不许靠运行时测量决定**（见 #14 / #21）：
  1. **卡片永远不小于内容高度**：`flex-basis:auto` + `min-height` 随内容，**绝不可能被压缩到内容以下**，卡内文字不可能互相遮挡；1.0.16 起剩余高度按下面的比例**向上撑开**而不是压缩。
  2. **剩余高度按信息密度分配，不是按位置分配**（2026-11-08：「最不该占用空间的卡片占了大片空间…信息量多的地方反而小」）：
     - **两张卡按 3:1 比例分摊剩余高度**（#47）：会话卡（8 项指标）取大头、余额卡（3 行数字）取小头，`flex-grow` 3:1；
     - **会话卡内部** `.aup-session-body{flex:1 1 auto;justify-content:space-evenly}`，把多出来的高度均匀摊在各段之间，不在卡片内部留一整块空白；
     - **余额卡内部也按行距摊开**：`.aup-acct-srcs{flex:1 1 auto;min-height:0;align-content:space-evenly}`；摊出的是**行距**，不是一整块空白。`flex:0 0 auto` 会让余额卡贴住内容、剩余空间全堆在面板底部（用户点名「底部太挤了 上面太空了」）。
     - 实测（真机 Chrome、三来源）：面板 1080px → 会话卡 780 / 余额卡 236；1200px → 870 / 266；余额卡始终 **≤ 列高 34%**，且会话卡的增长量大于余额卡。
     - 历史教训：按 DOM 位置让某张卡独占剩余高度的两种极端写法都被点名过。**正确规则是按密度分比例**，既不按位置，也不让某张卡独占。
  3. ~~明细列表固定槽位 `SERIES_ROW_SLOTS = 4`~~（**已随统计卡删除**，1.0.16，#46）：面板内不再有按维度切换的列表。
  4. **绝不允许滚动、绝不出现滚动条，并且尽量把信息全部显示**：
     - **先压缩：不删信息，只压高度**。卡片 `padding:8px` / `gap:3px`，会话体 `gap:4px`、Token 网格 `gap:4px`、模型行 `gap:0`。三来源夹具实测整屏内容（卡片高度和 + 6px 卡间距）**526px**（会话卡 408 + 余额卡 112 + 6；按 #48 只画多模型 provider 的模型行，若把单模型 provider 也画出来会更高，那不是当前形态）；面板 chrome（横条 + 底栏）= **58px**，所以「阶梯阈值 = 该级内容高度 + 58」。
     - **再按面板自身高度逐级收窄，用 `@container`（不是 `@media`）**：`.aup-root{container-type:size;container-name:aup-panel}`，阈值 **584 → 575 → 532 → 448 → 384 → 330**，顺序：`584 去 Token 彩条 → 575 去按模型明细 → 532 去统计行 → 448 去按 provider 行 → 384 去上下文块 → 330 去 Token 2×2 明细`（内容 526 / 517 / 474 / 390 / 326 / 272，各 + 58 chrome）。1.0.15 的历史值见 §13 的历史基准表；`node test/layout-check.mjs --tiers` 可重新量。
     - 每个区块与引出它的分割线（`aup-sep-models/-stats/-providers` 等）必须**同生共死**（#33）。
     - 来源 ≥4 时按 `data-source-count` 追加预算 **`(n-3)×44`** px（实测 4 / 5 / 7 来源 = 570 / 614 / 702，叠加在所有阈值上；每多一个来源 +44 ≈ 余额行 25 + 按 provider 行及行距 19；单模型 provider 不再多一行模型）。
     - **必须用容器查询**：窗口比面板高（右侧栏 tab 条 + 面板 chrome），`@media (max-height)` 判定基准错了。
     - 阈值由 `node test/layout-check.mjs --tiers` 用**真实面板 markup** 实测；规则放在样式表最末并带 `!important`。
     - **夹具数据必须与生产同形**：曾经夹具没给上下文字段，量出的内容高度比生产少 36px；`contextPressure`（projectedTokens / contextWindow）、`contextTokens`、`tokenUsage`、`sessionStats` 必须给真实形状。
     - 结论（三来源）：**面板 ≥584px 全部可见（内容 526px）**；584 / 575 / 532 / 448 / 384 / 330 逐级整块隐藏；面板 < 330px 时只剩基础信息；7 来源全部收窄后约需 **343px**（内容 285 + chrome 58）。阈值每次都要用 `--tiers` 重新量、改完同步更新本文件。
  5. 明令禁止：用 `ResizeObserver` / `getBoundingClientRect` 的内容高度做动态减行（09:29 崩溃成因）、用 `overflow:hidden` 或省略号假装解决。
  6. **必须用真机浏览器验证几何，而且必须量真实 markup**：`test/render-fixture.mjs` 用与冒烟测试相同的桩启动真正的 Chrome，把元素树序列化成 HTML；`npm run verify:ui`（`test/layout-check.mjs`）在无头模式固定面板里测量，覆盖 420px 宽 × `330/331/384/448/532/575/584/585/700/900/1080/1200`px 与 340px 宽 × `584/900/1080`px（另测 330/300px 窄屏余额行不换行）。断言**文本零重叠、卡片零溢出、无横向溢出、无死带、跨行列边缘对齐、行内垂直居中**，外加 #47 的 layout-check `space allocation`（余额卡随面板增长 ≥20px、会话卡增长更多、余额卡 ≤ 列高 34%）。曾经用手写 markup 近似面板，结果和真实渲染脱节。
- **任何地方都不允许滚动**（2026-11-08，取代旧的「卡内可滚动」）：`.aup-cards` 的 `overflow-y:auto` 只是一层**不可见的兜底**（滚动条外观全去掉），正常由容器查询阶梯保证装得下：**先减内容（阶梯）→ 装不下才轮到隐形兜底 → 绝不裁切** (#22)。
- **同一组数据行必须共用一个网格，左右都要对齐**（#23）：余额卡来源行（`.aup-acct-srcs`）与会话卡按 provider 行（`.aup-providers`）都用「父级 `grid-template-columns:minmax(0,1fr) auto` + 每行 `display:grid;grid-template-columns:subgrid;grid-column:1/-1`」。**禁止每行各写一套 `grid-template-columns`**：那样标签列按行内容算，右侧数值会随行漂移（实测差 13px）。行内单元格必须显式 `align-items:center`，漏掉会退化成 stretch / 顶对齐（曾实测偏 7px）。
- ~~**用量统计卡是一张三列表**~~（**已随统计卡删除**，1.0.16，#46）：`描述 | 用量 | 金额` 三列表、`.aup-stats-body` 列模板、来源组、第 3 列金额与 `PLAN` 标记、`::before` hairline 分组、期数标签（`YYYY Qn` / `YYYY`）全部删除。保留下来的教训仍适用于余额卡来源行与按 provider 行：每行单元格数**恒定**（绝不条件性少一格，否则整列错位）；分组 hairline **不能用 padding / border 撑行高**（会让行内元素偏心）。
- **会话卡的区块顺序**（1.0.17，#49）：`.aup-context`（上下文：head + bar + legend）→ `.aup-compose`（Token 构成条）→ `.aup-session-grid`（2×2 明细）→ `.aup-stat-list`（统计表）→ `.aup-providers` → `.aup-models` → `span.aup-session-sep.aup-sep-total` → `.aup-session-total`。**上下文占用打头、合计收尾**（原来上下文压底部、合计在顶部）。上下文块位置变了就**不再拥有分割线**（`aup-sep-context` 已删除）；`aup-sep-total` 与合计行同生共死（#33）。
- **「按 provider 的会话内消耗」块**（1.0.16，#46）：
  - 位置：`.aup-stat-list`（统计表）**之后**、`.aup-models`（按模型明细）**之前**；
  - 分割线 `span.aup-session-sep.aup-sep-providers` 与容器 `.aup-providers` 同生共死：阶梯隐藏容器时必须一起隐藏分割线（#33）；
  - 每行 `.aup-provider-row`：名称 `.aup-provider-name` 在左、数值 `.aup-provider-tokens` 在右，与余额卡来源行共用同一套父级网格 + subgrid + 垂直居中；
  - 每行 = 该 provider **本会话** Token 合计，**不含金额**（消费金额已不在面板内展示）；
  - `verify:ui` 用 DOM 顺序锁定 `.aup-stat-list` → `.aup-providers` → `.aup-models`。
- **按模型明细只画不重复的行**（1.0.16，#48）：只有「该 provider 本会话跑了 ≥2 个模型」才逐模型一行（标签仍是 `Provider-model`，#42）；**单模型 provider 不画模型行**——它与按 provider 行数值完全相同，纯重复，由上面的 provider 行代表，#45 的「不隐藏信息」因此仍成立。阶梯里的「去按模型明细」一级（`.aup-models` + `.aup-sep-models`）不变；`verify:ui` 用 `detailModelCount()` 先算应画行数（M = 多模型 provider 的模型数），再断言 `${label}: model rows truncated -> N/M`。
- ~~**点 tab 不许改变高度**~~ / ~~**两张卡页脚共用左 / 中 / 右三列网格**~~（**已随统计卡删除**，1.0.16，#24 / #28 / #29）：维度 tab、loading 骨架、固定槽位只服务已删的统计卡；页脚只剩会话卡的上下文图例（`.aup-context-legend`，`grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)`，第 1 格左贴边 / 第 2 格居中 / 第 3 格右贴边，#6）。
- 所有可用空间应尽量被有意义的内容覆盖；不要出现卡片内部无意义的大块空白。

## 3. 文本与排版（重点，多次强调）

- **全局只有一个字号：13px**（`--aup-fs-text`）。中文、英文、数字、符号**全部同字号**，禁止任何第二档（不许 11/12/14/16/20px）。层级只能靠**字重**：主数字 / 合计 600，常规数值与标签 500，极少数说明文字 400 (#9)。
  - 字族 `--aup-font-ui`：`-apple-system, "Segoe UI", "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`；数字容器加 `font-variant-numeric:tabular-nums`。
  - 长数字 / 长模型名**不许降字号**：只能靠 `letter-spacing` 微调、换行或自适应列宽解决。
- **英文 / 拉丁文字必须和中文一样「实」，不许发灰发浅**（2026-11-08：「英文文本看着过于浅了」）。拉丁字形笔画少、视觉墨色天然更浅，三条同时生效 (#19)：
  1. **字体栈拉丁优先**：`Helvetica Neue`、`Arial` 必须排在 `PingFang SC` **之前**——落到汉字字体的拉丁字形上会明显变细变浅；
  2. **根上打 500 基线**：`.aup-root{font-weight:500}`，**不允许出现继承默认 400 的情况**（全文件只保留 `.aup-pop-close-glyph` 的 × 是 400）；
  3. **次要文字色从主题 token 混出来**：`--aup-label-2: color-mix(in srgb, label-primary 30%, label-secondary)`（浅色约 8.6:1，裸 `label-secondary` 只有 5.8:1；深色自动反向变亮）；文字一律用 `--aup-label-2`，只有**图标 / 描边**用裸 `label-secondary`。
  4. 0 用量行本来就淡化：`opacity` 提到 `.62`（轨道 `.6`），可以淡，但不能读不出来。
- **卡片内所有文本禁止折叠、遮挡、省略、截断** (#8)。允许：自动换行、简化文案、列宽按内容自适应。全文件不允许 `text-overflow: ellipsis`（当前已清零）。
- Token 单位自动 `K → M → B → T`，最多两位小数；金额固定两位小数。
- **分隔符前后不留空格**（2026-11-09，#42）：`Provider-model`、`106/11550`、`595K/1M（60%）`、「轮/步」——横线、斜杠两侧紧贴文字，只保留单词之间的天然空格。
- **金额只显示货币符号、不显示货币代码，且符号一律放在数字后面** (#25)：
  - 统一：`23.28¥`、`9.50$`、`12.00€`、`-5.00¥`；**不写** `CN¥` / `CNY` / `$11.04`；
  - 实现：`Intl.NumberFormat({style:'currency', currencyDisplay:'narrowSymbol'})` 的 `formatToParts` 里**丢掉 currency part**，其余照原样拼接后追加窄符号，千分位 / 小数点 / 正负号 / 本地化分组都不受破坏；**禁止**再按货币分支（旧 `String(currency) === 'CNY'` 特例已删除）。
- 主题：只用 DSH 主题 token（`--dsw-alias-*`，图表色可用 `--dsw-static-*` + 十六进制 fallback），禁止硬编码普通颜色；浅色 / 深色都要验证对比度（主文本 18.9:1 / 15.0:1）。禁止用 `--dsw-alias-bg-layer-2`（浅色下等于 bg-layer-1，看不见）；边框 / 分隔线用 `border-l2`，轨道 / 骨架用 `bg-skeleton`。

## 4. 会话卡内容

必须覆盖原 DSH 底栏 + 「会话统计」弹窗能看到的全部数据，**按实际渲染顺序**排列：

1. 上下文占用：`已用 / 窗口（百分比）`、系统 / 工具 / 消息构成条与百分比（`.aup-context`，卡片最前）
2. Token 合计 + Token 构成条（`.aup-compose` / `.aup-session-grid`）
3. 输入（未缓存）、输出、缓存读取、缓存写入
4. 轮 / 步、请求次数、缓存命中率、平均每请求、输出速度（tok/s）、首 token 平均（TTFT）、模型用时、工具用时
5. 输出 Tokens
6. **按 provider 的会话内消耗**（1.0.16 从已删除的统计卡并入 #46）：每个 provider 一行「名称 Tokens」，只写本会话 Token 合计、**不含金额**；位置在统计表之后、按模型明细之前
7. **按模型明细**：只为跑了 ≥2 个模型的 provider 画行（#48），单模型 provider 由上一行代表，不重复
8. 合计（`.aup-session-total`，卡片最末，与 `aup-sep-total` 同生共死）

**渲染顺序即上面这个顺序（1.0.17 #49）**：`.aup-context` 在最前、`.aup-session-total` 在最后，中间依次 `.aup-compose` → `.aup-session-grid` → `.aup-stat-list` → `.aup-providers` → `.aup-models`。

## 5. 快捷键与右侧栏

- `⌘U`（macOS）/ `Ctrl+U`（Win/Linux）/ Web 用 `⌘⌥U` / `Ctrl+Alt+U`。
- **绝不擅自改宽度** (#12)：快捷键只打开面板，**不做任何收窄 / 加宽**（用户手动拖出的宽度必须保持）。唯一例外：面板实际宽度 < 300px 且**能测量到**时才加宽回 300px（宿主最窄值；340px 是舒适宽度）；测不到就不要猜。切 tab、切窗口回来都不许触发宽度变化。
- **最小宽度护栏**：打开期间监听自身宽度，低于 `PANEL_MIN_WIDTH`（300px）时自动加宽。**只在用户松手后纠正**（监听全局 `pointerdown/pointerup`，按下期间绝不发合成手势），否则会和拖动打架、导致宿主拖拽手柄卡死；合成手势的 `setPointerCapture` 覆写必须 try/finally 还原。
- 左侧栏底部不再放插件入口。
- 快捷键必须在 DSH 快捷键设置里可见、可改；无会话时返回 blocked 并提示「请先选择会话」。
- **开始页（Guide）卡片的快捷键提示** (#13)：guide entry 必须带 `commandId`，且等于注册的快捷键 id，宿主才会在卡片右侧显示键位（如 ⌘U）；id 统一用常量 `SHORTCUT_ID`，两处不能各写各的。

## 6. 设置（头部左侧齿轮）

标题就叫**「设置」**；弹层要精简、优雅。**2026-11-09（1.0.17，#51）收敛为 2 项开关 + 恢复默认**：

- **隐藏底栏会话统计**（默认开；关掉恢复 DSH 原底栏）
- **自动刷新**（默认开；余额 5 分钟；页面隐藏暂停）
- 提示行：**「余额每 5 分钟自动刷新」/「Balance refreshes every 5 min」**（单行，不换行、不省略）
- 恢复默认

两张卡**永远渲染**，没有显隐开关（用户：「这两项配置删掉 就俩卡片 没有配置的必要」）。开关顺序固定为上面两项的先后。

**已删除的设置项**：~~会话消耗卡 / 账户余额卡显隐~~（1.0.17，#51）、~~默认维度（日/周/月/季/年/全）~~（维度 tab 已随统计卡删除）、~~显示消费金额~~（面板不再展示任何消费金额）、~~用量明细列表~~（逐期明细随统计卡删除）。

旧 localStorage 键（`cards.session` / `cards.account` / `cards.stats` / `dimension` / `showCost` / `usageList`）**静默忽略**：不报错、不迁移、不弹提示。`DEFAULT_SETTINGS` 只有 `{autoRefresh, hideComposerStats}`，持久化结构里没有 `cards`；`.aup-empty` 样式 / `aup-empty` 节点 / `settings.allHidden` 与两张卡的开关文案已删除，旧偏好不会让面板变空。

要求：

- 设置持久化到 localStorage（`dsh.account-usage.settings.v1`）
- `Esc` / 遮罩 / `×` 可关闭，关闭后焦点回到齿轮
- 开关 `role="switch"`，键盘可操作

## 7. 第三方 Provider（非 DeepSeek 账号）

会话可能走 OpenRouter、Anthropic、OpenAI、DeepSeek API Key 等：

- 从**当前会话持久日志**读取 `assistant/message` 的 `source.provider` 判断。
- 全部第三方：**隐藏 DeepSeek 账户余额与 DeepSeek 平台用量**，账户卡改为显示对应 Provider 的余额（OpenRouter `/api/v1/credits`，失败回退 `/api/v1/key`；DeepSeek API Key 用 `/user/balance`）：
  - opencode / opencode-go / opencode-zen：`GET https://opencode.ai/zen/go/v1/usage`（Bearer Key），返回套餐百分比；来源行固定 `5H 63%  WE 70%  MO 85%`（5 小时 / 周 / 月，**全是剩余比例**，不写 left/剩余/已用；中英文同一套缩写，#50），不画进度条。（`opencode-go` 用 `OPENCODE_GO_API_KEY`；`opencode`/`-zen` 用 `OPENCODE_API_KEY`）
  - `commandcode`（`@mars-sea/dsh-commandcode-provider`）：`GET https://api.commandcode.ai/alpha/billing/credits`（Bearer `COMMANDCODE_API_KEY`），一次请求返回 5 小时 / 周两窗口的 `used` / `cap` 与额度（`monthlyCredits` 套餐剩余 + `purchasedCredits` / `freeCredits` 充值 / 赠送）；来源行显示 `5H 0%  WE 50%  CR 6.99$`（中文 `额度`），同样**全是剩余**、不写 Used；`cap` 为 0 的窗口不画，额度缺失就不写额度对。该插件自己的设置页仍保留完整面板，这里只做额度只读镜像。这一行是全卡最长的第三方行（#43），因此 `aup-acct-pairs-tight` 从「仅 ≤320px」改为**全宽度确定性加紧密**（按数值文本长度触发）：实测 **≥320px 任何值（含三个 `100%` 与 `999.99$`）单行**；300–319px 真实数值单行，只有超额金额（≥`99.99$`）会折两行——这是「名称更长的 Provider」在舒适宽度以下的已知物理极限，verify:ui 用 worst / typical 两个夹具分别锁定。
  - OpenAI / Anthropic：已调研（2026-11-08），官方接口是**组织花费**（OpenAI Costs API、Anthropic Cost Report，需组织权限），**未找到公开余额接口**；用户决定余额卡不写花费，所以两家显示 `Unsupported`，插件不请求花费接口 (#34)。
  - 其余未接入的 Provider 显示「插件暂不支持 / Unsupported」，不暗示供应商没有 API；本会话 Token 在会话卡「按 provider 的会话内消耗」块里看，账户卡不重复。
  - 未配置、鉴权失败、超时、网络失败、凭据读取失败分别显示短状态；不提供任何 Retry / 重试按钮，不因失败立即重发请求；既有顶部刷新与定时刷新保持不变 (#37)。
  - **余额卡只写剩余** (#35)：`Bal` / `Bon` / `Key`（OpenRouter 密钥额度）/ 套餐剩余；`Used`、本月花费不出现；只有用量没有剩余时写「无余额数据 / No balance」，绝不当成 0。
  - 统一显示规范 (#36)：右侧是「短标签（次要色） 数值（加粗）」对，**组间 12px、对内 5px**（`.aup-acct-pairs{gap:2px 12px}` / `.aup-acct-pair{gap:5px}`，变窄时按档递减到 9/7/5 与 4/3/2，见 #50），如 DeepSeek `Bal 199.54¥  Bon 0.00¥`（中文 `余额 / 赠送`）、opencode `5H 63%  WE 70%  MO 85%`。不画进度条。
- 只要出现第三方来源（含单 Provider 会话），账户卡**每个来源一行**（`.aup-acct-srcs`，取代来源 tab：tab 多于 3 个会换行、短 pane 留白，用户点名不美观），来源名左对齐，右侧「短标签 数值」对右对齐；**不加任何装饰**（曾给当前来源加小圆点，用户：「没有用就删掉，别浪费注意力」）；没有任何切换，因此不存在「点 tab 改变高度」的问题；第三方余额与 DeepSeek 钱包一样实时读取（opencode 走套餐百分比）；平台周期用量与消费金额**不再在面板内展示**；Host 侧 usage 路由**保留未删**（`test/provider-host.mjs` 仍在跑），只是面板内没有消费方。卡标题不挂任何徽标。
- **当前会话正在使用的来源要凸显** (#39，2026-11-08「给当前会话正在使用的 Account 加个凸显样式」)：判定 = 日志里**最新一条 assistant 消息的 `source.provider`**（`deepseek-account` 映射到 DeepSeek API 那一行），对应行加整行淡品牌色背景（`color-mix(in srgb, brand-primary 10%, transparent)`）+ 名称字重 600，`aria-current="true"` 暴露给读屏。**禁止**为此加圆点 / 胶囊 / 徽标，**禁止**改内边距或列宽——背景不移动左右边缘，`verify:ui` 的 `acctLabelLeft` / `acctValueRight` 唯一性断言必须继续通过；单账号会话（只有 DeepSeek 钱包、没有行列表）不加强调。
- **余额卡的行在最小宽度（300px）也必须单行** (#41)：≥340px 舒适档任何数值（含三个 `100%`）单行；≤330px 窄屏档间距收紧 + `proportional-nums`、图例与合计行 `nowrap`；≤320px 超窄档卡片左右内边距 5px、名称字距 -0.4px、对内间距 2px、对间 1px，三窗口全 `100%` 的行按**数值文本长度**加 `aup-acct-pairs-tight` 再紧一档（确定性，不测量）。行仍用同一套网格，**禁止**靠加宽面板 / 隐藏窗口 / 改字号 / `transform: scale` 回避。`verify:ui` 在 340px（全 `100%`）与 320/310/300px（worst + mixed）都要 `lines === 1`、未裁切。已知物理极限：<300px 或名称更长的新 provider 可能仍需两行——属于宿主最窄以下，不在保证内。
- ~~逐期明细列表 / `SERIES_ROW_SLOTS` / `DIMENSION_ROW_CAP`~~（**已随统计卡删除**，1.0.16，#46）。**禁令永久有效**：禁止用 ResizeObserver + setState 做「按高度动态减行 / 自反馈布局」——布局→setState→布局 的反馈环曾把 DSH 直接搞崩（09:29 崩溃报告，见 #14）。宁可少显示几行，也不要自反馈的布局测量。
- Provider 余额缓存 60 秒；手动刷新强制重新查询。
- **API Key 只在 Host 侧读取**（`ctx.credentials`），不得下发到浏览器 / 客户端。

### 7.1 Provider 统一优化（2026-11-08）

用户：「OpenAI 的请求信息过于杂乱了…其他 provider 可能也会有问题…统一优化」。必须统一处理，而非只改一个 provider：

- 按原始请求 provider id 保存 `byProvider[id]`，独立 loading / ready / error。失败不覆盖其它来源的成功，禁止只取第一个全局错误。
- Host 和 Client 均保留请求身份；别名只复用读取实现，不合并不同来源 / 密钥的余额（Go / Zen 不可串账）。
- 每个来源一行：失败 / 未接入只写短状态（英文 `Unsupported` 等单词级短语），获取不到就停留在状态文字，不加重试按钮。英文窄栏的长状态会换行增高，所以状态一律用短词。
- 「插件暂不支持」不等于「供应商没有 API」；禁止暗示余额缺失就是 0。OpenRouter `/credits` 缺 usage 必须回退或失败；`/key` 标明密钥额度作用域。
- 刷新按 provider 独立读取，逐来源请求序号丢弃旧响应；会话变化 / 卸载后失效。取消的平台请求不得锁死纯第三方刷新按钮。
- 账户卡不再有 tab：所有来源同时可见，没有可点的东西，高度只随来源数量和窗口变化。没有备注的行数值独占右侧，不会因为别的行长而换行。
- 4–16 来源按数量追加预算 **`(n-3)×44`** px（实测 4 / 5 / 7 来源 570 / 614 / 702；1.0.15 为 `(n-3)×69`，见 §13 历史基准表；`layout-check --tiers N` 实测）。不根据 DOM 高度反算布局。几何验证覆盖 3 / 4 / 5 来源（700 / 900 / 1080 高）与 7 来源（900 / 1080 高）；7 来源在 **343px** 以下的面板只能依赖隐形兜底（内容 285 + chrome 58）。
- 验收：`test/provider-host.mjs` 模拟真实 Host route（不访问真实网络 / 凭据）；`test/provider-client.mjs` 渲染真实账户卡和 body effects，覆盖混合成功 / 失败、错误顺序、0 用量、所有失败态无重试按钮、旧响应与纯第三方刷新。
- `verify:ui` 另测来源数 × 中英文 × 340/420 宽 × 700/900/1080 高，并加测 330/300 窄屏：无重叠 / 溢出 / 滚动 / 底部空带，账户行名称左对齐、数值右对齐且垂直居中。夹具必须把 ARIA 布尔值写为字符串 true/false。
- 冒烟守护：`errors are never shared between providers` / `requested source identity overrides provider aliases` / `one aligned row per source` / `no tabs to switch` / `the English unsupported status stays one short word`。

## 8. 底栏会话统计

- 插件启用后默认隐藏 DSH 输入框底部的会话统计（含 `ContextMeter` 的上下文环形 `%`）：通过 `<html data-account-usage-hide-stats>` + 隐藏 `[data-composer-dock]` 容器实现，并对 `[data-composer-stat]` 兜底。
- 隐藏后相关信息必须完整出现在右侧面板（见 §4）。
- 插件停用 / 卸载时清理该属性；设置里可关闭隐藏、恢复原底栏。
- 目标：输入区底部与输入卡顶齐，不再多一行。

## 8.5 多语言

- 跟随 DSH 语言设置：中文（`zh`）显示中文，**其它语言一律英文**。
- 内置语言 `ja/es/fr/de/ru/pt` 显式注册英文词典，最终回退到 `en`。
- 所有界面文案、Provider 名称、错误原因、时长 / 金额格式都随语言切换；切换即时生效。
- `locale/*.json` 元数据对非中文语言提供英文回退。
- 禁止在组件里硬编码中英文文案（指令、快捷键别名除外）。

## 9. 性能

- 余额 5 分钟自动刷新；页面隐藏时暂停，回前台补一次。
- ~~月份缓存 / 维度结果内存缓存 / 全维度预热~~（**已随统计卡删除**，1.0.16）：client 不再调用 `readUsage`，`dimensionResults`、`WARM_ORDER`、骨架槽位一并移除；Host 侧平台 usage 路由**保留未删**、登录态缓存 30 秒不变，只是面板内没有消费方。
- 首屏骨架屏；尊重 `prefers-reduced-motion`。
- **无障碍与动效（属于原则，不是可选 polish，#27）**：
  - 面板里**所有**过渡与动画都要在 `prefers-reduced-motion: reduce` 下关掉（`transition` 覆盖 icon-button / dim / pop-link / toggle，`animation` 覆盖 skeleton / spin），不允许只处理一两个控件。
  - **装饰性进度条一律 `aria-hidden`**：紧邻的数字就是它的文本替代（会话构成条、上下文条；其余卡片已不使用进度条）。
  - **每个可交互控件都有 `:focus-visible` 环**（含顶部刷新按钮），键盘用户不能有死角。
  - 语义角色齐全：账户来源行 `role="list"` + `listitem`、按 provider 行同理，开关 `role="switch"`，设置弹层 `role="dialog"`（范围 tab 的 `role="tablist"` / `role="tab"` 随统计卡删除）。

## 10. 安全与隐私

- 平台 token 只在 Host 进程内存，不写日志、不进模型上下文、不下发客户端。
- Host 路由只允许本机回环 + 同源（Host / Origin / sec-fetch-site 校验）；平台请求 `redirect: manual`、超时、响应大小上限。
- 无遥测、无第三方域名（Provider 余额只请求 Provider 官方接口）。
- 发布前 `npm prepack` 自动跑 `scripts/secret-scan.mjs`，命中密钥 / 个人信息拒绝打包。
- npm 发布用用户提供的 granular token，**只在内存 / 临时文件（`/tmp`，chmod 600）里用，绝不写进仓库或长期配置**，用完立刻删临时文件并提醒吊销。
  - **2026-11-08 用户明确指示：当天还要持续更新，token 先不吊销，更新全部结束后再处理**。这种情况不要反复提醒；每次发布时从会话记录重新取 token → 建临时 npmrc → 发布 → 立刻删除临时文件。等用户说「更新完了」再提醒吊销一次。
- 仓库内不得出现 token、个人数据、本机绝对路径。

## 11. 发布

- npm：`dsh-account-usage`（author `chaox`，repo `lizhichaox/dsh-account-usage`）。
- 市场索引由 `market/index.json` 生成：`npm run market:index`（Git 源）或 `npm run market:index:npm`（npm 发布后）。
- 发布前必须 `npm run verify`（语法 + 冒烟 + 敏感信息扫描 + 索引自检）。
- 每次更新：`npm version patch` → `npm publish` → `npm run market:index:npm` → commit / push → 等 Pages → 官方 `parseMarketIndex` 复核。
- 版本要求 `engines.dsh: ^0.2.2-rc.1`。
- 不擅自发布 npm：需要用户登录或提供一次性 token；发布后提醒吊销。

## 12. 工程习惯

- 改完必须跑：`node --check index.js && node --check client.js && npm run verify`。
- 动布局 / 几何必须再跑 `npm run verify:ui`（真机 Chrome 无头 + 真实 markup，不是字符串断言、不是手写近似）。
- 视觉 / 交互改动要补冒烟测试；Host 折叠逻辑要有单元测试。
- 无法用浏览器验证时，如实说明「基于 CSS / 契约测试，非真机像素比对」。
- 本地是 link 安装；改 `index.js` 需要 Plugin Manager 停用 / 启用一次，改 `client.js` 等 HMR。
- 不把内部文件（test / market / AGENTS / README 等）打进 npm 包（`files` 白名单）。
- 用户偏好：**主动做完、少提问、别让用户重复要求**；不确定时先按本文件默认执行。

## 13. 已完成的关键决策（避免回退）

每条格式：**结论**（版本）→ 取代了什么 / 关键实现 → 相关小节。

- **账户卡来源行**（§7、§7.1）：取代「来源 tab + 共享网格等高 pane」（tab 换行、短 pane 留白，被用户点名不美观）；独立原始身份与状态保留。
- **获取不到就算了，不提供 Retry 按钮**（#37）：取代「余额失败时定向重试」，并移除统计卡错误态的重试按钮；只保留既有顶部刷新及定时刷新。
- **图标从钱包换成用量柱状图**（1.0.6，#38）：取代「钱包 + 时钟」图标；已安装列表与市场索引共用 `icon.svg`。
- **介绍语压到 20 字以内**（1.0.8，先压到 50 又收紧，#40）：取代原来 130 字符的长句，只剩「余额 + Token」。
- **余额行最小宽度单行**（1.0.9，#41）：收紧对间距 / 字距，取代「窄面板允许换行」；340px 是舒适宽度。
- **最小宽度护栏降到 300px**（1.0.10）：取代 340px 回弹；宿主最窄也能用，330px 以下自动进入紧凑档。
- **超窄档 + 确定性加紧密**（1.0.11）：取代「300px 下三个 `100%` 只能折行」；按数值文本长度决定是否再紧一档。
- **Command Code 额度并入账户卡**（1.0.13，#43）：不新开 tab、不改其设置页，只在账户卡按统一来源行显示余额 + 额度；Host 侧独立读取官方 billing 接口（60 秒缓存、失败只写短状态；字段见 §7）。`aup-acct-pairs-tight` 改为**全宽度**确定性加紧密；≤310px 的超额金额允许两行（已记录）。（1.0.17 #50 起标签为 `5H / WE` + `CR`，窗口 `5HW / WEK` / `CRED` 是历史写法）
- **会话卡不截断模型行**（1.0.15，#45）：取消「最多 3 行 / 另有 N 个模型」，模型全量渲染；同时压缩框架（gap 4→3、会话体 6→4、统计行距 2→1、token 条 8→6），整屏内容 793→763px，阶梯阈值随之下移。
- **入口图标改用仪表盘**（1.0.14，#44）：tab / 开始页与左侧快捷簇「用量」按钮同一符号，取代钱包图标；primitives 不可用时回退同形内联 SVG。
- **分隔符去空格**（1.0.12，#42）：模型行改 `Provider-model`，轮 / 步与上下文改 `a/b`，取代带空格的 `Provider - model` / `106 / 11550`。
- **所有货币符号后置**（1.0.9，#25）：取代「只有 ¥ 后置、其它货币按 `$11.04` 惯例」。
- **当前 Account 用整行背景凸显**（1.0.6，#39）：取代「当前来源小圆点」（当时被判无信息量而删除）；现在这条信息有意义，但只用**背景 + 字重**表达，不加新元素、不产生布局位移。
- **余额卡只写剩余**（#35）：取代「OpenRouter 显示已用」「OpenAI / Anthropic 显示本月花费 + 需管理员密钥」；也取代「当前来源小圆点」。
- **只有会话卡保留进度条**（#32）：取代「用量统计四列表含胶囊条」「账户卡胶囊条」。
- **布局几何一律用 `npm run verify:ui` 在真机 Chrome 里量**；**不再靠「看代码推断布局」交付**（§2 第 6 条、§12）。
- **卡片**不使用 `container-type: size`（内容高度会塌陷成 0）；**面板根节点必须用** `container-type:size;container-name:aup-panel`（§2）。
- **面板充满整高、剩余高度按信息密度分配**（#5、#47，规则见 §2 第 2 条）：会话卡取 3 份、余额卡取 1 份，余额卡内部摊行距且 ≤ 列高 34%。取代「三张卡平分」（压到内容以下 → 叠字根因）、「最后一张卡吸收」、「余额卡收紧、全部剩余灌进会话卡」三种写法。
- **会话卡行与统计表**：模型行每行 `Provider-模型短名    Tokens`，有多少行就显示多少行（#45）；统计区两列表格（标签 `max-content`、值列右对齐，行高 18px、列间距 16px），数值过长只收紧字距（`statValueClass`），不改字号、不与相邻列重叠；时长用紧凑格式（1时44分 / 2分57秒 / 1.7秒）；无省略号，长文本换行（字号恒 13px）。
- **英文（拉丁）文字墨色与中文对齐**（#19，规则见 §3）：取代「次要文字直接用 `label-secondary`、字重从默认 400 继承」。
- ~~**切维度零抖动**~~（**已随统计卡删除**，1.0.16，#20 / #29）：`SERIES_ROW_SLOTS=4` 槽位、固定行距而非 space-between、加载骨架与 ready 同构等高、后台预热全部维度均被「删除用量统计卡」取代。保留的只有「禁止任何自反馈布局测量」这条禁令（#14）。
- **绝不遮挡 + 绝不滚动 + 尽量全显示**（#21、#22）：卡片按内容撑开永不被压缩；先压紧框架（1.0.16 内容 **526px**、chrome 58px），再按**面板自身高度**用 `@container` 阶梯整块隐藏（阈值、顺序、同生共死规则见 §2 第 4 条）；会话卡内部永不截断，滚动条只作隐形兜底；禁止运行时测量的行数调整（09:29 崩溃成因）。取代按**窗口**高度判定的 `@media (max-height:)` 写法——窗口比面板高约 90px，基准错了。
- **面板最小宽度 300px**（340px 舒适）：低于它自动纠正；万一失败，模型行 `Provider-模型名` 换行显示（不降字号），token 数值 `margin-left:auto` 右推，绝不压到文字上。
- **底栏 dock + ContextMeter 一起隐藏**（只隐藏 slot 不够，§8）。
- **删掉「用量统计」卡、按 provider 的会话内消耗并入会话卡**（1.0.16，用户 2026-11-09：「第二个卡片的 usage statistics 没什么用，不想要了，把按 provider 类型对应的会话内消耗都归到 session usage，删掉，只剩下 session usage 和 Account balance」，#46）：面板只剩**两张卡**，会话卡新增「按 provider 的会话内消耗」块（位置与字段见 §2）。**取代**：#3（三张卡）、#10（切 tab 不闪动）、#20（切维度不抖动）、#24（三列表格）、#26（期数标签带年份）、#28（两处页脚一致）、#29（点 tab 不改变高度），以及「三张卡固定叫…」「全 (ALL) tab」「按来源一行 + 合计」三条。
- **两卡高度按信息密度分摊**（1.0.16，#47，用户 2026-11-09：「底部太挤了 上面太空了 两个卡片的高度没安排好」）：剩余高度不再**全部**灌进会话卡，改按 3:1 分摊（`flex:3 1 auto` / `flex:1 1 auto`，余额卡内部 `align-content:space-evenly` 摊行距；实测 1080px → 780/236、1200px → 870/266，余额卡 ≤ 列高 34%；类名见 §2 第 2 条）。全部确定性 CSS、无运行时测量。**取代**「余额卡 `flex:0 0 auto` 按内容收紧、禁止 `space-evenly`」那半条，另一半「按密度不按位置、余额卡不许吃掉整屏空白」继续有效。
- **provider 与模型不重复统计**（1.0.16，#48，用户 2026-11-09：「重复了 provider+type 保留一次统计即可」）：按模型明细只为「跑了 ≥2 个模型」的 provider 画行，单模型 provider 不画模型行，信息由「按 provider 的会话内消耗」行承担，零信息丢失；多模型 provider 的模型行之和仍等于 provider 行。**修订** #45：不隐藏信息 = **该画的行全量渲染**（不截断、不写「另有 N 个模型」），而不是每个 provider 都画模型行。
- **第三方会话不显示 DeepSeek 余额 / 平台用量**，改显示 Provider 余额（§7）。
- **上下文只保留一条按占用比例着色的堆叠条**；Token 构成条与明细标签颜色圆点对应。
- ~~用量统计统一为「按来源一行 + 合计」；明细列表逐期单行 Token · 金额~~（**已随统计卡删除**，1.0.16）。
- ~~**「全」(ALL) tab 在「年」之后**~~（**已随统计卡删除**，1.0.16）：按年分桶、6 年回溯、`dsh.account-usage.all-start.v1` 随维度 tab 一起移除。
- ~~**优先左右结构**：统计来源行用 `标签 | Tokens | 金额/PLAN` 三列网格~~（**已随统计卡删除**，1.0.16）。保留的部分：账户卡的余额 / 套餐标题与数值必须在同一行（标签左、数值右），不要把「套餐剩余 / 99%」上下堆叠导致右侧大片空白。
- **快捷开栏不改宽度**：只在面板实测宽度 < 300px 时自动加宽回 300px（测不到就不猜），失败静默（§5）。
- **上下文占用打头、合计收尾**（1.0.17，#49）：`.aup-session-body` 顺序改为 上下文 → 构成条 → 2×2 → 统计表 → 按 provider → 按模型 → `aup-sep-total` → 合计；`aup-sep-context` 删除。**取代**「上下文压卡片底部、合计在顶部」的旧顺序（顺序明细见 §2）。
- **标签缩短 + 英文与数字留空隙**（1.0.17，#50）：窗口 `5H/WE/MO`、英文 `Bal/Bon/CR`（中文不变）；间距改由 `gap` 分档（宽 12/5，窄 9/4 → 7/3 → 5/2），**取消宽面板负字距**。**取代**「靠负字距把 `5HW100%` 挤进一行」（「数字重叠」的直接成因）。
- **设置删掉两张卡的显隐开关**（1.0.17，#51）：只剩 2 项开关 + 恢复默认；`DEFAULT_SETTINGS` 只剩 `{autoRefresh,hideComposerStats}`，持久化删 `cards`，`.aup-empty` / `settings.allHidden` 删除。**取代** #16 / #46 的「4 项开关」写法（详见 §6）。
- **本轮 1.0.17 发布 npm**；本地插件通过 Plugin Manager 重载，不能把 applied 等同于实时 GUI 像素验收。Client HMR 只有确认同 checkout 的 `pnpm run dev:web` watcher 在运行才可承诺；否则要求刷新现有页面，不开替代服务器。

历史基准表（仅历史对照，**当前值以 §2 为准**）：

| 版本 | 三来源整屏内容 | 收窄阶梯（阈值） | 来源预算 | 7 来源兜底 |
|---|---|---|---|---|
| 1.0.4 | 838px | 895 · 883 · 823 · 739 · 681 | — | — |
| 1.0.5 | 793px | 850 · 838 · 771 · 680 · 615 | `16+(n-3)×52` | — |
| 1.0.15（#45 压框架） | 763px | 820 · 811 · 751 · 667 · 608 | `(n-3)×69` | 802px |
| 1.0.16 | 526px（会话 408 + 余额 112 + 6） | 584 · 575 · 532 · 448 · 384 · 325 | `(n-3)×44` | 343px |
| **1.0.17（当前）** | **526px**（会话 408 + 余额 112 + 6） | **584 · 575 · 532 · 448 · 384 · 330** | **`(n-3)×44`** | **343px** |
