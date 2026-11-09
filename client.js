/**
 * Account usage — Client half.
 *
 * Registers a page tab type in the right sidebar (`account-usage`), a guide
 * card that opens it, and a sidebar-foot action beside Settings that opens it
 * in one click.
 *
 * The usage card shows real DeepSeek platform usage: the Client fetches one
 * month at a time from this bundle's Host route
 * (`/account-usage/platform/usage`), which proxies the platform's private
 * usage amount/cost endpoints with the signed-in account's platform session.
 * Daily token counts and real costs are folded into the selected
 * day / week / month / quarter / year buckets.
 *
 * When the platform route cannot serve a window (signed out, session rejected,
 * offline), the panel falls back to local session records: token totals from
 * `session.list`'s `tokenUsage` summary projection, attributed to each
 * session's last activity, with DeepSeek list prices used only to estimate the
 * amount (shown with `≈`).
 *
 * The account card reads balance from the `account` Remote namespace, and this
 * session's own usage comes from the token-meter projections (`tokenUsage`,
 * `contextPressure`).
 */
window.__ModuleLoader__.load({
  id: 'dsh-account-usage',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Module identity: the tab type id and the slot cell key collide by design. */
    const ID = 'dsh-account-usage';
    /** The page kind users open through the guide card or the foot action. */
    const KIND = 'account-usage';
    /** This plugin's Client locale namespace. */
    const NS = 'accountUsage';
    /** How often the account wallet is re-read while the panel stays mounted and visible. */
    const ACCOUNT_REFRESH_MS = 5 * 60 * 1000;
    /** How often the session-list fallback is re-read; platform reads mostly hit the month cache. */
    const USAGE_REFRESH_MS = 2 * 60 * 1000;

    /** Display preferences persisted by the browser, so the panel needs no Host configuration. */
    const SETTINGS_KEY = 'dsh.account-usage.settings.v1';
    const DEFAULT_SETTINGS = {
      dimension: 'day',
      autoRefresh: true,
      showCost: true,
      hideComposerStats: true,
      usageList: false,
      cards: { session: true, stats: true, account: true }
    };

    /** Read persisted preferences, falling back to defaults on any malformed or unknown value. */
    function readSettings() {
      try {
        const raw = globalThis.localStorage === undefined ? null : globalThis.localStorage.getItem(SETTINGS_KEY);
        if (raw === null || raw === undefined) return DEFAULT_SETTINGS;
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object') return DEFAULT_SETTINGS;
        const dimension = DIMENSIONS.some((entry) => entry.id === parsed.dimension) ? parsed.dimension : DEFAULT_SETTINGS.dimension;
        const cards = parsed.cards !== null && typeof parsed.cards === 'object' ? parsed.cards : {};
        return {
          dimension,
          autoRefresh: typeof parsed.autoRefresh === 'boolean' ? parsed.autoRefresh : DEFAULT_SETTINGS.autoRefresh,
          showCost: typeof parsed.showCost === 'boolean' ? parsed.showCost : DEFAULT_SETTINGS.showCost,
          usageList: typeof parsed.usageList === 'boolean' ? parsed.usageList : DEFAULT_SETTINGS.usageList,
          hideComposerStats: typeof parsed.hideComposerStats === 'boolean' ? parsed.hideComposerStats : DEFAULT_SETTINGS.hideComposerStats,
          cards: {
            session: typeof cards.session === 'boolean' ? cards.session : DEFAULT_SETTINGS.cards.session,
            stats: typeof cards.stats === 'boolean' ? cards.stats : DEFAULT_SETTINGS.cards.stats,
            account: typeof cards.account === 'boolean' ? cards.account : DEFAULT_SETTINGS.cards.account
          }
        };
      } catch (error) {
        return DEFAULT_SETTINGS;
      }
    }

    /** Persist preferences; private mode or a full quota only skips persistence. */
    function writeSettings(settings) {
      try {
        if (globalThis.localStorage !== undefined) globalThis.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch (error) {
        /* preferences stay in memory for this session */
      }
    }

    // ------------------------------------------------------------------ copy --

    /** Simplified Chinese dictionary (the key-set source of truth). */
    const zh = {
      'tab.title': '用量',
      'panel.title': '账号用量',
      'guide.title': '账号用量',
      'guide.description': '余额与按日、周、月、季、年统计的用量',
      'shortcut.open': '打开账号用量统计',
      'shortcut.noSession': '请先选择会话',
      'refresh.aria': '刷新余额与用量',
      'loading': '正在读取…',
      'stats.loading': '正在读取用量…',
      'error': '读取账号信息失败',
      'retry': '重试',
      'settings.aria': '设置',
      'settings.title': '设置',
      'settings.defaultDimension': '默认维度',
      'settings.card.session': '会话消耗',
      'settings.card.stats': '用量统计',
      'settings.card.account': '账户余额',
      'settings.autoRefresh': '自动刷新',
      'settings.autoRefreshHint': '用量 2 分钟 · 余额 5 分钟',
      'settings.showCost': '显示消费金额',
      'settings.hideComposerStats': '隐藏底栏会话统计',
      'settings.usageList': '用量明细列表',
      'settings.reset': '恢复默认',
      'settings.close': '关闭',
      'settings.allHidden': '三张卡片都已隐藏，点右上角设置可重新开启。',
      'account.title': '账户余额',
      'account.signedOut': '当前未登录 DeepSeek API',
      'account.signedOutHint': '设置 → 账号 登录后显示余额',
      'balance.recharge': '余额',
      'provider.deepseekAccount': 'DeepSeek API',
      'provider.deepseekApiKey': 'DeepSeek API Key',
      'balance.used': '已用',
      'account.status.loading': '读取中',
      'account.status.signedOut': '未登录',
      'account.bonusLabel': '赠送',
      'account.keyLabel': '密钥',
      'account.status.noBalance': '无余额数据',
      'account.status.unsupported': '插件暂不支持',
      'account.status.noKey': '未配置密钥',
      'account.status.auth': '密钥验证失败',
      'account.status.credentials': '凭据读取失败',
      'account.status.timeout': '查询超时',
      'account.status.invalid': '返回数据异常',
      'account.status.network': '暂时无法读取',
      'account.offAccountAll': '本次会话由 {provider} 提供，不消耗 DeepSeek API 余额。',
      'stats.platformBadge': 'DeepSeek API',
      'stats.subscriptionScope': '套餐',
      'balance.bonus': '赠送额度',
      'balance.failed': '余额读取失败',
      'balance.empty': '暂无余额数据',
      'stats.title': '用量统计',
      'stats.dim.day': '日',
      'stats.dim.week': '周',
      'stats.dim.month': '月',
      'stats.dim.quarter': '季',
      'stats.dim.year': '年',
      'stats.dim.all': '全',
      'stats.summary.total': '合计 {total}',
      'stats.summary.requests': '{count} 次请求',
      'stats.summary.sources': '{count} 个来源',
      'stats.empty': '暂无用量记录',
      'stats.failed': '用量记录读取失败',
      'stats.localBadge': '本地估算',
      'stats.reason.no_account': '未登录账号',
      'stats.reason.auth_failed': '账号登录态不可用',
      'stats.reason.timeout': '平台请求超时',
      'stats.reason.fetch_failed': '网络请求失败',
      'stats.reason.invalid_response': '平台接口返回异常',
      'stats.reason.network': '网络请求失败',
      'stats.reason.local_unavailable': '本地记录不可用',
      'tokens.title': '会话消耗',
      'tokens.total': '合计',
      'tokens.uncachedInput': '输入（未缓存）',
      'tokens.output': '输出',
      'tokens.cacheRead': '缓存读取',
      'tokens.cacheWrite': '缓存写入',
      'tokens.empty': '本次会话还没有 Token 记录。',
      'tokens.context': '上下文占用',
      'tokens.contextValue': '{used} / {window}（{percent}%）',
      'tokens.contextUnknown': '暂无上下文数据',
      'tokens.moreModels': '另有 {count} 个模型',
      'tokens.stat.requests': '请求次数',
      'tokens.stat.cacheHit': '缓存命中',
      'tokens.stat.avg': '平均',
      'tokens.stat.turnsSteps': '轮 / 步',
      'tokens.stat.speed': '输出速度',
      'tokens.stat.llm': '模型用时',
      'tokens.stat.tool': '工具用时',
      'tokens.stat.ttft': '首 Token',
      'tokens.duration.compactMinutes': '{minutes}分{seconds}秒',
      'tokens.duration.compactSeconds': '{seconds}秒',
      'tokens.duration.compactMs': '{milliseconds}毫秒',
      'tokens.duration.compactHours': '{hours}时{minutes}分',
      'tokens.breakdown.system': '系统',
      'tokens.breakdown.tools': '工具',
      'tokens.breakdown.messages': '消息',
      'balance.total': '总额',
      'tokens.sessionUsage': '本会话用量',
      'tokens.requestsCount': '{count} 次请求',
      'account.planRolling': '5HW',
      'account.planWeekly': 'WEK',
      'account.planMonthly': 'MON',
    };

    /** English dictionary, checked against the Chinese key set. */
    const en = {
      'tab.title': 'Usage',
      'panel.title': 'Account usage',
      'guide.title': 'Account usage',
      'guide.description': 'Balance and usage grouped by day, week, month, quarter, or year',
      'shortcut.open': 'Open account usage',
      'shortcut.noSession': 'Select a session first',
      'refresh.aria': 'Refresh balance and usage',
      'loading': 'Reading…',
      'stats.loading': 'Reading usage…',
      'error': 'Could not read account information',
      'retry': 'Retry',
      'settings.aria': 'Settings',
      'settings.title': 'Settings',
      'settings.defaultDimension': 'Default range',
      'settings.card.session': 'Session usage',
      'settings.card.stats': 'Usage stats',
      'settings.card.account': 'Account balance',
      'settings.autoRefresh': 'Auto refresh',
      'settings.autoRefreshHint': 'Usage 2 min · Balance 5 min',
      'settings.showCost': 'Show spend',
      'settings.hideComposerStats': 'Hide composer stats',
      'settings.usageList': 'Usage detail list',
      'settings.reset': 'Reset to defaults',
      'settings.close': 'Close',
      'settings.allHidden': 'All three cards are hidden. Turn them back on in the display settings.',
      'account.title': 'Account balance',
      'account.signedOut': 'No DeepSeek API account is signed in',
      'account.signedOutHint': 'Sign in via Settings to see the balance',
      'balance.recharge': 'Balance',
      'provider.deepseekAccount': 'DeepSeek API',
      'provider.deepseekApiKey': 'DeepSeek API key',
      'balance.used': 'Used',
      'account.status.loading': 'Loading',
      'account.status.signedOut': 'Signed out',
      'account.bonusLabel': 'Bonus',
      'account.keyLabel': 'Key',
      'account.status.noBalance': 'No balance',
      'account.status.unsupported': 'Unsupported',
      'account.status.noKey': 'Key not configured',
      'account.status.auth': 'Key rejected',
      'account.status.credentials': 'Credential read failed',
      'account.status.timeout': 'Timed out',
      'account.status.invalid': 'Invalid response',
      'account.status.network': 'Unavailable now',
      'account.offAccountAll': 'This session runs on {provider}; it does not use your DeepSeek balance.',
      'stats.platformBadge': 'DeepSeek API',
      'stats.subscriptionScope': 'PLAN',
      'balance.bonus': 'Bonus credit',
      'balance.failed': 'Could not read the balance',
      'balance.empty': 'No balance data yet',
      'stats.title': 'Usage statistics',
      'stats.dim.day': 'Day',
      'stats.dim.week': 'Week',
      'stats.dim.month': 'Month',
      'stats.dim.quarter': 'Qtr',
      'stats.dim.year': 'Year',
      'stats.dim.all': 'ALL',
      'stats.summary.total': 'Total {total}',
      'stats.summary.requests': '{count} requests',
      'stats.summary.sources': '{count} sources',
      'stats.empty': 'No usage records yet',
      'stats.failed': 'Could not read usage records',
      'stats.localBadge': 'local',
      'stats.reason.no_account': 'no signed-in account',
      'stats.reason.auth_failed': 'account session rejected',
      'stats.reason.timeout': 'platform request timed out',
      'stats.reason.fetch_failed': 'platform request failed',
      'stats.reason.invalid_response': 'platform response was invalid',
      'stats.reason.network': 'network request failed',
      'stats.reason.local_unavailable': 'local records unavailable',
      'tokens.title': 'Session usage',
      'tokens.total': 'Total',
      'tokens.uncachedInput': 'Input (uncached)',
      'tokens.output': 'Output',
      'tokens.cacheRead': 'Cache read',
      'tokens.cacheWrite': 'Cache write',
      'tokens.empty': 'This session has no token records yet.',
      'tokens.context': 'Context usage',
      'tokens.contextValue': '{used} / {window} ({percent}%)',
      'tokens.contextUnknown': 'No context data yet',
      'tokens.moreModels': '{count} more models',
      'tokens.stat.requests': 'Requests',
      'tokens.stat.cacheHit': 'Cache',
      'tokens.stat.avg': 'Avg',
      'tokens.stat.turnsSteps': 'Turn/Step',
      'tokens.stat.speed': 'Speed',
      'tokens.stat.llm': 'Model',
      'tokens.stat.tool': 'Tools',
      'tokens.stat.ttft': 'TTFT',
      'tokens.duration.compactMinutes': '{minutes}m{seconds}s',
      'tokens.duration.compactSeconds': '{seconds}s',
      'tokens.duration.compactMs': '{milliseconds}ms',
      'tokens.duration.compactHours': '{hours}h{minutes}m',
      'tokens.breakdown.system': 'System',
      'tokens.breakdown.tools': 'Tools',
      'tokens.breakdown.messages': 'Messages',
      'balance.total': 'Total',
      'tokens.sessionUsage': 'Session usage',
      'tokens.requestsCount': '{count} requests',
      'account.planRolling': '5HW',
      'account.planWeekly': 'WEK',
      'account.planMonthly': 'MON',
    };

    // ----------------------------------------------------------------- styles --

    const CSS = [
      'html[data-account-usage-hide-stats] [data-composer-dock]{display:none!important}',
      'html[data-account-usage-hide-stats] [data-slot="conversation.composer.dock"]{display:none!important}',
      'html[data-account-usage-hide-stats] [data-composer-stat]{display:none!important}',
      '.aup-root{container-type:size;container-name:aup-panel;--aup-font-ui:-apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",Arial,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif;--aup-fs-text:13px;--aup-label-2:color-mix(in srgb,var(--dsw-alias-label-primary) 30%,var(--dsw-alias-label-secondary));position:relative;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;width:100%;height:100%;min-height:0;overflow:hidden;padding:0 8px 6px;color:var(--dsw-alias-label-primary);font-family:var(--aup-font-ui);font-size:var(--aup-fs-text);font-weight:500;line-height:20px}',
      '.aup-root *{box-sizing:border-box}',
      '.aup-head{flex:none;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;height:var(--aup-head-h,44px);margin:0 -8px 0;padding:0 8px;border-bottom:.5px solid var(--dsw-alias-border-l3)}',
      '.aup-head-greeting{min-width:0;text-align:center;color:var(--aup-label-2);font-size:var(--aup-fs-text);line-height:16px;font-weight:500;white-space:nowrap}',
      '.aup-icon-button{flex:none;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background-color .12s,color .12s}',
      '.aup-icon-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.aup-icon-button:disabled{opacity:.4;cursor:default}',
      '.aup-head-actions{display:inline-flex;align-items:center;gap:2px;flex:none}',
      '.aup-icon-button[data-active]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.aup-pop-backdrop{position:absolute;inset:0;z-index:20}',
      '.aup-pop{position:absolute;top:var(--aup-head-h,44px);left:4px;z-index:21;width:258px;max-width:calc(100% - 24px);max-height:calc(100% - 56px);overflow:auto;display:flex;flex-direction:column;gap:6px;padding:12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 10px 28px color-mix(in srgb,var(--dsw-alias-label-primary) 16%,transparent)}',
      '.aup-pop-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px}',
      '.aup-pop-title{font-size:var(--aup-fs-text);line-height:18px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.aup-pop-close{width:22px;height:22px;margin-right:-4px}',
      '.aup-pop-close-glyph{font-size:var(--aup-fs-text);line-height:1;font-weight:400}',
      '.aup-pop-block{display:flex;flex-direction:column;gap:6px;margin-top:2px}',
      '.aup-pop-label{font-size:var(--aup-fs-text);line-height:16px;font-weight:500;color:var(--aup-label-2)}',
      '.aup-pop-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:26px}',
      '.aup-pop-row>span{font-size:var(--aup-fs-text);line-height:16px;font-weight:500;color:var(--dsw-alias-label-primary);white-space:nowrap}',
      '.aup-pop-hint{font-size:var(--aup-fs-text);line-height:18px;color:var(--aup-label-2);white-space:nowrap;overflow:visible;text-overflow:clip}',
      '.aup-pop-sep{flex:none;height:1px;margin:2px 0;background:var(--dsw-alias-border-l2)}',
      '.aup-pop-foot{display:flex;justify-content:flex-end;padding-top:2px}',
      '.aup-pop-link{padding:0;border:none;background:transparent;color:var(--aup-label-2);font:inherit;font-size:var(--aup-fs-text);line-height:18px;cursor:pointer}',
      '.aup-pop-link:hover{color:var(--dsw-alias-label-primary)}',
      '.aup-dims-mini{display:flex;flex-wrap:wrap;background:var(--dsw-alias-bg-skeleton);padding:2px;gap:2px;border-radius:8px}',
      '.aup-dims-mini .aup-dim{flex:1 1 58px;height:22px;padding:0 4px;border-radius:6px;font-size:var(--aup-fs-text);line-height:16px}',
      '.aup-toggle{position:relative;flex:none;width:34px;height:20px;padding:0;border:none;border-radius:999px;background:var(--dsw-alias-bg-skeleton);cursor:pointer;transition:background-color .15s}',
      '.aup-toggle[data-on]{background:var(--dsw-alias-brand-primary)}',
      '.aup-toggle-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 2px color-mix(in srgb,var(--dsw-alias-label-primary) 20%,transparent);transition:transform .15s}',
      '.aup-toggle[data-on] .aup-toggle-knob{transform:translateX(14px)}',
      '.aup-toggle:focus-visible,.aup-pop-link:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.aup-empty{padding:12px;color:var(--aup-label-2);font-size:var(--aup-fs-text);line-height:18px;font-weight:500;text-align:center}',      '.aup-icon-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.aup-spin{animation:aup-spin 1s linear infinite}',
      // Motion is decoration only: honour the preference everywhere.
      '@media (prefers-reduced-motion:reduce){.aup-toggle,.aup-toggle-knob,.aup-icon-button,.aup-dim,.aup-series-row,.aup-pop-link{transition:none}.aup-skeleton,.aup-spin{animation:none}}',
      '@keyframes aup-spin{to{transform:rotate(360deg)}}',
      '.aup-cards{flex:1 1 auto;min-height:0;width:100%;display:flex;flex-direction:column;justify-content:flex-start;gap:6px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;-ms-overflow-style:none}',
      '.aup-cards>.aup-card-session-fixed{flex:1 1 auto;min-height:auto}',
      '.aup-cards::-webkit-scrollbar{width:0;height:0;display:none}',
      '.aup-card{flex:0 0 auto;min-height:auto;display:flex;flex-direction:column;gap:10px;padding:12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);overflow:visible}',
      '.aup-card-session{justify-content:flex-start}',
      '.aup-card-stats{justify-content:flex-start}',
      '.aup-stats-body{flex:0 0 auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(52px,max-content) minmax(0,max-content);align-content:start;column-gap:12px;row-gap:4px}',
      '.aup-srcs,.aup-series{display:contents}',
      '.aup-card-stats .aup-src+.aup-src{margin-top:2px}',
      // The provider rows and the date rows are one table, so a hairline marks where
      // the second group starts instead of a gap that would break the column grid.
      '.aup-card-stats .aup-series>.aup-series-row:first-child{position:relative;margin-top:3px}',
      '.aup-card-stats .aup-series>.aup-series-row:first-child::before{content:"";position:absolute;left:0;right:0;top:-2px;border-top:.5px solid var(--dsw-alias-border-l2);pointer-events:none}',
      
      '.aup-src{display:grid;grid-template-columns:subgrid;grid-column:1/-1;align-items:center;min-height:21px;min-width:0;font-size:var(--aup-fs-text);line-height:18px;font-variant-numeric:tabular-nums}',
      '.aup-src-label{min-width:0;color:var(--dsw-alias-label-primary);font-weight:500;white-space:nowrap}',
      '.aup-src-tokens{justify-self:end;color:var(--dsw-alias-label-primary);font-weight:500;white-space:nowrap}',
      '.aup-src-side{justify-self:end;color:var(--aup-label-2);white-space:nowrap;text-align:right}',
      '.aup-stats-head{flex:none;display:flex;flex-direction:column;gap:6px}',
      '.aup-card-account{flex:0 0 auto;min-height:auto;justify-content:flex-start}',
      '.aup-account-body{flex:0 0 auto;display:flex;flex-direction:column;justify-content:flex-start;gap:6px}',
      // Mixed sessions: one aligned row per source, using the statistics table rhythm.
      // Every source is visible at once, so there is nothing to switch and no reserved blank.
      '.aup-acct-srcs{display:grid;grid-template-columns:minmax(0,max-content) minmax(0,1fr);align-content:start;column-gap:6px;row-gap:4px}',
      '.aup-acct-src,.aup-acct-row{display:grid;grid-template-columns:subgrid;grid-column:1/-1;align-items:center;min-height:21px;min-width:0;line-height:18px;font-variant-numeric:tabular-nums}',
      '.aup-acct-src-label{min-width:0;color:var(--dsw-alias-label-primary);font-weight:500;letter-spacing:-0.1px;overflow-wrap:anywhere}',
      '.aup-acct-src-value{min-width:0;display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;column-gap:8px;text-align:right}',
      '.aup-acct-src-amount{color:var(--dsw-alias-label-primary);font-weight:600}',
      '.aup-acct-src-amount.aup-minor{font-weight:500}',
      '.aup-acct-src-amount.aup-muted{color:var(--aup-label-2);font-weight:500}',
      // The source the session is using right now gets a quiet tint: no dot, no pill,
      // no layout change (a background cannot shift the shared column edges).
      '.aup-acct-src[data-current]{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent);border-radius:6px}',
      '.aup-acct-src[data-current] .aup-acct-src-label{font-weight:600}',
      '.aup-acct-pairs{display:inline-flex;flex-wrap:wrap;justify-content:flex-end;gap:2px 2px;letter-spacing:-0.4px}',
      '.aup-acct-pair{display:inline-flex;align-items:baseline;gap:2px;white-space:nowrap}',
      '.aup-acct-pair-label{color:var(--aup-label-2);font-weight:500}',
      '.aup-acct-label{min-width:0;color:var(--aup-label-2);overflow-wrap:anywhere}',
      '.aup-card-head{position:relative;display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;flex:none}',
      '.aup-card-head-main{display:inline-flex;align-items:center;gap:6px;min-width:0;justify-content:center}',
      '.aup-card-head-extra{position:absolute;right:0;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;max-width:45%}',
      '.aup-divider{display:block;height:1px;flex:none;margin:0;background:var(--dsw-alias-border-l2)}',
      '.aup-card-icon{display:inline-flex;flex:none;color:var(--dsw-alias-label-secondary)}',
      '.aup-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}',
      '.aup-skeleton{display:block;height:10px;border-radius:6px;background:linear-gradient(90deg,color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent) 25%,color-mix(in srgb,var(--dsw-alias-label-primary) 11%,transparent) 37%,color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent) 63%);background-size:400% 100%;animation:aup-shimmer 1.4s ease-in-out infinite}',
      '@keyframes aup-shimmer{0%{background-position:100% 0}100%{background-position:0 0}}',
      '.aup-skeleton-row{pointer-events:none}',
      '.aup-skeleton-label{width:38px}',
      '.aup-skeleton-value{width:44px;justify-self:end}',
      '.aup-badge{flex:none;padding:0 6px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;color:var(--aup-label-2);font-size:var(--aup-fs-text);line-height:18px;font-weight:500;white-space:nowrap}',
      '.aup-card-title{margin:0;font-size:var(--aup-fs-text);font-weight:500;line-height:18px;color:var(--aup-label-2);white-space:nowrap}',

      '.aup-balance{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:4px 16px;margin:0;padding:0}',
      '.aup-balance-item{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.aup-balance-label{margin:0;font-size:var(--aup-fs-text);font-weight:500;color:var(--aup-label-2);white-space:normal;overflow-wrap:anywhere}',
      '.aup-balance-value{margin:0;font-size:var(--aup-fs-text);font-weight:500;line-height:22px;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.aup-balance-value.aup-minor{font-size:var(--aup-fs-text);line-height:22px;font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.aup-hint{margin:0;font-size:var(--aup-fs-text);line-height:18px;font-weight:500;color:var(--aup-label-2);white-space:normal;overflow:visible}',
      '.aup-error{margin:0;font-size:var(--aup-fs-text);line-height:18px;color:var(--dsw-alias-state-error-primary);white-space:normal;overflow:visible}',
      '.aup-card-session-fixed{flex:1 1 auto;min-height:auto}',
      '.aup-card-session .aup-session-body{flex:1 1 auto;min-height:auto;display:flex;flex-direction:column;gap:6px;justify-content:space-evenly}',
      '.aup-card-session .aup-session-grid{flex:0 0 auto;display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;align-content:space-evenly;justify-items:stretch;margin:0;padding:0;width:100%}',
      '.aup-card-session .aup-session-cell{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0;text-align:left}',
      '.aup-card-session .aup-session-cell:nth-child(even){align-items:flex-end;text-align:right}',
      '.aup-models{display:flex;flex-direction:column;gap:0;flex:none;min-height:0}',
      '.aup-model-row{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:2px 10px;min-width:0;font-size:var(--aup-fs-text);line-height:17px;font-variant-numeric:tabular-nums}',
      '.aup-model-name{flex:1 1 auto;min-width:0;font-size:var(--aup-fs-text);line-height:18px;white-space:normal;overflow-wrap:anywhere;color:var(--aup-label-2)}',
                  '.aup-model-tokens{flex:none;margin-left:auto;font-weight:500;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}',
      '.aup-model-more{font-size:var(--aup-fs-text);line-height:16px;color:var(--aup-label-2)}',
      '.aup-token-dot{flex:none;width:6px;height:6px;border-radius:2px}',
      '.aup-stat-list{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:2px 20px}',
      '.aup-stat-list::before{content:"";position:absolute;top:1px;bottom:1px;left:50%;width:.5px;background:var(--dsw-alias-border-l2);pointer-events:none}',
      '.aup-session-sep{flex:none;height:1px;background:var(--dsw-alias-border-l2)}',
      '.aup-stat-row{display:grid;grid-template-columns:max-content minmax(0,1fr);align-items:baseline;gap:4px;min-width:0;font-size:var(--aup-fs-text);line-height:18px}',
      '.aup-stat-label{min-width:0;color:var(--aup-label-2);white-space:nowrap;line-height:18px}',
      '.aup-stat-value{min-width:0;justify-self:stretch;text-align:right;color:var(--dsw-alias-label-primary);font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:var(--aup-fs-text);line-height:18px}',
      '.aup-stat-value.aup-stat-value-s{letter-spacing:-.01em}',
      '.aup-stat-value.aup-stat-value-xs{letter-spacing:-.02em}',
                  '.aup-context-breakdown{display:flex;flex-direction:column;gap:4px;margin-top:2px}',
      '.aup-context-used{display:flex;height:100%;gap:1px;border-radius:inherit;overflow:hidden}',
      '.aup-context-seg{flex:1 1 0;min-width:2px;height:100%}',
      '.aup-context-legend,.aup-stats-summary{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:baseline;column-gap:12px;row-gap:2px;font-size:var(--aup-fs-text);line-height:18px;font-weight:500;color:var(--aup-label-2);font-variant-numeric:tabular-nums}',
      '.aup-context-legend>span:nth-child(1),.aup-stats-summary>span:nth-child(1){justify-self:start;text-align:left}',
      '.aup-context-legend>span:nth-child(2),.aup-stats-summary>span:nth-child(2){justify-self:center;text-align:center}',
      '.aup-context-legend>span:nth-child(3),.aup-stats-summary>span:nth-child(3){justify-self:end;text-align:right}',
      '.aup-card-account-provider{flex:0 0 auto;min-height:auto;justify-content:flex-start}',
      '.aup-card-account-provider .aup-balance{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 12px;align-content:center}',
      '.aup-card-account-provider .aup-balance-value{font-size:var(--aup-fs-text);line-height:22px}',
      '.aup-card-account-provider .aup-balance-value.aup-minor{font-size:var(--aup-fs-text);line-height:22px}',
      '.aup-value-long{letter-spacing:-.02em}',
      '.aup-value-longer{letter-spacing:-.04em}',
      '.aup-card-session .aup-session-label{display:flex;align-items:center;gap:5px;margin:0;font-size:var(--aup-fs-text);line-height:16px;font-weight:500;color:var(--aup-label-2);white-space:nowrap}',
      '.aup-card-session .aup-session-value{margin:0;font-size:var(--aup-fs-text);line-height:18px;font-weight:500;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.aup-card-session .aup-bar{height:8px}',
      '.aup-session-total{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex:none;width:100%}',
      '.aup-session-total-value{font-size:var(--aup-fs-text);line-height:26px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);white-space:nowrap}',
      '.aup-session-total-label{font-size:var(--aup-fs-text);line-height:16px;font-weight:500;color:var(--aup-label-2);white-space:nowrap}',
      '.aup-compose{display:flex;height:8px;flex:none;gap:1px;border-radius:999px;overflow:hidden;background:var(--dsw-alias-bg-skeleton)}',
      '.aup-compose-seg{flex:1 1 0;min-width:2px;height:100%}',
      '.aup-context{display:flex;flex-direction:column;gap:4px;margin-top:2px}',
      '.aup-context-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 12px;font-variant-numeric:tabular-nums;font-size:var(--aup-fs-text);line-height:18px;font-weight:500;color:var(--aup-label-2);min-width:0}',
      '.aup-context-head>span{min-width:0;white-space:nowrap}',
      '.aup-context-figures{flex:none;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);text-align:right}',
      '.aup-bar{height:4px;border-radius:999px;background:var(--dsw-alias-bg-skeleton);overflow:hidden}',
      '.aup-bar-fill{display:block;height:100%;border-radius:inherit;background:var(--dsw-alias-brand-primary)}',
      '.aup-dims{display:flex;gap:2px;flex-wrap:nowrap;padding:2px;border-radius:9px;background:var(--dsw-alias-bg-skeleton)}',
      '.aup-dim{flex:1;min-width:0;height:22px;padding:0 4px;border:.5px solid transparent;border-radius:7px;background:transparent;color:var(--aup-label-2);font-family:inherit;font-size:var(--aup-fs-text);font-weight:500;line-height:18px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;transition:background-color .12s,color .12s}',
      '.aup-dim:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.aup-dim[data-active]{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l3);box-shadow:0 1px 2px color-mix(in srgb,var(--dsw-alias-label-primary) 9%,transparent);color:var(--dsw-alias-label-primary);font-weight:500}',
      '.aup-dim:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.aup-stats-summary{grid-column:1/-1;margin-top:2px}',
      '.aup-stats-summary>span{min-width:0;white-space:nowrap}',
      '.aup-stats-total{font-size:var(--aup-fs-text);line-height:18px;font-weight:600;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;text-align:right}',
      
      '.aup-series-slot{min-height:21px;pointer-events:none}',,
      '.aup-card-session .aup-session-body>.aup-context{margin-top:0}',
      '.aup-card-stats .aup-series-row{flex:0 0 auto;min-height:21px;border-radius:8px;transition:background-color .12s}',
      '.aup-card-stats .aup-series-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.aup-card-stats .aup-series-row[data-current]{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)}',
      '.aup-card-stats .aup-series-row[data-zero]{opacity:.62}',
      '.aup-card-stats .aup-series-row[data-zero]:hover{opacity:.8}',
      '.aup-card-stats .aup-series-row[data-current]:hover{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent)}',
      '.aup-series-row{display:grid;grid-template-columns:subgrid;grid-column:1/-1;align-items:center;font-size:var(--aup-fs-text);line-height:18px}',
      '.aup-series-label{color:var(--aup-label-2);white-space:nowrap;font-variant-numeric:tabular-nums}',
      '.aup-series-tokens{justify-self:end;white-space:nowrap}',
      '.aup-series-cost{white-space:nowrap}',
      '.aup-series-tokens{font-size:var(--aup-fs-text);line-height:16px;font-variant-numeric:tabular-nums}',
      '.aup-series-cost{justify-self:end;font-size:var(--aup-fs-text);line-height:16px;color:var(--aup-label-2);font-variant-numeric:tabular-nums}',
      '.aup-series-row[data-current] .aup-series-label,.aup-series-row[data-current] .aup-series-tokens,.aup-series-row[data-current] .aup-series-cost{color:var(--dsw-alias-label-primary);font-weight:500}',
      '.aup-tab-icon{flex:none;width:14px;height:14px;vertical-align:-2px;color:var(--dsw-alias-label-secondary)}',
      // ---- one shared type scale: every Chinese text is 13px, only numbers vary by role ----
      '.aup-card{gap:4px;padding:8px}',
      '.aup-card-title{font-size:var(--aup-fs-text);line-height:16px;font-weight:500}',
      '.aup-card-icon{width:15px;height:15px}',
      '.aup-card-icon svg{width:100%;height:100%}',
      '.aup-dim{height:22px;font-size:var(--aup-fs-text);line-height:16px}',
      '.aup-session-total-value{font-size:var(--aup-fs-text);line-height:26px}',
      '.aup-session-total-label{font-size:var(--aup-fs-text);line-height:16px}',
      '.aup-session-label{font-size:var(--aup-fs-text);line-height:16px}',
      '.aup-session-value{font-size:var(--aup-fs-text);line-height:16px;font-weight:500}',
      '.aup-card-session .aup-session-grid{gap:6px 12px}',
      '.aup-compose{height:6px}',
      '.aup-bar{height:6px}',
      '.aup-context{gap:4px}',
      '.aup-context-head{font-size:var(--aup-fs-text);line-height:16px}',
      '.aup-card-stats .aup-series-row{font-size:var(--aup-fs-text);line-height:16px}',
      '.aup-card-stats .aup-series-label,.aup-card-stats .aup-series-tokens{font-size:var(--aup-fs-text);line-height:16px}',
      '.aup-card-stats .aup-series-cost{font-size:var(--aup-fs-text);line-height:16px}',
      '.aup-card-account .aup-balance-item{flex-direction:row;align-items:baseline;justify-content:space-between;gap:8px;min-width:0}',
      '.aup-card-account .aup-balance{flex:0 0 auto;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:4px 16px;align-content:start;padding:2px 0}',
      '.aup-card-account .aup-balance-value{font-size:var(--aup-fs-text);line-height:22px;letter-spacing:0}',
      '.aup-card-account .aup-balance-value.aup-minor{font-size:var(--aup-fs-text);line-height:22px;font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.aup-card-account .aup-balance-value.aup-value-long{font-size:var(--aup-fs-text)}',
      '.aup-card-account .aup-balance-value.aup-value-longer{font-size:var(--aup-fs-text)}',
      '.aup-card-account .aup-balance-label{font-size:var(--aup-fs-text);line-height:16px;font-weight:500}',
      '.aup-hint{font-size:var(--aup-fs-text);line-height:16px}',
      // ---- narrow panes: one more compaction step so balance rows stay on one line ----
      // The documented comfort width is 340px (where even three `100%` windows fit); below it,
      // typical values must still read as a single line, without scaling text.
      '@container aup-panel (max-width:330px){.aup-acct-srcs{column-gap:4px}.aup-acct-pair{gap:1px}.aup-acct-pairs{gap:1px 0;letter-spacing:-0.7px;font-variant-numeric:proportional-nums}.aup-context-legend,.aup-stats-summary{column-gap:6px}.aup-context-legend>span,.aup-stats-summary>span{white-space:nowrap}}',
      // ---- ultra-narrow panes (<=310px): the last spacing step so even three `100%`
      // windows stay on one line; still 13px text, only tighter rhythm. ----
      '@container aup-panel (max-width:320px){.aup-card{padding-left:5px;padding-right:5px}.aup-acct-srcs{column-gap:2px}.aup-acct-src-label{letter-spacing:-0.4px}.aup-acct-pair{gap:2px}.aup-acct-pairs{gap:0 1px;letter-spacing:-0.95px}.aup-acct-pairs-tight{gap:0 1px;letter-spacing:-1.05px}}',
      // ---- content shedding on short windows: pure media queries, no measurement ----
      // Measured ladder (test/layout-check.mjs --tiers): each step keeps the whole
      // panel inside its own height so the card column never has to scroll. These are
      // CONTAINER queries on the panel root, not media queries on the window: the pane
      // is shorter than the window (right-sidebar tab strip + header) and viewport
      // breakpoints fired ~90px too late, which is why the pane still scrolled.
      // They must stay LAST and carry !important: a query adds no specificity.
      '@container aup-panel (max-height:850px){.aup-compose{display:none!important}}',
      '@container aup-panel (max-height:838px){.aup-card-session .aup-models,.aup-card-session .aup-sep-models{display:none!important}}',
      '@container aup-panel (max-height:771px){.aup-card-session .aup-stat-list,.aup-card-session .aup-sep-stats{display:none!important}}',
      '@container aup-panel (max-height:680px){.aup-context,.aup-card-session .aup-sep-context{display:none!important}}',
      '@container aup-panel (max-height:615px){.aup-card-session .aup-session-grid{display:none!important}}',
      // Measured with `layout-check --tiers N`: each source beyond three adds one
      // statistics row and one balance row (52px), and the fourth model adds the
      // "more models" line (16px). Budget by source count only - never by measured
      // content - so no observer/state feedback can occur.
      ...Array.from({ length: 13 }, (_, index) => {
        const count = index + 4;
        const extra = 16 + (count - 3) * 52;
        return [[850, ['.aup-compose']], [838, ['.aup-card-session .aup-models', '.aup-card-session .aup-sep-models']], [771, ['.aup-card-session .aup-stat-list', '.aup-card-session .aup-sep-stats']], [680, ['.aup-context', '.aup-card-session .aup-sep-context']], [615, ['.aup-card-session .aup-session-grid']]]
          .map(([height, selectors]) => '@container aup-panel (max-height:' + (height + extra) + 'px){' + selectors.map((selector) => '.aup-cards[data-source-count="' + count + '"] ' + selector).join(',') + '{display:none!important}}').join('');
      }),
    ].join('\n');

    // --------------------------------------------------------------- glyphs --

    /** Wallet glyph used by the panel header, the guide card, and the foot action. */
    function WalletGlyph({ size = 16, className }) {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          'aria-hidden': true,
          focusable: 'false',
          className
        },
        h('rect', {
          x: 2.25,
          y: 6.25,
          width: 19.5,
          height: 13.5,
          rx: 3.4,
          fill: 'currentColor',
          opacity: 0.14
        }),
        h('path', {
          d: 'M5.6 6.4V5.5c0-.9.72-1.6 1.6-1.6h8.2',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round'
        }),
        h('rect', {
          x: 2.25,
          y: 6.25,
          width: 19.5,
          height: 13.5,
          rx: 3.4,
          stroke: 'currentColor',
          strokeWidth: 1.5
        }),
        h('circle', {
          cx: 16.9,
          cy: 13,
          r: 2.15,
          stroke: 'currentColor',
          strokeWidth: 1.5
        })
      );
    }

    /** Small chat glyph for the session card header. */
    function ChatGlyph({ size = 14 }) {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: size, height: size, fill: 'none', 'aria-hidden': true, focusable: 'false' },
        h('path', {
          d: 'M2.6 3.4h10.8a1 1 0 0 1 1 1v6.2a1 1 0 0 1-1 1H6.4L3.6 13.4V11.6h-1a1 1 0 0 1-1-1V4.4a1 1 0 0 1 1-1Z',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinejoin: 'round'
        }),
        h('path', { d: 'M4.6 6.2h6.8M4.6 8.6h4.2', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' })
      );
    }

    /** Small bar-chart glyph for the usage statistics header. */
    function ChartGlyph({ size = 14 }) {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: size, height: size, fill: 'none', 'aria-hidden': true, focusable: 'false' },
        h('path', { d: 'M2.2 13.4h11.6', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
        h('rect', { x: 3.4, y: 8.2, width: 2.2, height: 4, rx: 1, fill: 'currentColor' }),
        h('rect', { x: 6.9, y: 5.4, width: 2.2, height: 6.8, rx: 1, fill: 'currentColor' }),
        h('rect', { x: 10.4, y: 2.8, width: 2.2, height: 9.4, rx: 1, fill: 'currentColor', opacity: 0.55 })
      );
    }

    /** Shared card header: glyph + title (+ optional trailing content). */
    function CardHead({ icon, title, extra }) {
      return h(
        'div',
        { className: 'aup-card-head' },
        h(
          'span',
          { className: 'aup-card-head-main' },
          icon === undefined ? null : h('span', { className: 'aup-card-icon' }, h(icon, { size: 14 })),
          h('h3', { className: 'aup-card-title' }, title)
        ),
        extra === undefined ? null : h('span', { className: 'aup-card-head-extra' }, extra)
      );
    }

    /** Circular refresh glyph; the header button spins it while a read is running. */
    function RefreshGlyph({ size = 15, className }) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          className,
          fill: 'none',
          'aria-hidden': true,
          focusable: 'false'
        },
        h('path', {
          d: 'M13.4 6.1A5.6 5.6 0 1 0 14 8.3',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round'
        }),
        h('path', {
          d: 'M13.7 2.6v3.7H10',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round'
        })
      );
    }

    /** Gear glyph for the display settings trigger. */
    function SettingsGlyph({ size = 15 }) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          fill: 'none',
          'aria-hidden': true,
          focusable: 'false'
        },
        h('circle', { cx: 8, cy: 8, r: 2.1, stroke: 'currentColor', strokeWidth: 1.4 }),
        h('path', {
          d: 'M8 1.6v1.5M8 12.9v1.5M1.6 8h1.5M12.9 8h1.5M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round'
        })
      );
    }

    /** One labelled switch used by the display settings panel. */
    function Toggle({ checked, label, onChange }) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          className: 'aup-toggle',
          'data-on': checked === true ? true : undefined,
          'aria-checked': checked === true,
          'aria-label': label,
          onClick: () => onChange(checked !== true)
        },
        h('span', { className: 'aup-toggle-knob' })
      );
    }

    /** Display settings popover: default range, visible cards, spend, auto refresh. */
    function SettingsPanel({ settings, onChange, onReset, onClose, t }) {
      const dimensionControl = h(
        'div',
        { className: 'aup-dims aup-dims-mini' },
        DIMENSIONS.map((entry) =>
          h(
            'button',
            {
              key: entry.id,
              type: 'button',
              className: 'aup-dim',
              'data-active': entry.id === settings.dimension ? true : undefined,
              'aria-pressed': entry.id === settings.dimension,
              onClick: () => onChange({ dimension: entry.id })
            },
            t(entry.key)
          )
        )
      );
      const switchRow = (key, labelKey, checked, patch) =>
        h(
          'div',
          { key, className: 'aup-pop-row' },
          h('span', null, t(labelKey)),
          h(Toggle, { checked: checked === true, label: t(labelKey), onChange: (value) => onChange(patch(value)) })
        );
      return h(
        'div',
        { className: 'aup-pop', role: 'dialog', 'aria-label': t('settings.title') },
        h(
          'div',
          { className: 'aup-pop-head' },
          h('span', { className: 'aup-pop-title' }, t('settings.title')),
          h(
            'button',
            { type: 'button', className: 'aup-icon-button aup-pop-close', 'aria-label': t('settings.close'), autoFocus: true, onClick: onClose },
            h('span', { className: 'aup-pop-close-glyph', 'aria-hidden': true }, '×')
          )
        ),
        h('div', { className: 'aup-pop-block' }, h('span', { className: 'aup-pop-label' }, t('settings.defaultDimension')), dimensionControl),
        h('div', { className: 'aup-pop-sep' }),
        switchRow('session', 'settings.card.session', settings.cards.session, (value) => ({ cards: { session: value } })),
        switchRow('stats', 'settings.card.stats', settings.cards.stats, (value) => ({ cards: { stats: value } })),
        switchRow('account', 'settings.card.account', settings.cards.account, (value) => ({ cards: { account: value } })),
        switchRow('showCost', 'settings.showCost', settings.showCost, (value) => ({ showCost: value })),
        switchRow('hideComposerStats', 'settings.hideComposerStats', settings.hideComposerStats, (value) => ({ hideComposerStats: value })),
        switchRow('usageList', 'settings.usageList', settings.usageList, (value) => ({ usageList: value })),
        h(
          'div',
          { className: 'aup-pop-row' },
          h('span', null, t('settings.autoRefresh')),
          h(Toggle, {
            checked: settings.autoRefresh === true,
            label: t('settings.autoRefresh'),
            onChange: (value) => onChange({ autoRefresh: value })
          })
        ),
        h('div', { className: 'aup-pop-hint' }, t('settings.autoRefreshHint')),
        h('div', { className: 'aup-pop-sep' }),
        h(
          'div',
          { className: 'aup-pop-foot' },
          h('button', { type: 'button', className: 'aup-pop-link', onClick: onReset }, t('settings.reset'))
        )
      );
    }

    // ------------------------------------------------------------- providers --

    /** Human labels for the model providers a session can record. */
    /** One color per token bucket, shared by the composition bar and the detail labels. */
    const TOKEN_COLORS = {
      input: 'var(--dsw-static-blue-450, #4d93f8)',
      output: 'var(--dsw-static-violet-400, #a78bfa)',
      cacheRead: 'var(--dsw-static-amber-500, #f59e0b)',
      cacheWrite: 'var(--dsw-static-neutral-bluish-400, #adb2b8)'
    };

    /** Proper names for non-DeepSeek providers; DeepSeek route names are localized. */
    const PROVIDER_NAMES = {
      openrouter: 'OpenRouter',
      anthropic: 'Anthropic',
      openai: 'OpenAI',
      google: 'Google',
      xai: 'xAI',
      groq: 'Groq',
      mistral: 'Mistral',
      opencode: 'OpenCode',
      'opencode-go': 'OpenCode Go',
      'opencode-zen': 'OpenCode Zen',
      ollama: 'Ollama',
      azure: 'Azure',
      bedrock: 'AWS Bedrock',
      vertex: 'Vertex AI'
    };

    /** Shortcut id shared by the registered command and the guide card's key hint. */
    const SHORTCUT_ID = 'accountUsage.open';

    /** Background warm-up order: widest window first, so later switches hit the cache. */
    const WARM_ORDER = ['year', 'quarter', 'month', 'week', 'day', 'all'];

    /** Maximum periods rendered in the detail list per dimension (older ones are dropped). */
    const DIMENSION_ROW_CAP = { day: 4, week: 4, month: 4, quarter: 3, year: 3, all: 4 };

    /** ALL tab: the window it opens with (three years, same as the year tab). */
    const ALL_WINDOW_MONTHS = 36;
    /** ALL tab: never look further back than six years, so one query stays sane. */
    const ALL_MAX_MONTHS = 72;
    /** Where the discovered first month of the account lives. */
    const ALL_START_STORAGE_KEY = 'dsh.account-usage.all-start.v1';

    /** Slots the detail list always occupies: identical height in every dimension. */
    const SERIES_ROW_SLOTS = 4;

    /** Minimum usable panel width: below this the no-wrap rows would collide. */
    // The compact layout holds down to ~300px (host's own narrowest); 340 stays the
    // comfort width where even three `100%` windows fit on one line.
    const PANEL_MIN_WIDTH = 300;

    /** Widen the sidebar only when it is below the readable minimum; otherwise leave it alone. */
    function widenIfNeeded() {
      if (typeof document === 'undefined') return;
      const pane = document.querySelector('.aup-root');
      const width = pane === null || pane === undefined ? 0 : pane.getBoundingClientRect().width;
      // Without a measurement we must not guess: never resize on a blind guess.
      if (!Number.isFinite(width) || width <= 0) return;
      if (width >= PANEL_MIN_WIDTH - 2) return;
      resizeRightbarTo(PANEL_MIN_WIDTH);
    }

    /** Provider id that bills the signed-in DeepSeek account balance. */
    const ACCOUNT_PROVIDER = 'deepseek-account';

    function providerLabel(provider, t) {
      if (provider === 'deepseek-account') return t('provider.deepseekAccount');
      if (provider === 'deepseek' || (typeof provider === 'string' && provider.startsWith('deepseek-api'))) return t('provider.deepseekApiKey');
      return PROVIDER_NAMES[provider] === undefined ? provider : PROVIDER_NAMES[provider];
    }

    /** Label for one account source (the DeepSeek wallet or a third-party provider). */
    function sourceLabel(source, t) {
      if (source === null || source === undefined) return '';
      if (source.isAccount === true) return t('stats.platformBadge');
      const label = providerLabel(source.id, t);
      return label === source.id && typeof source.fallback === 'string' && source.fallback !== '' ? source.fallback : label;
    }

    /** "Provider - model" label for one model row (no separate provider caption). */
    function modelRowLabel(item, t) {
      const model = shortModelName(item.model);
      const provider = typeof item.provider === 'string' && item.provider !== '' ? providerLabel(item.provider, t) : '';
      return provider === '' ? model : provider + ' - ' + model;
    }

    /** Size class for the merged "Provider - model" label. */
    function modelRowLabelClass(text) {
      if (typeof text !== 'string') return '';
      return text.length >= 34 ? ' aup-model-name-longer' : text.length >= 27 ? ' aup-model-name-long' : '';
    }

    /** Short display name for a model id: the last path segment without routing prefixes. */
    function shortModelName(model) {
      if (typeof model !== 'string' || model === '') return '—';
      const index = model.lastIndexOf('/');
      const tail = index >= 0 ? model.slice(index + 1) : model;
      return tail.replace(/^~+/, '');
    }

    /** Size class for stat values: long numbers shrink a step instead of overlapping. */
    function statValueClass(text) {
      if (typeof text !== 'string') return '';
      const length = text.length;
      return length >= 12 ? ' aup-stat-value-xs' : length >= 9 ? ' aup-stat-value-s' : '';
    }

    /** Size class for amounts that would otherwise overflow their card. */
    function valueClass(text) {
      if (typeof text !== 'string') return '';
      return text.length >= 15 ? ' aup-value-longer' : text.length >= 11 ? ' aup-value-long' : '';
    }

    function isAccountProvider(provider) {
      return provider === ACCOUNT_PROVIDER;
    }

    // ------------------------------------------------------------- formatting --

    /** Whether a Host balance string is a plain decimal number. */
    function isNumericText(raw) {
      return typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw.trim()));
    }

    /** Reused Intl formatters; constructing one per amount is measurable in long lists. */
    const moneyFormatters = new Map();

    /** Localized currency text for one already-settled amount. */
    /** Symbol cache: one formatter per currency+locale instead of one per row. */
    const currencySymbols = new Map();

    /** Symbol for one currency, used when the amount is printed symbol-last. */
    function currencySymbol(currency, locale) {
      const key = String(currency) + '|' + String(locale === undefined ? '' : locale);
      if (currencySymbols.has(key)) return currencySymbols.get(key);
      try {
        const parts = new Intl.NumberFormat(locale === undefined ? undefined : locale, {
          style: 'currency',
          currency,
          currencyDisplay: 'narrowSymbol'
        }).formatToParts(0);
        const found = parts.find((part) => part.type === 'currency');
        if (found !== undefined) {
          currencySymbols.set(key, found.value);
          return found.value;
        }
      } catch (error) {
        /* fall through to the static table */
      }
      currencySymbols.set(key, '');
      const fallback = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '';
      currencySymbols.set(key, fallback);
      return fallback;
    }

    function moneyText(amount, currency, locale) {
      const key = String(currency === undefined ? '' : currency) + '|' + String(locale === undefined ? '' : locale);
      let formatter = moneyFormatters.get(key);
      if (formatter === undefined) {
        try {
          formatter = new Intl.NumberFormat(locale === undefined ? undefined : locale, {
            style: 'currency',
            currency,
            currencyDisplay: 'narrowSymbol',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          });
        } catch (error) {
          formatter = null;
        }
        moneyFormatters.set(key, formatter);
      }
      if (formatter !== null) {
        // Every currency puts its symbol AFTER the figure (user 2026-11-08):
        // `23.28¥`, `9.50$`, `12.00€` - one rule for all money in the panel,
        // so mixed-provider rows read consistently.
        const parts = formatter.formatToParts(amount);
        const body = parts
          .filter((part) => part.type !== 'currency')
          .map((part) => part.value)
          .join('')
          .trim();
        return body + currencySymbol(currency, locale);
      }
      return amount.toFixed(2) + currencySymbol(currency, locale);
    }

    /**
     * Format one raw Host balance string the way the account settings page
     * does: two decimals and digit grouping, positive amounts truncated to
     * cents, positive sub-cent amounts shown as "<0.01", and negative amounts
     * rounded with a minimum displayed magnitude of 0.01.
     */
    function formatMoney(raw, currency, locale) {
      if (!isNumericText(raw)) return raw === undefined || raw === null ? '—' : String(raw);
      const amount = Number(raw);
      if (amount > 0) {
        const truncated = Math.floor(amount * 100) / 100;
        if (truncated === 0) return '<' + moneyText(0.01, currency, locale);
        return moneyText(truncated, currency, locale);
      }
      if (amount < 0) {
        let rounded = Math.round(amount * 100) / 100;
        if (rounded === 0) rounded = -0.01;
        return moneyText(rounded, currency, locale);
      }
      return moneyText(0, currency, locale);
    }

    /** Spend label: platform amounts as recorded, or list-price estimates with an `≈` mark. */
    function formatCost(value, currency, locale, estimate) {
      const amount = Number.isFinite(value) && value > 0 ? formatMoney(String(value), currency, locale) : moneyText(0, currency, locale);
      return estimate === true ? '≈' + amount : amount;
    }

    /** Compact token count: exact below 1K, then K / M / B / T, promoting at 1000 of a unit. */
    const TOKEN_TIERS = [
      { div: 1000000000000, unit: 'T' },
      { div: 1000000000, unit: 'B' },
      { div: 1000000, unit: 'M' },
      { div: 1000, unit: 'K' }
    ];

    function formatTokens(value) {
      if (!Number.isFinite(value)) return '—';
      const count = Math.max(0, Math.round(value));
      if (count < 1000) return String(count);
      // Cap compact unit counts at two decimal places (trailing zeros trimmed by String()).
      const scaled = (ratio) => (ratio >= 100 ? Math.round(ratio) : Math.round(ratio * 100) / 100);
      for (let index = 0; index < TOKEN_TIERS.length; index += 1) {
        const tier = TOKEN_TIERS[index];
        if (count < tier.div) continue;
        const rounded = scaled(count / tier.div);
        if (rounded < 1000 || index === 0) return String(rounded) + tier.unit;
        return String(scaled(count / (tier.div * 1000))) + TOKEN_TIERS[index - 1].unit;
      }
      return String(count);
    }

    // ------------------------------------------------------------ usage dates --

    /** The five date dimensions and how many of their most recent buckets the panel lists. */
    const DIMENSIONS = [
      { id: 'day', key: 'stats.dim.day', buckets: 7 },
      { id: 'week', key: 'stats.dim.week', buckets: 6 },
      { id: 'month', key: 'stats.dim.month', buckets: 6 },
      { id: 'quarter', key: 'stats.dim.quarter', buckets: 4 },
      { id: 'year', key: 'stats.dim.year', buckets: 3 },
      // `all` has no fixed bucket count: it spans every year with data (see bucketStarts).
      { id: 'all', key: 'stats.dim.all', buckets: 0 }
    ];

    /** Round one instant down to the start of its bucket, in local time. */
    function startOfBucket(time, dimension) {
      const date = new Date(time);
      const year = date.getFullYear();
      const month = date.getMonth();
      switch (dimension) {
        case 'day':
          return new Date(year, month, date.getDate());
        case 'week': {
          const daysSinceMonday = (date.getDay() + 6) % 7;
          return new Date(year, month, date.getDate() - daysSinceMonday);
        }
        case 'month':
          return new Date(year, month, 1);
        case 'quarter':
          return new Date(year, Math.floor(month / 3) * 3, 1);
        default:
          return new Date(year, 0, 1);
      }
    }

    /** Move one bucket start by `units` buckets (negative moves backward). */
    function shiftBucket(start, dimension, units) {
      const date = new Date(start);
      switch (dimension) {
        case 'day':
          date.setDate(date.getDate() + units);
          break;
        case 'week':
          date.setDate(date.getDate() + units * 7);
          break;
        case 'month':
          date.setMonth(date.getMonth() + units);
          break;
        case 'quarter':
          date.setMonth(date.getMonth() + units * 3);
          break;
        default:
          date.setFullYear(date.getFullYear() + units);
          break;
      }
      return date;
    }

    /** Short label for one bucket start. */
    function bucketLabel(start, dimension) {
      const pad = (value) => (value < 10 ? '0' + value : String(value));
      const year = start.getFullYear();
      const month = start.getMonth();
      switch (dimension) {
        case 'day':
        case 'week':
          // The year is part of every label: short "11-05" dates left a ragged gap
          // next to the older rows and made the column look uneven.
          return year + '-' + pad(month + 1) + '-' + pad(start.getDate());
        case 'month':
          return year + '-' + pad(month + 1);
        case 'quarter':
          return year + ' Q' + (Math.floor(month / 3) + 1);
        default:
          return String(year);
      }
    }

    /** Total model tokens one usage block reports. */
    function sumUsage(usage) {
      if (usage === null || usage === undefined || typeof usage !== 'object') return 0;
      return (
        (usage.uncachedInputTokens || 0) +
        (usage.outputTokens || 0) +
        (usage.cacheReadTokens || 0) +
        (usage.cacheWriteTokens || 0)
      );
    }

    /**
     * Estimated DeepSeek list prices per one million tokens, by wallet
     * currency. These are estimate inputs, not billing records: edit them when
     * the price list in use changes. `cacheRead` is the cache-hit input price;
     * `cacheWrite` is priced like a cache-miss input.
     */
    const PRICE_TABLE = {
      CNY: { cacheRead: 0.2, input: 2, output: 3, cacheWrite: 2 },
      USD: { cacheRead: 0.028, input: 0.28, output: 0.42, cacheWrite: 0.28 }
    };
    /** Token counts in PRICE_TABLE are per one million tokens. */
    const PRICE_UNIT = 1000000;

    /** Estimated spend of one usage block under the price table. */
    function costOfUsage(usage, currency) {
      if (usage === null || usage === undefined || typeof usage !== 'object') return 0;
      const price = PRICE_TABLE[currency] || PRICE_TABLE.CNY;
      return (
        ((usage.uncachedInputTokens || 0) * price.input +
          (usage.cacheReadTokens || 0) * price.cacheRead +
          (usage.cacheWriteTokens || 0) * price.cacheWrite +
          (usage.outputTokens || 0) * price.output) /
        PRICE_UNIT
      );
    }

    /** One local calendar date key, `YYYY-MM-DD`. */
    function localDateKey(time) {
      const date = new Date(time);
      const pad = (value) => (value < 10 ? '0' + value : String(value));
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }

    /** Parse a `YYYY-MM-DD` day key as a local calendar date. */
    function parseDayKey(key) {
      const parts = String(key).split('-');
      const year = Number(parts[0]);
      const month = Number(parts[1]);
      const day = Number(parts[2]);
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return undefined;
      const date = new Date(year, month - 1, day);
      return Number.isFinite(date.getTime()) ? date : undefined;
    }

    /** Cached first month the ALL tab covers (module lifetime). */
    let allStartMonth;

    /** First month the ALL tab covers: the discovered account start, else a 3-year window. */
    function allWindowStart(now) {
      const reference = now === undefined ? new Date() : now;
      if (allStartMonth === undefined) {
        allStartMonth = null;
        try {
          const storage = globalThis.localStorage;
          const raw = storage === undefined || storage === null ? null : storage.getItem(ALL_START_STORAGE_KEY);
          if (typeof raw === 'string' && /^\d{4}-\d{2}$/u.test(raw)) {
            const parts = raw.split('-');
            allStartMonth = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
          }
        } catch (error) {
          /* storage unavailable: fall back to the default window */
        }
      }
      if (allStartMonth !== null && allStartMonth !== undefined) return allStartMonth;
      return new Date(reference.getFullYear(), reference.getMonth() - (ALL_WINDOW_MONTHS - 1), 1);
    }

    /** Remember the first month that actually holds data, so later reads start there. */
    function rememberAllStart(month) {
      if (allStartMonth !== null && allStartMonth !== undefined) {
        if (allStartMonth.getTime() <= month.getTime()) return;
      }
      allStartMonth = month;
      try {
        const storage = globalThis.localStorage;
        if (storage === undefined || storage === null) return;
        const pad = (value) => (value < 10 ? '0' + value : String(value));
        storage.setItem(ALL_START_STORAGE_KEY, String(month.getFullYear()) + '-' + pad(month.getMonth() + 1));
      } catch (error) {
        /* best effort */
      }
    }

    /** Every month from `start` through `reference`, inclusive, oldest first. */
    function monthsBetween(start, reference) {
      const months = [];
      let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const last = new Date(reference.getFullYear(), reference.getMonth(), 1);
      while (cursor.getTime() <= last.getTime()) {
        months.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
      return months;
    }

    /** The most recent bucket starts of one dimension, oldest first. */
    function bucketStarts(dimensionId, now) {
      const dimension = DIMENSIONS.find((entry) => entry.id === dimensionId) || DIMENSIONS[0];
      const reference = now === undefined ? new Date() : now;
      if (dimension.id === 'all') {
        const first = allWindowStart(reference);
        const years = [];
        for (let year = first.getFullYear(); year <= reference.getFullYear(); year += 1) years.push(new Date(year, 0, 1));
        return { dimension, starts: years };
      }
      const currentStart = startOfBucket(reference.getTime(), dimension.id);
      const starts = [];
      let cursor = currentStart;
      for (let index = 0; index < dimension.buckets; index += 1) {
        starts.unshift(cursor);
        cursor = shiftBucket(cursor, dimension.id, -1);
      }
      return { dimension, starts };
    }

    /**
     * The platform months that cover one dimension's window: from the month of
     * the oldest bucket through the current month, inclusive.
     */
    function monthsForDimension(dimensionId, now) {
      const reference = now === undefined ? new Date() : now;
      if (dimensionId === 'all') return monthsBetween(allWindowStart(reference), reference);
      const { starts } = bucketStarts(dimensionId, now);
      const first = starts[0];
      const months = [];
      let cursor = new Date(first.getFullYear(), first.getMonth(), 1);
      const last = new Date(reference.getFullYear(), reference.getMonth(), 1);
      while (cursor.getTime() <= last.getTime()) {
        months.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
      return months;
    }

    /** Run `worker` over `items` with bounded concurrency, keeping input order. */
    async function mapLimit(items, limit, worker) {
      const results = new Array(items.length);
      let next = 0;
      const runners = [];
      for (let index = 0; index < Math.min(limit, items.length); index += 1) {
        runners.push(
          (async () => {
            while (next < items.length) {
              const current = next;
              next += 1;
              results[current] = await worker(items[current], current);
            }
          })()
        );
      }
      await Promise.all(runners);
      return results;
    }

    /**
     * Fold per-day usage records into the most recent buckets of one dimension.
     * Day records are `{ date: 'YYYY-MM-DD', tokens, cost, count }`; platform
     * data counts requests while the local fallback counts sessions.
     */
    function buildSeries(days, dimensionId, now) {
      const { dimension, starts } = bucketStarts(dimensionId, now);
      const cells = starts.map((start, index) => ({
        key: String(start.getTime()),
        label: bucketLabel(start, dimension.id),
        total: 0,
        cost: 0,
        count: 0,
        current: index === starts.length - 1
      }));
      const indexByStart = new Map(starts.map((start, index) => [start.getTime(), index]));
      for (const day of days) {
        if (day === null || typeof day !== 'object') continue;
        const date = parseDayKey(day.date);
        if (date === undefined) continue;
        const start = startOfBucket(date.getTime(), dimension.id);
        const index = indexByStart.get(start.getTime());
        if (index === undefined) continue;
        cells[index].total += Number(day.tokens) || 0;
        cells[index].cost += Number(day.cost) || 0;
        cells[index].count += Number(day.count) || 0;
      }
      const total = cells.reduce((sum, cell) => sum + cell.total, 0);
      const cost = cells.reduce((sum, cell) => sum + cell.cost, 0);
      const count = cells.reduce((sum, cell) => sum + cell.count, 0);
      const max = cells.reduce((value, cell) => Math.max(value, cell.total), 0);
      return { dimension: dimension.id, cells, total, cost, count, max };
    }

    // ----------------------------------------------------------- panel body --

    /** One read of the account namespace; never throws, always resolves to a status object. */
    function createAccountReader(ctx) {
      const harnessVersion = () => {
        const boot = globalThis.__DSH_BOOT__;
        const version = boot && boot.release ? boot.release.version : undefined;
        return typeof version === 'string' && version !== '' ? version : '0.0.0';
      };
      const clientMetadata = () => {
        const snapshot = ctx.locale.getSnapshot();
        return {
          version: harnessVersion(),
          locale: snapshot.active,
          timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60
        };
      };
      const envelope = (result) =>
        result !== undefined &&
        result !== null &&
        typeof result === 'object' &&
        result.ok === true;
      return async function readAccount(force) {
        try {
          const stateResult = await ctx.remote.account.getState();
          if (!envelope(stateResult)) {
            return {
              ok: false,
              message:
                stateResult && stateResult.error
                  ? String(stateResult.error.message || stateResult.error.code || '')
                  : ''
            };
          }
          const view = stateResult.value;
          if (
            view === undefined ||
            view === null ||
            typeof view !== 'object' ||
            view.status !== 'credential-stored'
          ) {
            return { ok: true, view: view || { status: 'signed-out', links: {} }, balance: null };
          }
          const metadata = clientMetadata();
          const failedRead = (error) => ({
            ok: false,
            error: { code: 'client', message: String((error && error.message) || error || '') }
          });
          const balanceResult = await ctx.remote.account.getBalance(metadata).catch(failedRead);
          return {
            ok: true,
            view,
            locale: metadata.locale,
            balance: envelope(balanceResult) ? balanceResult.value : { status: 'failed' }
          };
        } catch (error) {
          return { ok: false, message: String((error && error.message) || error || '') };
        }
      };
    }

    /** Host route that proxies one platform usage month (see the Host half). */
    const PLATFORM_USAGE_ROUTE = '/account-usage/platform/usage';
    const SESSION_MODELS_ROUTE = '/account-usage/session/models';
    const PROVIDER_BALANCE_ROUTE = '/account-usage/provider/balance';
    /** Cache lifetime for the month still being written (platform updates it live). */
    const MONTH_CACHE_TTL_MS = 2 * 60 * 1000;
    /** Cache lifetime for closed months; their daily totals no longer change. */
    const HISTORY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    /** localStorage key holding the last few weeks of month payloads. */
    const MONTH_STORAGE_KEY = 'dsh.account-usage.months.v1';
    /** Fetched platform months, keyed `YYYY-M`; module lifetime across panel remounts. */
    const platformMonthCache = new Map();
    let platformMonthsRestored = false;

    /** Whether one period is the month currently being written. */
    function isCurrentMonth(period) {
      const now = new Date();
      return period.year === now.getFullYear() && period.month === now.getMonth() + 1;
    }

    /** One cache entry's lifetime: the live month expires quickly, closed months do not. */
    function monthTtl(period) {
      return isCurrentMonth(period) ? MONTH_CACHE_TTL_MS : HISTORY_CACHE_TTL_MS;
    }

    /** Restore persisted months once per page load so switching to 年 is fast after reload. */
    function restorePersistedMonths() {
      if (platformMonthsRestored) return;
      platformMonthsRestored = true;
      try {
        const storage = globalThis.localStorage;
        if (storage === undefined || storage === null) return;
        const raw = storage.getItem(MONTH_STORAGE_KEY);
        if (typeof raw !== 'string' || raw === '') return;
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object') return;
        const now = Date.now();
        for (const key of Object.keys(parsed)) {
          const entry = parsed[key];
          if (entry === null || typeof entry !== 'object' || typeof entry.at !== 'number') continue;
          if (entry.data === null || typeof entry.data !== 'object') continue;
          if (now - entry.at > HISTORY_CACHE_TTL_MS) continue;
          if (!platformMonthCache.has(key)) platformMonthCache.set(key, { at: entry.at, data: entry.data });
        }
      } catch (error) {
        /* storage unavailable or malformed: start empty */
      }
    }

    /** Persist every non-expired cached month, dropping entries past the history TTL. */
    function persistMonths() {
      try {
        const storage = globalThis.localStorage;
        if (storage === undefined || storage === null) return;
        const now = Date.now();
        const out = {};
        for (const [key, entry] of platformMonthCache) {
          if (now - entry.at > HISTORY_CACHE_TTL_MS) {
            platformMonthCache.delete(key);
            continue;
          }
          out[key] = { at: entry.at, data: entry.data };
        }
        storage.setItem(MONTH_STORAGE_KEY, JSON.stringify(out));
      } catch (error) {
        /* best effort: quota or privacy mode */
      }
    }

    /**
     * Read one platform usage month through the Host route. Closed months are
     * cached for a week (also in localStorage), the live month for two minutes;
     * `force` re-reads the live month through both cache layers.
     */
    async function readPlatformMonth(period, force) {
      restorePersistedMonths();
      const key = String(period.year) + '-' + String(period.month);
      const cached = platformMonthCache.get(key);
      if (force !== true && cached !== undefined && Date.now() - cached.at < monthTtl(period)) {
        return { ok: true, data: cached.data };
      }
      const query = '?year=' + String(period.year) + '&month=' + String(period.month) + (force === true ? '&force=1' : '');
      try {
        const response = await fetch(PLATFORM_USAGE_ROUTE + query, {
          headers: { accept: 'application/json' },
          credentials: 'same-origin'
        });
        const body = await response.json().catch(() => null);
        if (body !== null && typeof body === 'object' && body.ok === true && body.data !== null && typeof body.data === 'object') {
          platformMonthCache.set(key, { at: Date.now(), data: body.data });
          return { ok: true, data: body.data };
        }
        return { ok: false, code: body !== null && typeof body === 'object' && typeof body.code === 'string' ? body.code : 'invalid_response' };
      } catch (error) {
        return { ok: false, code: 'network' };
      }
    }

    /** Whether one platform month payload carries any usage at all. */
    function monthHasData(data) {
      if (data === null || typeof data !== 'object' || !Array.isArray(data.days)) return false;
      for (const day of data.days) {
        if (day === null || typeof day !== 'object') continue;
        if ((Number(day.tokens) || 0) > 0 || (Number(day.cost) || 0) > 0) return true;
      }
      return false;
    }

    /** Fold month payloads into the flat day records the series builder consumes. */
    function daysFromMonths(results) {
      const days = [];
      let currency = 'CNY';
      for (const result of results) {
        const data = result.data;
        if (typeof data.currency === 'string' && data.currency !== '') currency = data.currency;
        for (const day of Array.isArray(data.days) ? data.days : []) {
          if (day === null || typeof day !== 'object' || typeof day.date !== 'string') continue;
          days.push({
            date: day.date,
            tokens: Number(day.tokens) || 0,
            cost: Number(day.cost) || 0,
            count: Number(day.requests) || 0
          });
        }
      }
      return { days, currency };
    }

    /**
     * The ALL tab: read a three-year window first, then widen it while the oldest
     * month still holds data, remembering the first month that does. Closed months
     * come from the shared month cache, so widening costs no extra requests.
     */
    async function readAllPlatformUsage(force) {
      restorePersistedMonths();
      const reference = new Date();
      let start = allWindowStart(reference);
      let folded = { days: [], currency: 'CNY' };
      for (let round = 0; round < 3; round += 1) {
        const months = monthsBetween(start, reference);
        const results = await mapLimit(months, 6, (period) => readPlatformMonth(period, force === true && isCurrentMonth(period)));
        const failed = results.find((result) => result.ok !== true);
        if (failed !== undefined) return { ok: false, code: failed.code };
        folded = daysFromMonths(results);
        const earliest = months.find((period, index) => results[index].ok === true && monthHasData(results[index].data));
        if (earliest !== undefined) rememberAllStart(new Date(earliest.year, earliest.month - 1, 1));
        const oldestHasData = results[0] !== undefined && results[0].ok === true && monthHasData(results[0].data);
        const canExtend = months.length < ALL_MAX_MONTHS;
        if (oldestHasData !== true || canExtend !== true) break;
        const widened = new Date(start.getFullYear(), start.getMonth() - ALL_WINDOW_MONTHS, 1);
        if (widened.getTime() >= start.getTime()) break;
        start = widened;
      }
      persistMonths();
      return { ok: true, source: 'platform', days: folded.days, currency: folded.currency };
    }

    /** Platform usage over one dimension's window, folded into day records. */
    async function readPlatformUsage(dimension, force) {
      restorePersistedMonths();
      if (dimension === 'all') return readAllPlatformUsage(force);
      const months = monthsForDimension(dimension, new Date());
      const results = await mapLimit(months, 6, (period) => readPlatformMonth(period, force === true && isCurrentMonth(period)));
      const failed = results.find((result) => result.ok !== true);
      if (failed !== undefined) return { ok: false, code: failed.code };
      const { days, currency } = daysFromMonths(results);
      persistMonths();
      return { ok: true, source: 'platform', days, currency };
    }

    /** Last ready result per dimension, so switching back never shows a loading frame. */
    const dimensionResults = new Map();
    /** One-time background warm-up flag for the other dimensions. */
    let dimensionsWarmed = false;

    /** Cheap structural comparison of two day-record arrays. */
    function sameDays(left, right) {
      if (left === right) return true;
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
      for (let index = 0; index < left.length; index += 1) {
        const a = left[index];
        const b = right[index];
        if (a.date !== b.date || a.tokens !== b.tokens || a.cost !== b.cost || a.count !== b.count) return false;
      }
      return true;
    }

    /** Keep request identity and failure state attached to the exact source tab. */
    function providerBalanceState(provider, result) {
      return result && result.ok === true
        ? { phase: 'ready', data: { ...result, provider } }
        : { phase: 'error', code: result && typeof result.code === 'string' ? result.code : 'fetch_failed' };
    }

    /** One provider's balance, read by the Host with the provider credential it holds. */
    function createProviderBalanceReader() {
      return async function readProviderBalance(provider, force) {
        try {
          const query = '?provider=' + encodeURIComponent(provider) + (force === true ? '&force=1' : '');
          const response = await fetch(PROVIDER_BALANCE_ROUTE + query, { credentials: 'same-origin' });
          const body = await response.json();
          if (response.ok && body !== null && typeof body === 'object' && body.ok === true && body.data !== null && typeof body.data === 'object') {
            return { ok: true, ...body.data };
          }
          return { ok: false, code: body !== null && typeof body === 'object' && typeof body.code === 'string' ? body.code : 'fetch_failed' };
        } catch (error) {
          return { ok: false, code: 'fetch_failed' };
        }
      };
    }

    /** Per-model token totals for one session, computed by the Host from its durable log. */
    function createSessionModelReader() {
      return async function readSessionModels(sessionId) {
        if (typeof sessionId !== 'string' || sessionId === '') return { ok: false, code: 'no_session' };
        try {
          const response = await fetch(SESSION_MODELS_ROUTE + '?sessionId=' + encodeURIComponent(sessionId), {
            credentials: 'same-origin'
          });
          const body = await response.json();
          if (response.ok && body !== null && typeof body === 'object' && body.ok === true && Array.isArray(body.data?.models)) {
            return {
              ok: true,
              models: body.data.models
                .filter((entry) => entry !== null && typeof entry === 'object' && typeof entry.model === 'string' && Number.isFinite(entry.tokens))
                .map((entry) => ({
                  provider: typeof entry.provider === 'string' ? entry.provider : '',
                  model: entry.model,
                  tokens: Math.max(0, Math.round(entry.tokens)),
                  requests: Number.isFinite(entry.requests) ? Math.max(0, Math.round(entry.requests)) : 0
                })),
              totalTokens: Number.isFinite(body.data.totalTokens) ? body.data.totalTokens : 0,
              lastProvider:
                body.data.lastRoute !== null && body.data.lastRoute !== undefined && typeof body.data.lastRoute.provider === 'string'
                  ? body.data.lastRoute.provider
                  : ''
            };
          }
          return { ok: false, code: body !== null && typeof body === 'object' && typeof body.code === 'string' ? body.code : 'fetch_failed' };
        } catch (error) {
          return { ok: false, code: 'fetch_failed' };
        }
      };
    }

    /** Local fallback: session token totals attributed to each session's last activity. */
    async function readLocalUsage(ctx, currency) {
      try {
        const result = await ctx.remote.session.list({});
        if (!result || result.ok !== true) return { ok: false };
        const items = result.value && Array.isArray(result.value.items) ? result.value.items : [];
        const days = [];
        for (const item of items) {
          if (item === null || item === undefined || typeof item.sessionId !== 'string') continue;
          if (typeof item.updatedAt !== 'number') continue;
          const values = item.projections && item.projections.values;
          const usage = values === undefined ? undefined : values.tokenUsage;
          if (usage === undefined || usage === null) continue;
          const tokens = sumUsage(usage);
          if (tokens <= 0) continue;
          days.push({
            date: localDateKey(item.updatedAt),
            tokens,
            cost: costOfUsage(usage, currency),
            count: 1
          });
        }
        return { ok: true, source: 'local', days, currency };
      } catch (error) {
        return { ok: false };
      }
    }

    /**
     * Usage for one dimension: real platform data first, local estimates only
     * when the platform route cannot serve the window (signed out, platform
     * session rejected, offline). The caller receives the reason so the panel
     * can label a fallback.
     */
    function createUsageReader(ctx) {
      return async function readUsage(dimension, force, currencyHint) {
        const platform = await readPlatformUsage(dimension, force);
        if (platform.ok === true) return platform;
        const local = await readLocalUsage(ctx, currencyHint || 'CNY');
        if (local.ok === true) return { ...local, reason: platform.code || 'fetch_failed' };
        return { ok: false, code: platform.code || 'local_unavailable' };
      };
    }

    /** Hint copy: wraps when needed, never truncated. */
    function Hint({ children }) {
      return h('p', { className: 'aup-hint', title: typeof children === 'string' ? children : undefined }, children);
    }

    /** Error copy: wraps when needed, never truncated. */
    function ErrorText({ children }) {
      return h('p', { className: 'aup-error', title: typeof children === 'string' ? children : undefined }, children);
    }

    /**
     * Account balance. DeepSeek-only sessions show the wallet rows; once a session
     * uses any third-party provider, every source gets one aligned row
     * (name | remaining | note) so nothing is hidden behind tabs,
     * nothing wraps into a second tab row and no pane reserves blank space.
     */
    function AccountSection({ state, t, providerBalances, sources, currentSource, locale: uiLocale }) {
      const result = state.result;
      const accountLocale = result === undefined ? undefined : result.locale;
      const locale = uiLocale === undefined ? accountLocale : uiLocale;

      const list = (Array.isArray(sources) ? sources : []).filter(
        (source) => source !== null && source !== undefined && typeof source.id === 'string' && source.id !== ''
      );
      const providerPhase = providerBalances === null || providerBalances === undefined ? 'loading' : providerBalances.phase;
      const providerRows = providerPhase === 'ready' && Array.isArray(providerBalances.items) ? providerBalances.items : [];
      const currencyOf = (entry) => (typeof entry.currency === 'string' ? entry.currency : 'USD');
      const windowCode = (id) => (id === 'rolling' ? t('account.planRolling') : id === 'weekly' ? t('account.planWeekly') : t('account.planMonthly'));
      // One display rule for every source (user 2026-11-08): short muted label + figure
      // pairs, right aligned - `Balance 199.54¥ Bonus 0.00¥`, `5HW 63% WEK 70% MON 85%`.
      const pairs = (items, extraClass) => ({
        value: h('span', { className: 'aup-acct-pairs' + (extraClass === undefined ? '' : ' ' + extraClass) },
          items.map(([key, label, figure]) =>
            h('span', { key, className: 'aup-acct-pair' },
              h('span', { className: 'aup-acct-pair-label' }, label),
              h('span', null, figure))))
      });

      /** The DeepSeek wallet, reduced to the same summary shape as a provider. */
      const accountSummary = () => {
        if (state.phase === 'loading') return { value: t('account.status.loading'), muted: true, busy: true };
        if (state.phase === 'error' || !result || result.ok !== true) return { value: t('balance.failed'), muted: true };
        const view = result.view || {};
        if (view.status !== 'credential-stored') return { value: t('account.status.signedOut'), muted: true };
        const balance = result.balance;
        if (!balance || balance.status === 'failed') return { value: t('balance.failed'), muted: true };
        const wallets = balance.status === 'ready' ? balance.value || [] : [];
        const bonusWallets = balance.status === 'ready' ? balance.bonusWallets || [] : [];
        const main = wallets[0] || bonusWallets[0];
        if (main === undefined) return { value: t('balance.empty'), muted: true };
        const bonus = wallets[0] === undefined ? undefined : bonusWallets[0];
        return pairs([
          ['balance', wallets[0] === undefined ? t('account.bonusLabel') : t('balance.recharge'), formatMoney(main.balance, main.currency, locale)],
          ...(bonus === undefined ? [] : [['bonus', t('account.bonusLabel'), formatMoney(bonus.balance, bonus.currency, locale)]])
        ]);
      };

      const providerSummary = (source) => {
        const status = providerBalances && providerBalances.byProvider && providerBalances.byProvider[source.id];
        const entry = status ? status.data : providerRows.find((row) => row && row.provider === source.id);
        if (entry !== undefined && (!status || status.phase === 'ready')) {
          if (entry.kind === 'opencode-plan' && Array.isArray(entry.windows) && entry.windows.length > 0) {
            // Plan rule (user 2026-11-08): `5HW 63%  WEK 70%  MON 85%` - every figure is
            // the share LEFT, so no "left/used" wording; fixed order 5h -> week -> month.
            const windows = ['rolling', 'weekly', 'monthly']
              .map((id) => entry.windows.find((window) => window && window.id === id))
              .filter((window) => window !== undefined && Number.isFinite(window.usedPercent));
            if (windows.length === 0) return { value: t('account.status.invalid'), muted: true };
            const figures = windows.map((window) => Math.round((100 - window.usedPercent) * 10) / 10 + '%');
            // Deterministic, not measured: only three `100%` figures need the extra step.
            const tight = figures.every((figure) => figure.length >= 4);
            return pairs(windows.map((window, index) => [window.id, windowCode(window.id), figures[index]]), tight ? 'aup-acct-pairs-tight' : undefined);
          }
          const currency = currencyOf(entry);
          const money = (value) => formatMoney(String(value), currency, locale);
          const remaining = Number.isFinite(entry.remaining) ? entry.remaining : undefined;
          const granted = Number.isFinite(entry.granted) ? entry.granted : undefined;
          // The balance card shows what is LEFT only (user 2026-11-08: no costs here) -
          // spend lives in the statistics card. A key-scoped OpenRouter allowance is
          // labelled "Key", never "Balance"; unknown remaining is never shown as zero.
          const items = [];
          if (remaining !== undefined) items.push(['remaining', entry.scope === 'key' ? t('account.keyLabel') : t('balance.recharge'), money(remaining)]);
          if (granted !== undefined) items.push(['bonus', t('account.bonusLabel'), money(granted)]);
          if (items.length === 0) return { value: t('account.status.noBalance'), muted: true };
          return pairs(items);
        }
        const code = status && status.phase === 'error' ? status.code : status && status.phase === 'loading' || providerPhase !== 'ready' ? 'loading' : 'fetch_failed';
        const statusKeys = {
          loading: 'account.status.loading', unsupported_provider: 'account.status.unsupported',
          no_credential: 'account.status.noKey', auth_failed: 'account.status.auth',
          credential_failed: 'account.status.credentials', timeout: 'account.status.timeout',
          invalid_response: 'account.status.invalid', fetch_failed: 'account.status.network'
        };
        // Fetch failure is a quiet status, never an extra Retry control.
        return {
          value: t(statusKeys[code] || 'account.status.network'),
          muted: true,
          busy: code === 'loading'
        };
      };

      /** DeepSeek-only sessions: labelled wallet rows (label | value), errors as hints. */
      const walletBody = () => {
        if (state.phase === 'loading') return h(Hint, null, t('loading'));
        if (state.phase === 'error' || !result || result.ok !== true) {
          const code = result && typeof result.code === 'string' ? result.code : '';
          const reasonKey = code === '' ? '' : 'stats.reason.' + code;
          const reason = reasonKey !== '' && t(reasonKey) !== reasonKey ? t(reasonKey) : '';
          const rawDetail = result && result.message ? String(result.message) : '';
          const chinese = String(locale || '').toLowerCase().startsWith('zh');
          const detail = reason !== '' ? reason : chinese ? rawDetail : '';
          return [
            h(ErrorText, { key: 'error' }, t('error')),
            detail === '' ? null : h(Hint, { key: 'detail' }, detail)
          ];
        }
        const view = result.view || {};
        if (view.status !== 'credential-stored') {
          return [h(Hint, { key: 'out' }, t('account.signedOut')), h(Hint, { key: 'hint' }, t('account.signedOutHint'))];
        }
        const balance = result.balance;
        const wallets = balance && balance.status === 'ready' ? balance.value || [] : [];
        const bonusWallets = balance && balance.status === 'ready' ? balance.bonusWallets || [] : [];
        if (!balance || balance.status === 'failed') return h(Hint, null, t('balance.failed'));
        if (wallets.length === 0 && bonusWallets.length === 0) return h(Hint, null, t('balance.empty'));
        const rows = [
          ...wallets.map((wallet, index) => ({ key: 'w' + index, label: t('balance.recharge'), wallet })),
          ...bonusWallets.map((wallet, index) => ({ key: 'b' + index, label: t('balance.bonus'), wallet }))
        ];
        return h('div', { className: 'aup-acct-srcs' },
          rows.map((row, index) =>
            h('div', { key: row.key, className: 'aup-acct-row' },
              h('span', { className: 'aup-acct-label' }, row.label),
              h('span', { className: 'aup-acct-src-value' },
                h('span', { className: 'aup-acct-src-amount' + (index === 0 ? '' : ' aup-minor') }, formatMoney(row.wallet.balance, row.wallet.currency, locale))))));
      };

      const sourceTable = () =>
        h('div', { className: 'aup-acct-srcs', role: 'list', 'aria-label': t('account.title') },
          list.map((source) => {
            const summary = source.isAccount === true ? accountSummary() : providerSummary(source);
            // Which row belongs to the provider this session is using right now
            // (user 2026-11-08). Unknown or stale providers simply highlight nothing.
            const current =
              typeof currentSource === 'string' &&
              currentSource !== '' &&
              (source.isAccount === true ? currentSource === 'account' : currentSource === source.id);
            return h('div', {
              key: source.id, className: 'aup-acct-src', role: 'listitem',
              'aria-busy': summary.busy === true ? true : undefined,
              'data-current': current ? true : undefined,
              'aria-current': current ? 'true' : undefined
            },
              h('span', { className: 'aup-acct-src-label' }, sourceLabel(source, t)),
              // Name left, figures right: every row ends on the card edge, and the
              // secondary note sits beside its own figure instead of in a shared column.
              h('span', { className: 'aup-acct-src-value' },
                h('span', { className: 'aup-acct-src-amount' + (summary.muted === true ? ' aup-muted' : '') }, summary.value)));
          }));

      const mixed = list.some((source) => source.isAccount !== true);
      return h(
        'section',
        { className: 'aup-card aup-card-account' + (mixed ? ' aup-card-account-provider' : '') },
        h(CardHead, { icon: WalletGlyph, title: t('account.title') }),
        h('span', { className: 'aup-divider', 'aria-hidden': true }),
        h('div', { className: 'aup-account-body' }, mixed ? sourceTable() : walletBody())
      );
    }

    /** Date-dimension statistics over real platform usage (local estimates as fallback). */
    function UsageSection({ state, dimension, onDimension, t, fallbackCurrency, locale, showCost, listMode, categories, sessionOnly }) {
      const moveDimension = (event) => {
        const index = DIMENSIONS.findIndex((entry) => entry.id === dimension);
        let next = null;
        if (event.key === 'ArrowRight') next = (index + 1) % DIMENSIONS.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + DIMENSIONS.length) % DIMENSIONS.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = DIMENSIONS.length - 1;
        if (next === null) return;
        event.preventDefault();
        onDimension(DIMENSIONS[next].id);
        const buttons = event.currentTarget.querySelectorAll('[role="tab"]');
        if (buttons[next] !== undefined) buttons[next].focus();
      };
      const sectionRef = React.useRef(null);

      const dimensions = h(
        'div',
        {
          className: 'aup-dims',
          role: 'tablist',
          'aria-label': t('stats.title'),
          onKeyDown: moveDimension
        },
        DIMENSIONS.map((entry) =>
          h(
            'button',
            {
              key: entry.id,
              type: 'button',
              role: 'tab',
              className: 'aup-dim',
              'data-active': entry.id === dimension ? true : undefined,
              'aria-selected': entry.id === dimension,
              tabIndex: entry.id === dimension ? 0 : -1,
              onClick: () => onDimension(entry.id)
            },
            t(entry.key)
          )
        )
      );

      const headCore = [
        h(CardHead, {
          icon: ChartGlyph,
          title: t('stats.title'),
          extra: state.source === 'local' ? h('span', { className: 'aup-badge' }, t('stats.localBadge')) : null
        }),
        h('span', { className: 'aup-divider', 'aria-hidden': true })
      ];
      const head = h('div', { className: 'aup-stats-head' }, sessionOnly === true ? headCore : [...headCore, dimensions]);

      if (state.phase === 'loading') {
        // The loading frame has to occupy exactly the height the ready card will:
        // the same source rows, the same four period slots and the same summary row.
        // Anything shorter makes clicking a range shove the whole panel around.
        const loadingProviderRows = (Array.isArray(categories) ? categories : []).filter(
          (row) => row !== null && row !== undefined && Number.isFinite(row.tokens) && row.tokens > 0
        );
        const loadingSourceCount = sessionOnly === true ? loadingProviderRows.length : loadingProviderRows.length + 1;
        const skeletonCell = (key) => h('span', { key: 'skeleton-cell-' + key, className: 'aup-skeleton aup-skeleton-value' });
        const skeletonSourceRows = Array.from({ length: loadingSourceCount }, (unused, index) =>
          h(
            'div',
            { key: 'skeleton-src-' + String(index), className: 'aup-src aup-skeleton-row' },
            h('span', { className: 'aup-skeleton aup-skeleton-label' }),
            skeletonCell('tokens-' + String(index)),
            skeletonCell('side-' + String(index))
          )
        );
        const skeletonPeriodRows = Array.from({ length: SERIES_ROW_SLOTS }, (unused, index) =>
          h(
            'div',
            { key: 'skeleton-row-' + String(index), className: 'aup-series-row aup-skeleton-row' },
            h('span', { className: 'aup-skeleton aup-skeleton-label' }),
            skeletonCell('value-' + String(index)),
            skeletonCell('cost-' + String(index))
          )
        );
        // inline-block keeps the line box (and therefore the row) exactly as tall as a
        // text cell, so the loading summary row matches the ready one to the pixel.
        const skeletonSummaryCell = (key) =>
          h('span', { key }, h('span', { className: 'aup-skeleton aup-skeleton-label', style: { display: 'inline-block' } }));
        const skeletonSummary = h(
          'div',
          { className: 'aup-stats-summary', 'aria-hidden': true },
          skeletonSummaryCell('summary-left'),
          skeletonSummaryCell('summary-mid'),
          skeletonSummaryCell('summary-right')
        );
        return h(
          'section',
          { className: 'aup-card aup-card-stats', 'aria-busy': true },
          head,
          h('span', { className: 'aup-sr-only' }, t('stats.loading')),
          h(
            'div',
            { className: 'aup-stats-body', 'aria-hidden': true },
            h('div', { className: 'aup-srcs' }, skeletonSourceRows),
            listMode === true && sessionOnly !== true ? h('div', { className: 'aup-series' }, skeletonPeriodRows) : null,
            skeletonSummary
          )
        );
      }
      if (state.phase === 'error' || state.ok === false) {
        const reasonKey = state.code === undefined ? '' : 'stats.reason.' + String(state.code);
        const reason = reasonKey === '' ? '' : t(reasonKey);
        const reasonText = reason === reasonKey ? '' : reason;
        return h(
          'section',
          { className: 'aup-card aup-card-stats' },
          head,
          h(ErrorText, null, t('stats.failed')),
          reasonText === '' ? null : h(Hint, null, reasonText)
        );
      }

      const source = state.source === 'platform' ? 'platform' : 'local';
      const estimate = source !== 'platform';
      const currency = typeof state.currency === 'string' && state.currency !== '' ? state.currency : fallbackCurrency || 'CNY';
      const series = buildSeries(state.days || [], dimension);
      // Keep the card compact with a fixed cap: drop the OLDEST periods, keep the newest.
      // No measurement and no observer, so this can never feed back into layout.
      const rowCap = DIMENSION_ROW_CAP[dimension] === undefined ? SERIES_ROW_SLOTS : DIMENSION_ROW_CAP[dimension];
      const visibleCells = series.cells.slice(Math.max(0, series.cells.length - rowCap));
      // The ALL tab is defined by its grand total: older years that no longer fit on
      // screen still count, otherwise the number would silently shrink.
      const summaryCells = dimension === 'all' ? series.cells : visibleCells;
      const shownTotal = summaryCells.reduce((sum, cell) => sum + cell.total, 0);
      const shownCost = summaryCells.reduce((sum, cell) => sum + cell.cost, 0);
      const shownCount = summaryCells.reduce((sum, cell) => sum + (Number.isFinite(cell.count) ? cell.count : 0), 0);
      const periodRows = visibleCells.map((cell) => {
        const detail =
          showCost !== false && cell.cost > 0
            ? cell.label + ' · ' + formatTokens(cell.total) + ' tokens · ' + formatCost(cell.cost, currency, locale, estimate)
            : cell.label + ' · ' + formatTokens(cell.total) + ' tokens';
        return h(
          'div',
          {
            key: cell.key,
            className: 'aup-series-row',
            title: detail,
            'data-current': cell.current ? true : undefined,
            'data-zero': cell.total === 0 ? true : undefined
          },
          h('span', { className: 'aup-series-label' }, cell.label),
          h('span', { className: 'aup-series-tokens' }, formatTokens(cell.total)),
          showCost !== false && cell.cost > 0
            ? h('span', { className: 'aup-series-cost' }, formatCost(cell.cost, currency, locale, estimate))
            : h('span', { className: 'aup-series-cost', 'aria-hidden': true })
        );
      });

      // One row per source, identical in every session shape.
      const providerRows = (Array.isArray(categories) ? categories : []).filter(
        (row) => row !== null && row !== undefined && Number.isFinite(row.tokens) && row.tokens > 0
      );
      const sources = [];
      if (sessionOnly !== true) {
        sources.push({
          key: 'account',
          label: t('stats.platformBadge'),
          tokens: shownTotal,
          side: showCost === false ? '' : formatCost(shownCost, currency, locale, estimate),
          note: t('tokens.requestsCount', { count: String(shownCount) })
        });
      }
      for (const row of providerRows) {
        sources.push({
          key: row.provider,
          label: row.label,
          tokens: row.tokens,
          side: t('stats.subscriptionScope'),
          note: t('tokens.requestsCount', { count: String(Number.isFinite(row.requests) ? row.requests : 0) })
        });
      }
      const sourceTotal = sources.reduce((sum, row) => sum + row.tokens, 0);
      const sourceList = h(
        'div',
        { className: 'aup-srcs' },
        sources.map((row) =>
          h(
            'div',
            { key: row.key, className: 'aup-src', title: row.label + ' · ' + formatTokens(row.tokens) + ' · ' + row.note },
            h('span', { className: 'aup-src-label' }, row.label),
            h('span', { className: 'aup-src-tokens' }, formatTokens(row.tokens)),
            h('span', { className: 'aup-src-side' }, row.side)
          )
        )
      );

      return h(
        'section',
        { className: 'aup-card aup-card-stats', ref: sectionRef },
        head,
        series.total === 0 && providerRows.length === 0 && listMode !== true
          ? h(Hint, null, t('stats.empty'))
          : h(
              'div',
              { className: 'aup-stats-body' },
              sourceList,
              listMode === true && sessionOnly !== true
                ? h(
                    'div',
                    { className: 'aup-series' },
                    periodRows,
                    // Invisible slots keep the list - and therefore every card below it -
                    // exactly the same height in all five dimensions: quarter/year leave
                    // the spare slots empty instead of collapsing the card.
                    Array.from({ length: Math.max(0, SERIES_ROW_SLOTS - periodRows.length) }, (unused, index) =>
                      h('div', { key: 'row-slot-' + String(index), className: 'aup-series-row aup-series-slot', 'aria-hidden': true })
                    )
                  )
                : null,
              h(
                'div',
                { className: 'aup-stats-summary' },
                // Left / centre / right, exactly like the context legend: the two card
                // footers must read as the same component.
                h('span', null, t('stats.summary.total', { total: formatTokens(sessionOnly === true ? sourceTotal : shownTotal) })),
                h(
                  'span',
                  null,
                  sessionOnly === true
                    ? t('stats.summary.sources', { count: String(sources.length) })
                    : t('stats.summary.requests', { count: String(shownCount) })
                ),
                showCost !== false && sessionOnly !== true
                  ? h('span', { className: 'aup-stats-total' }, formatCost(shownCost, currency, locale, estimate))
                  : h('span', { className: 'aup-stats-total', 'aria-hidden': true })
              )
            )
      );
    }

    /** This session's durable token totals plus context occupancy. */
    function TokenSection({ useProjection, t, sessionModels }) {
      const usage = useProjection('tokenUsage');
      const pressure = useProjection('contextPressure');
      const contextBreakdown = useProjection('contextBreakdown');
      const sessionStats = useProjection('sessionStats');

      const total = usage
        ? (usage.uncachedInputTokens || 0) +
          (usage.outputTokens || 0) +
          (usage.cacheReadTokens || 0) +
          (usage.cacheWriteTokens || 0)
        : 0;
      const rows = usage
        ? [
            { key: 'total', label: t('tokens.total'), value: total, total: true },
            { key: 'input', label: t('tokens.uncachedInput'), value: usage.uncachedInputTokens || 0 },
            { key: 'output', label: t('tokens.output'), value: usage.outputTokens || 0 },
            { key: 'cacheRead', label: t('tokens.cacheRead'), value: usage.cacheReadTokens || 0 },
            { key: 'cacheWrite', label: t('tokens.cacheWrite'), value: usage.cacheWriteTokens || 0 }
          ]
        : [];
      const usedTokens =
        pressure && Number.isFinite(pressure.projectedTokens)
          ? pressure.projectedTokens
          : pressure && Number.isFinite(pressure.pressureTokens)
            ? pressure.pressureTokens
            : undefined;
      const contextWindow = pressure && Number.isFinite(pressure.contextWindow) ? pressure.contextWindow : undefined;
      const hasContext = usedTokens !== undefined && contextWindow !== undefined && contextWindow > 0;
      const percent = hasContext ? Math.min(100, Math.round((usedTokens / contextWindow) * 100)) : 0;

      const detailRows = rows.filter((row) => row.total !== true);
      const modelRows = sessionModels !== null && sessionModels !== undefined && Array.isArray(sessionModels.items) ? sessionModels.items : [];
      const requestCount = modelRows.reduce((sum, item) => sum + (Number.isFinite(item.requests) ? item.requests : 0), 0);
      const promptTokens = usage ? (usage.uncachedInputTokens || 0) + (usage.cacheReadTokens || 0) + (usage.cacheWriteTokens || 0) : 0;
      const cacheHit = promptTokens > 0 ? Math.round(((usage.cacheReadTokens || 0) / promptTokens) * 1000) / 10 : undefined;
      const average = requestCount > 0 ? Math.round(total / requestCount) : undefined;
      const turns = sessionStats !== null && sessionStats !== undefined && Number.isFinite(sessionStats.turns) ? sessionStats.turns : undefined;
      const steps = sessionStats !== null && sessionStats !== undefined && Number.isFinite(sessionStats.steps) ? sessionStats.steps : undefined;
      const speed =
        sessionStats !== null && sessionStats !== undefined && Number.isFinite(sessionStats.decodeTokens) && Number.isFinite(sessionStats.decodeMs) && sessionStats.decodeMs > 0
          ? Math.round(sessionStats.decodeTokens / (sessionStats.decodeMs / 1000))
          : undefined;
      const duration = (ms) => {
        if (!Number.isFinite(ms) || ms <= 0) return undefined;
        if (ms < 1000) return t('tokens.duration.compactMs', { milliseconds: String(Math.round(ms)) });
        const seconds = ms / 1000;
        if (seconds < 60) return t('tokens.duration.compactSeconds', { seconds: String(Math.round(seconds * 10) / 10) });
        const totalSeconds = Math.round(seconds);
        const minutes = Math.floor(totalSeconds / 60);
        if (minutes < 60) return t('tokens.duration.compactMinutes', { minutes: String(minutes), seconds: String(totalSeconds % 60) });
        const hours = Math.floor(minutes / 60);
        return t('tokens.duration.compactHours', { hours: String(hours), minutes: String(minutes % 60) });
      };
      const llmTime = sessionStats === null || sessionStats === undefined ? undefined : duration(sessionStats.llmMs);
      const toolTime = sessionStats === null || sessionStats === undefined ? undefined : duration(sessionStats.toolMs);
      const ttft =
        sessionStats !== null && sessionStats !== undefined && Number.isFinite(sessionStats.ttftMs) && Number.isFinite(sessionStats.ttftSteps) && sessionStats.ttftSteps > 0
          ? duration(sessionStats.ttftMs / sessionStats.ttftSteps)
          : undefined;
      const detailItems = [
        { key: 'turnsSteps', label: t('tokens.stat.turnsSteps'), value: turns === undefined && steps === undefined ? undefined : (turns === undefined ? '—' : String(turns)) + ' / ' + (steps === undefined ? '—' : String(steps)) },
        { key: 'requests', label: t('tokens.stat.requests'), value: requestCount > 0 ? String(requestCount) : undefined },
        { key: 'cacheHit', label: t('tokens.stat.cacheHit'), value: cacheHit === undefined ? undefined : cacheHit + '%' },
        { key: 'average', label: t('tokens.stat.avg'), value: average === undefined || average <= 0 ? undefined : formatTokens(average) },
        { key: 'speed', label: t('tokens.stat.speed'), value: speed === undefined || speed <= 0 ? undefined : speed + ' tok/s' },
        { key: 'ttft', label: t('tokens.stat.ttft'), value: ttft },
        { key: 'llm', label: t('tokens.stat.llm'), value: llmTime },
        { key: 'tool', label: t('tokens.stat.tool'), value: toolTime }
      ].filter((item) => item.value !== undefined);

      const composeSegments = usage
        ? [
            { key: 'input', value: usage.uncachedInputTokens || 0, color: TOKEN_COLORS.input },
            { key: 'output', value: usage.outputTokens || 0, color: TOKEN_COLORS.output },
            { key: 'cacheRead', value: usage.cacheReadTokens || 0, color: TOKEN_COLORS.cacheRead },
            { key: 'cacheWrite', value: usage.cacheWriteTokens || 0, color: TOKEN_COLORS.cacheWrite }
          ].filter((segment) => segment.value > 0)
        : [];
      const composeTotal = composeSegments.reduce((sum, segment) => sum + segment.value, 0);
      const composeBar =
        composeTotal === 0
          ? null
          : h(
              'div',
              { className: 'aup-compose' },
              composeSegments.map((segment) =>
                h('span', {
                  key: segment.key,
                  className: 'aup-compose-seg',
                  title: formatTokens(segment.value),
                  style: { flexGrow: segment.value, background: segment.color }
                })
              )
            );

      const modelBlock =
        modelRows.length === 0
          ? null
          : h(
              'div',
              { className: 'aup-models' },
              modelRows.slice(0, 3).map((item) => {
                const text = modelRowLabel(item, t);
                return h(
                  'div',
                  { key: (item.provider || '') + '/' + item.model, className: 'aup-model-row', title: (item.provider === undefined ? '' : item.provider + ' / ') + item.model },
                  h('span', { className: 'aup-model-name' + modelRowLabelClass(text) }, text),
                  h('span', { className: 'aup-model-tokens' }, formatTokens(item.tokens))
                );
              }),
              modelRows.length > 3 ? h('span', { className: 'aup-model-more' }, t('tokens.moreModels', { count: String(modelRows.length - 3) })) : null
            );

      const contextParts = contextBreakdown === null || contextBreakdown === undefined
        ? []
        : [
            { key: 'system', label: t('tokens.breakdown.system'), value: Number.isFinite(contextBreakdown.systemTokens) ? contextBreakdown.systemTokens : 0, color: 'var(--dsw-static-neutral-bluish-400, #adb2b8)' },
            { key: 'tools', label: t('tokens.breakdown.tools'), value: Number.isFinite(contextBreakdown.toolsTokens) ? contextBreakdown.toolsTokens : 0, color: 'var(--dsw-static-violet-400, #a78bfa)' },
            { key: 'messages', label: t('tokens.breakdown.messages'), value: Number.isFinite(contextBreakdown.messageTokens) ? contextBreakdown.messageTokens : 0, color: 'var(--dsw-static-blue-450, #4d93f8)' }
          ].filter((part) => part.value > 0);
      const contextTotal = contextParts.reduce((sum, part) => sum + part.value, 0);
      const contextSegments = contextTotal > 0 ? contextParts : [];

      const sessionBody = h(
        'div',
        { className: 'aup-session-body' },
        h(
          'div',
          { className: 'aup-session-total' },
          h('span', { className: 'aup-session-total-label' }, t('tokens.total')),
          h('span', { className: 'aup-session-total-value' }, usage ? formatTokens(total) : '—')
        ),
        composeBar,
        detailRows.length === 0
          ? h(Hint, null, t('tokens.empty'))
          : h(
              'dl',
              { className: 'aup-session-grid' },
              detailRows.map((row) =>
                h(
                  'div',
                  { key: row.key, className: 'aup-session-cell' },
                  h(
                    'dt',
                    { className: 'aup-session-label' },
                    TOKEN_COLORS[row.key] === undefined ? null : h('span', { className: 'aup-token-dot', style: { background: TOKEN_COLORS[row.key] }, 'aria-hidden': true }),
                    row.label
                  ),
                  h('dd', { className: 'aup-session-value' }, formatTokens(row.value))
                )
              )
            ),
        detailItems.length === 0 ? null : h('span', { className: 'aup-session-sep aup-sep-stats', 'aria-hidden': true }),
        detailItems.length === 0
          ? null
          : h(
              'div',
              { className: 'aup-stat-list' },
              detailItems.map((item) =>
                h(
                  'div',
                  { key: item.key, className: 'aup-stat-row' },
                  h('span', { className: 'aup-stat-label' }, item.label),
                  h('span', { className: 'aup-stat-value' + statValueClass(item.value) }, item.value)
                )
              )
            ),
        modelBlock === null ? null : h('span', { className: 'aup-session-sep aup-sep-models', 'aria-hidden': true }),
        modelBlock,
        h('span', { className: 'aup-session-sep aup-sep-context', 'aria-hidden': true }),
        h(
          'div',
          { className: 'aup-context' },
          h(
            'div',
            { className: 'aup-context-head' },
            h('span', null, t('tokens.context')),
            h(
              'span',
              { className: 'aup-context-figures' },
              hasContext
                ? t('tokens.contextValue', { used: formatTokens(usedTokens), window: formatTokens(contextWindow), percent: String(percent) })
                : t('tokens.contextUnknown')
            )
          ),
          hasContext
            ? h(
                'div',
                { className: 'aup-bar', 'aria-hidden': true },
                contextSegments.length === 0
                  ? h('span', { className: 'aup-bar-fill', style: { width: percent + '%' } })
                  : h(
                      'span',
                      { className: 'aup-context-used', style: { width: percent + '%' } },
                      contextSegments.map((segment) => h('span', { key: segment.key, className: 'aup-context-seg', style: { flexGrow: segment.value, background: segment.color } }))
                    )
              )
            : null,
          contextSegments.length === 0
            ? null
            : h(
                'div',
                { className: 'aup-context-breakdown' },
                h(
                  'div',
                  { className: 'aup-context-legend' },
                  contextSegments.map((segment) => h('span', { key: segment.key, className: 'aup-context-legend-item' }, segment.label + ' ' + Math.round((segment.value / contextTotal) * 100) + '%'))
                )
              )
        )
      );

      return h(
        'section',
        { className: 'aup-card aup-card-session aup-card-session-fixed' },
        h(CardHead, { icon: ChatGlyph, title: t('tokens.title') }),
        h('span', { className: 'aup-divider', 'aria-hidden': true }),
        sessionBody
      );
    }

    /** Right-sidebar tab body. */
    function AccountUsageBody({ t: initialT, useProjection, readAccount, readUsage, readSessionModels, readProviderBalances, readLocale, subscribeLocale, bindTranslation, sessionId }) {
      const [account, setAccount] = React.useState({ phase: 'loading', result: undefined, refreshing: false });
      const [usage, setUsage] = React.useState({ phase: 'loading', days: [], ok: undefined, refreshing: false, dimension: DIMENSIONS[0].id });
      const [sessionModels, setSessionModels] = React.useState({ phase: 'idle', items: [], totalTokens: 0, lastProvider: '' });
      const [providerBalances, setProviderBalances] = React.useState({ phase: 'idle', byProvider: {} });
      const [settings, setSettings] = React.useState(readSettings);
      const [dimension, setDimension] = React.useState(settings.dimension);
      const [accountRequest, setAccountRequest] = React.useState({ count: 0, force: false });
      const [usageRequest, setUsageRequest] = React.useState({ count: 0, force: false });
      const [settingsOpen, setSettingsOpen] = React.useState(false);
      const gearRef = React.useRef(null);
      const [localeId, setLocaleId] = React.useState(readLocale);
      const [greetingSeed] = React.useState(() => Math.floor(Math.random() * 4));
      const t = React.useMemo(() => bindTranslation(), [bindTranslation, localeId]);
      const displayLocale = String(localeId).toLowerCase().startsWith('zh') ? localeId : 'en';
      const greeting = React.useMemo(() => greetingLine(new Date(), localeId, greetingSeed), [localeId, greetingSeed]);

      React.useEffect(() => {
        const update = () => setLocaleId(readLocale());
        update();
        return subscribeLocale(update);
      }, [readLocale, subscribeLocale]);
      const platformBusy = account.refreshing === true || usage.refreshing === true;
      const sessionProviders = [...new Set((sessionModels.items || []).map((item) => item.provider).filter((provider) => typeof provider === 'string' && provider !== ''))];
      const offAccountProviders = sessionProviders.filter((provider) => !isAccountProvider(provider));
      const offAccountLabel = [...new Set(offAccountProviders.map((provider) => providerLabel(provider, t)))].join(' / ');
      const offAccountAll = sessionProviders.length > 0 && offAccountProviders.length === sessionProviders.length;
      const busy = offAccountAll !== true && platformBusy;
      const accountSources = [
        ...sessionProviders
          .filter((provider) => isAccountProvider(provider))
          .map((provider) => ({ id: 'account', isAccount: true, provider })),
        ...offAccountProviders.map((provider) => ({ id: provider, isAccount: false, provider }))
      ];
      // The provider of the newest assistant message is the account in use; the
      // account card highlights its row instead of adding a status dot.
      const lastProvider = typeof sessionModels.lastProvider === 'string' ? sessionModels.lastProvider : '';
      const currentSource =
        lastProvider === '' ? undefined : isAccountProvider(lastProvider) ? 'account' : lastProvider;
      const providerSessionUsage = offAccountProviders.map((provider) => {
        const items = (sessionModels.items || []).filter((item) => item !== null && item !== undefined && item.provider === provider);
        return {
          provider,
          label: providerLabel(provider, t),
          tokens: items.reduce((sum, item) => sum + (Number.isFinite(item.tokens) ? item.tokens : 0), 0),
          requests: items.reduce((sum, item) => sum + (Number.isFinite(item.requests) ? item.requests : 0), 0)
        };
      });
      const cachedUsage = dimensionResults.get(dimension);
      /** Render the selected dimension's own data immediately; never bucket another dimension's days. */
      const displayedUsage =
        usage.dimension === dimension
          ? usage
          : cachedUsage === undefined
            ? { phase: 'loading', days: [], dimension, refreshing: true }
            : { phase: 'ready', ok: true, source: cachedUsage.source, days: cachedUsage.days, currency: cachedUsage.currency, reason: cachedUsage.reason, dimension, refreshing: true };
      const currencyRef = React.useRef('CNY');

      React.useEffect(() => {
        let cancelled = false;
        if (offAccountAll === true) return undefined;
        setAccount((previous) => ({
          ...previous,
          phase: previous.result === undefined ? 'loading' : previous.phase,
          refreshing: true
        }));
        readAccount(accountRequest.force)
          .then((result) => {
            if (cancelled) return;
            setAccount({ phase: 'ready', result, refreshing: false });
          })
          .catch((error) => {
            if (cancelled) return;
            setAccount({
              phase: 'error',
              result: { ok: false, message: String((error && error.message) || error || '') },
              refreshing: false
            });
          });
        return () => {
          cancelled = true;
        };
      }, [accountRequest.count, accountRequest.force, readAccount, offAccountAll]);

      React.useEffect(() => {
        let cancelled = false;
        if (offAccountAll === true) return undefined;
        const force = usageRequest.force;
        const cached = dimensionResults.get(dimension);
        // Show the dimension's previous result immediately (cached months make the
        // follow-up read cheap), so no loading frame replaces the chart.
        setUsage((previous) => {
          if (cached !== undefined) {
            return {
              phase: 'ready',
              ok: true,
              source: cached.source,
              days: cached.days,
              currency: cached.currency,
              reason: cached.reason,
              dimension,
              refreshing: true
            };
          }
          if (previous.dimension === dimension && previous.ok === true) {
            return { ...previous, refreshing: true };
          }
          return { phase: 'loading', ok: undefined, days: [], dimension, refreshing: true };
        });
        readUsage(dimension, force, currencyRef.current)
          .then((result) => {
            if (cancelled) return;
            if (result.ok === true) {
              const days = result.days || [];
              dimensionResults.set(dimension, {
                source: result.source,
                days,
                currency: result.currency,
                reason: result.reason
              });
              if (!dimensionsWarmed && result.source === 'platform') {
                dimensionsWarmed = true;
                const currentDimension = dimension;
                // Warm every other dimension so a later switch renders cached data
                // instead of a loading frame. Widest window first: the year pass fills
                // the month cache that all narrower windows reuse, so the rest is cheap.
                setTimeout(() => {
                  (async () => {
                    for (const warmId of WARM_ORDER) {
                      if (warmId === currentDimension || dimensionResults.has(warmId)) continue;
                      try {
                        const warm = await readUsage(warmId, false, currencyRef.current);
                        if (warm.ok === true && warm.source === 'platform' && !dimensionResults.has(warmId)) {
                          dimensionResults.set(warmId, {
                            source: warm.source,
                            days: warm.days || [],
                            currency: warm.currency,
                            reason: warm.reason
                          });
                        }
                      } catch (error) {
                        /* warm-up is best effort */
                      }
                    }
                  })();
                }, 1500);
              }
              setUsage((previous) => {
                if (previous.dimension !== dimension) return previous;
                if (previous.phase === 'ready' && sameDays(previous.days, days)) {
                  return { ...previous, source: result.source, currency: result.currency, reason: result.reason, refreshing: false };
                }
                return {
                  phase: 'ready',
                  ok: true,
                  source: result.source,
                  days,
                  currency: result.currency,
                  reason: result.reason,
                  dimension,
                  refreshing: false
                };
              });
            } else {
              setUsage((previous) => {
                if (previous.dimension !== dimension) return previous;
                if (previous.phase === 'ready') return { ...previous, refreshing: false };
                return { phase: 'error', ok: false, days: [], code: result.code, dimension, refreshing: false };
              });
            }
          })
          .catch((error) => {
            if (cancelled) return;
            setUsage((previous) => {
              if (previous.dimension !== dimension) return previous;
              if (previous.phase === 'ready') return { ...previous, refreshing: false };
              return {
                phase: 'error',
                ok: false,
                days: [],
                code: 'fetch_failed',
                message: String((error && error.message) || error || ''),
                dimension,
                refreshing: false
              };
            });
          });
        return () => {
          cancelled = true;
        };
      }, [usageRequest.count, usageRequest.force, dimension, readUsage, offAccountAll]);

      React.useEffect(() => {
        let cancelled = false;
        if (typeof sessionId !== 'string' || sessionId === '') {
          setSessionModels({ phase: 'empty', items: [], totalTokens: 0 });
          return undefined;
        }
        readSessionModels(sessionId)
          .then((result) => {
            if (cancelled) return;
            setSessionModels(
              result.ok === true
                ? { phase: 'ready', items: result.models, totalTokens: result.totalTokens, lastProvider: typeof result.lastProvider === 'string' ? result.lastProvider : '' }
                : { phase: 'empty', items: [], totalTokens: 0, lastProvider: '' }
            );
          })
          .catch((error) => {
            if (!cancelled) setSessionModels({ phase: 'empty', items: [], totalTokens: 0 });
          });
        return () => {
          cancelled = true;
        };
      }, [sessionId, usageRequest.count, usageRequest.force, readSessionModels]);

      const providerReads = React.useRef(new Map());
      const loadProviderBalance = (provider, force) => {
        const ticket = (providerReads.current.get(provider) || 0) + 1;
        providerReads.current.set(provider, ticket);
        setProviderBalances((previous) => {
          const byProvider = previous.byProvider || {};
          const old = byProvider[provider];
          return { phase: 'ready', byProvider: { ...byProvider, [provider]: old && old.phase === 'ready' ? { ...old, refreshing: true } : { phase: 'loading' } } };
        });
        Promise.resolve().then(() => readProviderBalances(provider, force))
          .catch(() => ({ ok: false, code: 'fetch_failed' }))
          .then((result) => {
            if (providerReads.current.get(provider) !== ticket) return;
            setProviderBalances((previous) => ({ phase: 'ready', byProvider: {
              ...previous.byProvider, [provider]: providerBalanceState(provider, result)
            } }));
          });
      };
      React.useEffect(() => {
        setProviderBalances((previous) => ({ phase: 'ready', byProvider: Object.fromEntries(
          offAccountProviders.map((provider) => [provider, previous.byProvider && previous.byProvider[provider]])
        ) }));
        for (const provider of offAccountProviders) loadProviderBalance(provider, usageRequest.force === true);
        return () => {
          // Invalidate in-flight reads on refresh, session change, or unmount.
          for (const [provider, ticket] of providerReads.current) providerReads.current.set(provider, ticket + 1);
        };
      }, [sessionId, offAccountProviders.join('|'), usageRequest.count, usageRequest.force, readProviderBalances]);

      // Account balances move slowly; refresh them rarely and never while the page is hidden.
      React.useEffect(() => {
        if (settings.autoRefresh !== true) return undefined;
        const tick = () => {
          if (typeof document !== 'undefined' && document.hidden === true) return;
          setAccountRequest((previous) => ({ count: previous.count + 1, force: false }));
        };
        const timer = setInterval(tick, ACCOUNT_REFRESH_MS);
        const onVisible = () => {
          if (typeof document === 'undefined' || document.hidden !== true) tick();
        };
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
        return () => {
          clearInterval(timer);
          if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
        };
      }, [settings.autoRefresh]);

      // Usage mostly resolves from the month cache; this keeps the live month fresh.
      React.useEffect(() => {
        if (settings.autoRefresh !== true) return undefined;
        const tick = () => {
          if (typeof document !== 'undefined' && document.hidden === true) return;
          setUsageRequest((previous) => ({ count: previous.count + 1, force: false }));
        };
        const timer = setInterval(tick, USAGE_REFRESH_MS);
        const onVisible = () => {
          if (typeof document === 'undefined' || document.hidden !== true) tick();
        };
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
        return () => {
          clearInterval(timer);
          if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
        };
      }, [settings.autoRefresh]);

      const refresh = () => {
        setAccountRequest((previous) => ({ count: previous.count + 1, force: true }));
        setUsageRequest((previous) => ({ count: previous.count + 1, force: true }));
      };

      /** Merge one display-settings patch; a range change also applies to the open panel. */
      const applySettings = (patch) => {
        setSettings((previous) => ({
          ...previous,
          ...patch,
          cards: { ...previous.cards, ...(patch.cards === undefined ? {} : patch.cards) }
        }));
        if (patch.dimension !== undefined) setDimension(patch.dimension);
      };
      const resetSettings = () => {
        setSettings(DEFAULT_SETTINGS);
        setDimension(DEFAULT_SETTINGS.dimension);
      };

      React.useEffect(() => {
        writeSettings(settings);
      }, [settings]);

      const rootRef = React.useRef(null);
      React.useEffect(() => {
        const node = rootRef.current;
        if (node === null || node === undefined || typeof ResizeObserver !== 'function') return undefined;
        let timer = null;
        let pressed = false;
        let correcting = false;
        const tooNarrow = () => {
          const width = node.getBoundingClientRect().width;
          return Number.isFinite(width) && width > 0 && width < PANEL_MIN_WIDTH - 2;
        };
        const correct = () => {
          if (correcting || pressed || !tooNarrow()) return;
          correcting = true;
          resizeRightbarTo(PANEL_MIN_WIDTH);
          setTimeout(() => {
            correcting = false;
          }, 800);
        };
        const schedule = () => {
          if (timer !== null) clearTimeout(timer);
          timer = setTimeout(() => {
            timer = null;
            correct();
          }, 240);
        };
        const onPointerDown = () => {
          pressed = true;
          if (timer !== null) {
            clearTimeout(timer);
            timer = null;
          }
        };
        const onPointerUp = () => {
          pressed = false;
          schedule();
        };
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
          window.addEventListener('pointerdown', onPointerDown, true);
          window.addEventListener('pointerup', onPointerUp, true);
          window.addEventListener('pointercancel', onPointerUp, true);
        }
        const observer = new ResizeObserver(() => {
          if (pressed) return;
          if (tooNarrow()) schedule();
        });
        observer.observe(node);
        return () => {
          observer.disconnect();
          if (timer !== null) clearTimeout(timer);
          if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
            window.removeEventListener('pointerdown', onPointerDown, true);
            window.removeEventListener('pointerup', onPointerUp, true);
            window.removeEventListener('pointercancel', onPointerUp, true);
          }
        };
      }, []);

      React.useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        const node = rootRef.current;
        if (node === null || node === undefined) return undefined;
        // The panel rule continues the conversation header rule: measure where that
        // header ends and match the band height so the two rules form one line.
        // Find the conversation header rule: the first element near the top of the chat
        // pane that actually paints a bottom border. Slot wrappers may be display:contents
        // (zero rect), so relying on their geometry alone is unreliable.
        const anchorOf = () => {
          const chat = document.querySelector('[data-phase="active"], [data-phase="hero"], [data-phase="settling"]');
          if (chat === null || chat === undefined) return undefined;
          const chatTop = chat.getBoundingClientRect().top;
          const queue = [chat];
          let inspected = 0;
          while (queue.length > 0 && inspected < 80) {
            const element = queue.shift();
            inspected += 1;
            const rect = element.getBoundingClientRect();
            if (rect.width > 120 && rect.height > 0 && rect.bottom - chatTop < 160) {
              const style = window.getComputedStyle(element);
              const borderWidth = Number.parseFloat(style.borderBottomWidth || '0');
              if (borderWidth > 0) return rect.bottom;
            }
            for (const child of element.children) queue.push(child);
          }
          const slot = document.querySelector('[data-slot="conversation.header"]');
          if (slot !== null && slot !== undefined) {
            const rect = slot.getBoundingClientRect();
            if (rect.height > 0) return rect.bottom;
          }
          return undefined;
        };
        const apply = () => {
          const anchorY = anchorOf();
          if (!Number.isFinite(anchorY)) return;
          const top = node.getBoundingClientRect().top;
          const height = Math.round(anchorY - top);
          if (!Number.isFinite(height) || height < 14 || height > 240) return;
          node.style.setProperty('--aup-head-h', height + 'px');
        };
        apply();
        const timers = [setTimeout(apply, 240), setTimeout(apply, 900), setTimeout(apply, 1600)];
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('resize', apply);
        return () => {
          for (const timer of timers) clearTimeout(timer);
          if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') window.removeEventListener('resize', apply);
        };
      }, []);

      React.useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        const root = document.documentElement;
        if (root === null || root === undefined) return undefined;
        if (settings.hideComposerStats === true) root.setAttribute('data-account-usage-hide-stats', '');
        else root.removeAttribute('data-account-usage-hide-stats');
        return () => root.removeAttribute('data-account-usage-hide-stats');
      }, [settings.hideComposerStats]);

      /** Close the dialog and hand focus back to the trigger. */
      const closeSettings = () => {
        setSettingsOpen(false);
        if (gearRef.current !== null && gearRef.current !== undefined && typeof gearRef.current.focus === 'function') gearRef.current.focus();
      };

      React.useEffect(() => {
        if (settingsOpen !== true) return undefined;
        const onKeyDown = (event) => {
          if (event.key === 'Escape') closeSettings();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
      }, [settingsOpen]);

      const accountResult = account.result;
      const accountLocale = accountResult === undefined ? undefined : accountResult.locale;
      const wallets =
        accountResult !== undefined &&
        accountResult.balance !== null &&
        accountResult.balance !== undefined &&
        accountResult.balance.status === 'ready' &&
        Array.isArray(accountResult.balance.value)
          ? accountResult.balance.value
          : [];
      const currency =
        wallets.length > 0 && typeof wallets[0].currency === 'string' ? wallets[0].currency : 'CNY';
      currencyRef.current = currency;

      return h(
        'div',
        { className: 'aup-root' + (offAccountAll === true ? ' aup-provider-mode' : ''), ref: rootRef },
        h(
          'header',
          { className: 'aup-head', 'aria-label': t('panel.title') },
          h(
            'div',
            { className: 'aup-head-actions aup-head-left' },
            h(
              'button',
              {
                type: 'button',
                className: 'aup-icon-button',
                title: t('settings.aria'),
                'aria-label': t('settings.aria'),
                'aria-haspopup': 'dialog',
                'aria-expanded': settingsOpen === true,
                'data-active': settingsOpen === true ? true : undefined,
                onClick: () => setSettingsOpen((open) => open !== true),
                ref: gearRef
              },
              h(SettingsGlyph)
            )
          ),
          h('span', { className: 'aup-head-greeting' }, greeting),
          h(
            'div',
            { className: 'aup-head-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'aup-icon-button',
                title: t('refresh.aria'),
                'aria-label': t('refresh.aria'),
                disabled: busy,
                'aria-busy': busy === true,
                onClick: refresh
              },
              h(RefreshGlyph, { className: busy ? 'aup-spin' : undefined })
            )
          )
        ),
        settingsOpen === true
          ? h('div', { className: 'aup-pop-backdrop', onClick: closeSettings })
          : null,
        settingsOpen === true
          ? h(SettingsPanel, { settings, onChange: applySettings, onReset: resetSettings, onClose: closeSettings, t })
          : null,
        h(
          'div',
          { className: 'aup-cards', 'data-source-count': Math.max(1, sessionProviders.length) },
          settings.cards.session === true ? h(TokenSection, { useProjection, t, sessionModels }) : null,
          settings.cards.stats === true
          ? h(UsageSection, {
              state: displayedUsage,
              dimension,
              onDimension: (next) => setDimension(next),
              t,
              fallbackCurrency: currency,
              locale: displayLocale,
              showCost: settings.showCost,
              listMode: settings.usageList === true,
              categories: providerSessionUsage,
              sessionOnly: offAccountAll === true
            })
          : null,
          settings.cards.account === true
          ? h(AccountSection, {
              state: account,
              t,
              providerBalances,
              sources: accountSources,
              currentSource,
              locale: displayLocale
            })
          : null,
          settings.cards.session !== true && settings.cards.stats !== true && settings.cards.account !== true
          ? h('div', { className: 'aup-empty' }, t('settings.allHidden'))
          : null
        )
      );
    }

    /**
     * Best-effort narrow right sidebar: the host exposes no width API, so drive
     * its own resize handle to the contract minimum before/while the panel opens.
     * The handle is found by a stable data attribute and every step degrades
     * silently when the host markup or pointer support is unavailable.
     */
    /**
     * Drive the host's own right-sidebar resize handle to a target width. The host
     * exposes no width API, so this replays the pointer gesture it listens for; every
     * step degrades silently when the host markup or pointer support is unavailable.
     */
    function resizeRightbarTo(targetWidth) {
      if (typeof document === 'undefined') return false;
      let applied = false;
      const attempt = (tries) => {
        if (applied) return;
        const handle = document.querySelector('[data-side="rightbar"]');
        if (handle === null || handle === undefined) {
          if (tries < 20 && typeof setTimeout === 'function') setTimeout(() => attempt(tries + 1), 120);
          return;
        }
        try {
          const frame = handle.parentElement;
          if (frame === null || frame === undefined) return;
          const frameWidth = frame.getBoundingClientRect().width;
          const left = Number.parseFloat(handle.style.left);
          const current = Number.isFinite(left) && frameWidth > 0 ? frameWidth - left : handle.getBoundingClientRect().left;
          if (!Number.isFinite(current) || current <= 0) return;
          const delta = current - targetWidth;
          if (Math.abs(delta) < 4) return;
          if (typeof PointerEvent !== 'function') return;
          const rect = handle.getBoundingClientRect();
          const startX = rect.left + rect.width / 2;
          const startY = rect.top + rect.height / 2;
          const setCapture = handle.setPointerCapture;
          const hasCapture = handle.hasPointerCapture;
          const releaseCapture = handle.releasePointerCapture;
          handle.setPointerCapture = () => {};
          handle.hasPointerCapture = () => false;
          handle.releasePointerCapture = () => {};
          const fire = (type, clientX) =>
            handle.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                pointerId: 1,
                isPrimary: true,
                button: 0,
                buttons: 1,
                clientX,
                clientY: startY,
                pointerType: 'mouse'
              })
            );
          try {
            fire('pointerdown', startX);
            fire('pointermove', startX + delta);
            fire('pointerup', startX + delta);
          } finally {
            handle.setPointerCapture = setCapture;
            handle.hasPointerCapture = hasCapture;
            handle.releasePointerCapture = releaseCapture;
          }
          applied = true;
        } catch (error) {
          /* host-internal detail: leave the current width */
        }
      };
      attempt(0);
      return true;
    }

    /** Tab chip: wallet glyph plus the short tab title (never the cached long title). */
    function AccountUsageTitle({ useTabInfo, t }) {
      const info = useTabInfo();
      const label = typeof t === 'function' ? t('tab.title') : info.tab.title;
      return h(React.Fragment, null, h(WalletGlyph, { size: 14, className: 'aup-tab-icon' }), label);
    }

    // ----------------------------------------------------------------- apply --

    /** 24 solar terms: century C constants (21st century) with zh/en labels. */
    const SOLAR_TERMS = [
      { c: 5.4055, zh: '小寒', en: 'Minor Cold' },
      { c: 20.12, zh: '大寒', en: 'Major Cold' },
      { c: 3.87, zh: '立春', en: 'Start of Spring' },
      { c: 18.73, zh: '雨水', en: 'Rain Water' },
      { c: 5.63, zh: '惊蛰', en: 'Awakening of Insects' },
      { c: 20.646, zh: '春分', en: 'Spring Equinox' },
      { c: 4.81, zh: '清明', en: 'Pure Brightness' },
      { c: 20.1, zh: '谷雨', en: 'Grain Rain' },
      { c: 5.52, zh: '立夏', en: 'Start of Summer' },
      { c: 21.04, zh: '小满', en: 'Grain Buds' },
      { c: 5.678, zh: '芒种', en: 'Grain in Ear' },
      { c: 21.37, zh: '夏至', en: 'Summer Solstice' },
      { c: 7.108, zh: '小暑', en: 'Minor Heat' },
      { c: 22.83, zh: '大暑', en: 'Major Heat' },
      { c: 7.5, zh: '立秋', en: 'Start of Autumn' },
      { c: 23.13, zh: '处暑', en: 'End of Heat' },
      { c: 7.646, zh: '白露', en: 'White Dew' },
      { c: 23.042, zh: '秋分', en: 'Autumn Equinox' },
      { c: 8.318, zh: '寒露', en: 'Cold Dew' },
      { c: 23.438, zh: '霜降', en: 'Frost Descent' },
      { c: 7.438, zh: '立冬', en: 'Start of Winter' },
      { c: 22.36, zh: '小雪', en: 'Minor Snow' },
      { c: 7.18, zh: '大雪', en: 'Major Snow' },
      { c: 21.94, zh: '冬至', en: 'Winter Solstice' }
    ];

    /** Solar term that falls on this date, if any. */
    function solarTermOf(date) {
      const short = date.getFullYear() % 100;
      const month = date.getMonth();
      const day = date.getDate();
      for (let index = 0; index < SOLAR_TERMS.length; index += 1) {
        if (Math.floor(index / 2) !== month) continue;
        const term = SOLAR_TERMS[index];
        const termDay = Math.floor(short * 0.2422 + term.c) - Math.floor(short / 4);
        if (termDay === day) return term;
      }
      return undefined;
    }

    /** Lunar month/day of a Gregorian date, when the runtime ships a Chinese calendar. */
    function lunarMonthDay(date) {
      try {
        const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' }).formatToParts(date);
        let month = '';
        let day = 0;
        for (const part of parts) {
          if (part.type === 'month') month = part.value.replace(/^闰/u, '');
          if (part.type === 'day') day = Number.parseInt(part.value, 10);
        }
        if (month === '' || !Number.isFinite(day)) return undefined;
        return { month, day };
      } catch (error) {
        return undefined;
      }
    }

    /** Festivals: fixed-date holidays first, then the lunar ones. */
    function festivalOf(date, zh) {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      if (month === 1 && day === 1) return zh ? '元旦' : "New Year's Day";
      if (month === 5 && day >= 1 && day <= 5) return zh ? '劳动节' : 'Labour Day';
      if (month === 10 && day >= 1 && day <= 7) return zh ? '国庆节' : 'National Day';
      const lunar = lunarMonthDay(date);
      if (lunar === undefined) return undefined;
      if (lunar.month === '正月' && lunar.day === 1) return zh ? '春节' : 'Spring Festival';
      if (lunar.month === '正月' && lunar.day === 15) return zh ? '元宵节' : 'Lantern Festival';
      if (lunar.month === '五月' && lunar.day === 5) return zh ? '端午节' : 'Dragon Boat Festival';
      if (lunar.month === '七月' && lunar.day === 7) return zh ? '七夕' : 'Qixi Festival';
      if (lunar.month === '八月' && lunar.day === 15) return zh ? '中秋节' : 'Mid-Autumn Festival';
      if (lunar.month === '九月' && lunar.day === 9) return zh ? '重阳节' : 'Double Ninth Festival';
      const next = lunarMonthDay(new Date(date.getTime() + 86400000));
      if (next !== undefined && next.month === '正月' && next.day === 1) return zh ? '除夕' : "Lunar New Year's Eve";
      return undefined;
    }

    /** Time-of-day greeting words. */
    function daypartGreeting(hour, zh) {
      if (hour < 5) return zh ? '凌晨好' : 'Late night';
      if (hour < 9) return zh ? '早上好' : 'Good morning';
      if (hour < 11) return zh ? '上午好' : 'Good morning';
      if (hour < 13) return zh ? '中午好' : 'Good midday';
      if (hour < 17) return zh ? '下午好' : 'Good afternoon';
      if (hour < 19) return zh ? '傍晚好' : 'Good evening';
      if (hour < 22) return zh ? '晚上好' : 'Good evening';
      return zh ? '夜深了' : 'Working late';
    }

    /** One short friendly header line: solar term > holiday > time of day. */
    function greetingLine(date, locale, seed) {
      const zh = String(locale || '').toLowerCase().startsWith('zh');
      const wishes = zh ? ['', '愿你今天顺顺利利', '记得照顾好自己', '慢慢来，比较快'] : ['', 'Have a good one', 'Take it easy'];
      const wish = wishes[Math.abs(seed) % wishes.length];
      const term = solarTermOf(date);
      if (term !== undefined) {
        const name = zh ? term.zh : term.en;
        if (wish === '') return zh ? '今日' + name : 'Today: ' + name;
        return zh ? '今日' + name + ' · ' + wish : name + ' · ' + wish;
      }
      const festival = festivalOf(date, zh);
      if (festival !== undefined) {
        if (wish === '') return zh ? festival + '快乐' : festival + ' today';
        return zh ? festival + '快乐 · ' + wish : festival + ' · ' + wish;
      }
      const greeting = daypartGreeting(date.getHours(), zh);
      if (wish === '') return greeting;
      return zh ? greeting + ' · ' + wish : greeting + ', ' + wish;
    }

    /** Client plugin body. */
    function apply(ctx) {
      const dictionaries = { zh, en, ja: en, es: en, fr: en, de: en, ru: en, pt: en };
      ctx.effect(() => ctx.locale.register(NS, dictionaries), 'account-usage: dictionaries');

      ctx.effect(
        () => {
          if (typeof document === 'undefined' || typeof document.createElement !== 'function' || document.head === undefined || document.head === null) {
            return undefined;
          }
          const tagId = 'dsh-account-usage';
          let tag = document.querySelector('style[data-plugin-css="' + tagId + '"]');
          if (tag === null || tag === undefined) {
            tag = document.createElement('style');
            tag.dataset.plugin = 'dsh-account-usage';
            tag.dataset.pluginCss = tagId;
            document.head.appendChild(tag);
          }
          if (tag.textContent !== CSS) tag.textContent = CSS;
          return () => {
            if (tag !== null && tag !== undefined && tag.parentElement !== null) tag.parentElement.removeChild(tag);
          };
        },
        'account-usage: stylesheet'
      );

      ctx.effect(
        () => {
          if (typeof document === 'undefined') return undefined;
          const root = document.documentElement;
          if (root === null || root === undefined) return undefined;
          if (readSettings().hideComposerStats === true) root.setAttribute('data-account-usage-hide-stats', '');
          return () => root.removeAttribute('data-account-usage-hide-stats');
        },
        'account-usage: composer stats visibility'
      );

      const t = ctx.locale.bind(NS);
      const readLocale = () => ctx.locale.getSnapshot().active;
      const subscribeLocale = (listener) => ctx.locale.subscribe(listener);
      const bindTranslation = () => ctx.locale.bind(NS);
      const readAccount = createAccountReader(ctx);
      const readUsage = createUsageReader(ctx);
      const readSessionModels = createSessionModelReader();
      const readProviderBalances = createProviderBalanceReader();

      const openPanel = () => {
        try {
          if (ctx.sidebarRight.mounted.getSnapshot() === undefined) return;
          ctx.sidebarRight.openTab(KIND);
          // Never resize on our own: only nudge a sidebar that is too narrow to read.
          widenIfNeeded();
        } catch (error) {
          console.error('[account-usage] opening the account usage tab failed', error);
        }
      };

      ctx.effect(
        () =>
          ctx.sidebarRightTabs.register({
            id: ID,
            kind: KIND,
            priority: 'extension',
            title: () => t('tab.title'),
            guide: [
              {
                id: 'account-usage',
                order: 40,
                commandId: SHORTCUT_ID,
                title: () => t('guide.title'),
                description: () => t('guide.description'),
                icon: WalletGlyph
              }
            ]
          }),
        'account-usage: tab type'
      );

      ctx.effect(
        () =>
          ctx.slots.inject('sidebar.right.pane.tab', () =>
            ctx.slots.register(
              {
                name: 'sidebar.right.pane.tab',
                key: ID,
                locale: NS,
                inject: () => ({ readAccount, readUsage, readSessionModels, readProviderBalances, readLocale, subscribeLocale, bindTranslation })
              },
              AccountUsageBody
            )
          ),
        'account-usage: tab body'
      );

      ctx.effect(
        () =>
          ctx.slots.inject('sidebar.right.pane.tab.title', () =>
            ctx.slots.register(
              {
                name: 'sidebar.right.pane.tab.title',
                key: ID,
                inject: () => ({ t: bindTranslation() })
              },
              AccountUsageTitle
            )
          ),
        'account-usage: tab title'
      );

      ctx.inject(['shortcuts'], (shortcutCtx) => {
        shortcutCtx.effect(() => {
          try {
            return shortcutCtx.shortcuts.register({
              id: SHORTCUT_ID,
              label: () => t('shortcut.open'),
              aliases: ['account usage', 'usage', '用量'],
              defaults: {
                'desktop:macos': { code: 'KeyU', modifiers: ['primary'] },
                'desktop:windows': { code: 'KeyU', modifiers: ['primary'] },
                'desktop:linux': { code: 'KeyU', modifiers: ['primary'] },
                'web:macos': { code: 'KeyU', modifiers: ['primary', 'alt'] },
                'web:windows': { code: 'KeyU', modifiers: ['primary', 'alt'] }
              },
              regions: ['page', 'editable', 'terminal'],
              modals: [],
              resolve: () => {
                if (ctx.sidebarRight.mounted.getSnapshot() === undefined) {
                  return { status: 'blocked', reason: t('shortcut.noSession') };
                }
                return { status: 'handled', run: () => openPanel() };
              }
            });
          } catch (error) {
            console.error('[account-usage] shortcut registration failed', error);
            return undefined;
          }
        }, 'account-usage: open shortcut');
      });
    }

    return {
      inject: [
        'slots',
        'locale',
        'sidebarRight',
        'sidebarRightTabs',
        'remote',
        'remote.account',
        'remote.session'
      ],
      apply
    };
  }
});
