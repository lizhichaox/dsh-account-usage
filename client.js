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
    // The quick-action cluster next to the traffic lights renders the usage entry with
    // the shipped gauge glyph; the tab chip uses the same one so both entries read as
    // the same feature (user 2026-11-09). Primitives are host-provided like react.
    let GaugeIcon = null;
    try {
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
      if (primitives !== null && primitives !== undefined && typeof primitives.IconGaugeOutlineRegular === 'function') {
        GaugeIcon = primitives.IconGaugeOutlineRegular;
      }
    } catch (error) {
      GaugeIcon = null;
    }

    /** Module identity: the tab type id and the slot cell key collide by design. */
    const ID = 'dsh-account-usage';
    /** The page kind users open through the guide card or the foot action. */
    const KIND = 'account-usage';
    /** This plugin's Client locale namespace. */
    const NS = 'accountUsage';
    /** How often the account wallet is re-read while the panel stays mounted and visible. */
    const ACCOUNT_REFRESH_MS = 5 * 60 * 1000;

    /** Display preferences persisted by the browser, so the panel needs no Host configuration. */
    const SETTINGS_KEY = 'dsh.account-usage.settings.v1';
    const DEFAULT_SETTINGS = {
      autoRefresh: true,
      hideComposerStats: true
    };

    /** Read persisted preferences, falling back to defaults on any malformed or unknown value. */
    function readSettings() {
      try {
        const raw = globalThis.localStorage === undefined ? null : globalThis.localStorage.getItem(SETTINGS_KEY);
        if (raw === null || raw === undefined) return DEFAULT_SETTINGS;
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object') return DEFAULT_SETTINGS;
        // `dimension` / `showCost` / `usageList` / `cards.*` from older versions are
        // simply ignored: the cards are no longer configurable (user 2026-11-09:
        // 这两项配置删掉 就俩卡片 没有配置的必要).
        return {
          autoRefresh: typeof parsed.autoRefresh === 'boolean' ? parsed.autoRefresh : DEFAULT_SETTINGS.autoRefresh,
          hideComposerStats: typeof parsed.hideComposerStats === 'boolean' ? parsed.hideComposerStats : DEFAULT_SETTINGS.hideComposerStats
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
      'error': '读取账号信息失败',
      'retry': '重试',
      'settings.aria': '设置',
      'settings.title': '设置',
      'settings.autoRefresh': '自动刷新',
      'settings.autoRefreshHint': '余额每 5 分钟自动刷新',
      'settings.hideComposerStats': '隐藏底栏会话统计',
      'settings.reset': '恢复默认',
      'settings.close': '关闭',
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
      'balance.bonus': '赠送额度',
      'balance.failed': '余额读取失败',
      'balance.empty': '暂无余额数据',
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
      'tokens.contextValue': '{used}/{window}（{percent}%）',
      'tokens.contextUnknown': '暂无上下文数据',
      'tokens.stat.requests': '请求次数',
      'tokens.stat.cacheHit': '缓存命中',
      'tokens.stat.avg': '平均',
      'tokens.stat.turnsSteps': '轮/步',
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
      'account.planRolling': '5H',
      'account.planWeekly': 'WE',
      'account.planMonthly': 'MO',
      'account.creditsLabel': '额度',
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
      'error': 'Could not read account information',
      'retry': 'Retry',
      'settings.aria': 'Settings',
      'settings.title': 'Settings',
      'settings.autoRefresh': 'Auto refresh',
      'settings.autoRefreshHint': 'Balance refreshes every 5 min',
      'settings.hideComposerStats': 'Hide composer stats',
      'settings.reset': 'Reset to defaults',
      'settings.close': 'Close',
      'account.title': 'Account balance',
      'account.signedOut': 'No DeepSeek API account is signed in',
      'account.signedOutHint': 'Sign in via Settings to see the balance',
      'balance.recharge': 'Bal',
      'provider.deepseekAccount': 'DeepSeek API',
      'provider.deepseekApiKey': 'DeepSeek API key',
      'balance.used': 'Used',
      'account.status.loading': 'Loading',
      'account.status.signedOut': 'Signed out',
      'account.bonusLabel': 'Bon',
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
      'balance.bonus': 'Bonus credit',
      'balance.failed': 'Could not read the balance',
      'balance.empty': 'No balance data yet',
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
      'tokens.contextValue': '{used}/{window} ({percent}%)',
      'tokens.contextUnknown': 'No context data yet',
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
      'account.planRolling': '5H',
      'account.planWeekly': 'WE',
      'account.planMonthly': 'MO',
      'account.creditsLabel': 'CR',
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
      '.aup-pop-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:26px}',
      '.aup-pop-row>span{font-size:var(--aup-fs-text);line-height:16px;font-weight:500;color:var(--dsw-alias-label-primary);white-space:nowrap}',
      '.aup-pop-hint{font-size:var(--aup-fs-text);line-height:18px;color:var(--aup-label-2);white-space:nowrap;overflow:visible;text-overflow:clip}',
      '.aup-pop-sep{flex:none;height:1px;margin:2px 0;background:var(--dsw-alias-border-l2)}',
      '.aup-pop-foot{display:flex;justify-content:flex-end;padding-top:2px}',
      '.aup-pop-link{padding:0;border:none;background:transparent;color:var(--aup-label-2);font:inherit;font-size:var(--aup-fs-text);line-height:18px;cursor:pointer}',
      '.aup-pop-link:hover{color:var(--dsw-alias-label-primary)}',
      '.aup-toggle{position:relative;flex:none;width:34px;height:20px;padding:0;border:none;border-radius:999px;background:var(--dsw-alias-bg-skeleton);cursor:pointer;transition:background-color .15s}',
      '.aup-toggle[data-on]{background:var(--dsw-alias-brand-primary)}',
      '.aup-toggle-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 2px color-mix(in srgb,var(--dsw-alias-label-primary) 20%,transparent);transition:transform .15s}',
      '.aup-toggle[data-on] .aup-toggle-knob{transform:translateX(14px)}',
      '.aup-toggle:focus-visible,.aup-pop-link:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.aup-icon-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.aup-spin{animation:aup-spin 1s linear infinite}',
      // Motion is decoration only: honour the preference everywhere.
      '@media (prefers-reduced-motion:reduce){.aup-toggle,.aup-toggle-knob,.aup-icon-button,.aup-pop-link{transition:none}.aup-spin{animation:none}}',
      '@keyframes aup-spin{to{transform:rotate(360deg)}}',
      '.aup-cards{flex:1 1 auto;min-height:0;width:100%;display:flex;flex-direction:column;justify-content:flex-start;gap:6px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;-ms-overflow-style:none}',
      '.aup-cards>.aup-card-session-fixed{flex:3 1 auto;min-height:auto}',
      '.aup-cards::-webkit-scrollbar{width:0;height:0;display:none}',
      '.aup-card{flex:0 0 auto;min-height:auto;display:flex;flex-direction:column;gap:10px;padding:12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);overflow:visible}',
      '.aup-card-session{justify-content:flex-start}',
      
      '.aup-card-account{flex:1 1 auto;min-height:auto;justify-content:flex-start}',
      '.aup-account-body{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;justify-content:flex-start;gap:6px}',
      // Mixed sessions: one aligned row per source, using the statistics table rhythm.
      // Every source is visible at once, so there is nothing to switch and no reserved blank.
      // The balance card takes its own share of the leftover height: the rows spread
      // evenly inside it (never one big void) so the bottom card breathes like the top.
      '.aup-acct-srcs{display:grid;grid-template-columns:minmax(0,max-content) minmax(0,1fr);align-content:space-evenly;flex:1 1 auto;min-height:0;column-gap:6px;row-gap:4px}',
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
      // Every pair keeps a visible gap before the NEXT pair's label (user 2026-11-09:
      // 「Bonus 前面加个空格」) - the column gap must survive the negative letter-spacing
      // of the tight step, which eats into the preceding glyph's trailing space.
      // Pairs must stay legible (user 2026-11-09: 「数字重叠严重」「比例也看不清」):
      // no negative letter-spacing at comfortable widths, and a real gap both between a
      // label and its own figure and between one pair and the next. The panel is wide
      // enough here; the tiers below give the space back only as the pane narrows.
      '.aup-acct-pairs{display:inline-flex;flex-wrap:wrap;justify-content:flex-end;gap:2px 12px;letter-spacing:normal}',
      // Worst-case figures (three `100%`, or two windows plus a wide credit amount) get
      // one more deterministic step everywhere, not only in the ultra-narrow tier: the
      // Command Code row adds a third pair and must stay single-line at 340px.
      '.aup-acct-pairs.aup-acct-pairs-tight{column-gap:10px}',
      '.aup-acct-pair{display:inline-flex;align-items:baseline;gap:5px;white-space:nowrap}',
      '.aup-acct-pair-label{color:var(--aup-label-2);font-weight:500}',
      '.aup-acct-label{min-width:0;color:var(--aup-label-2);overflow-wrap:anywhere}',
      '.aup-card-head{position:relative;display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;flex:none}',
      '.aup-card-head-main{display:inline-flex;align-items:center;gap:6px;min-width:0;justify-content:center}',
      '.aup-card-head-extra{position:absolute;right:0;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;max-width:45%}',
      '.aup-divider{display:block;height:1px;flex:none;margin:0;background:var(--dsw-alias-border-l2)}',
      '.aup-card-icon{display:inline-flex;flex:none;color:var(--dsw-alias-label-secondary)}',
      '@keyframes aup-shimmer{0%{background-position:100% 0}100%{background-position:0 0}}',
      '.aup-card-title{margin:0;font-size:var(--aup-fs-text);font-weight:500;line-height:18px;color:var(--aup-label-2);white-space:nowrap}',

      '.aup-hint{margin:0;font-size:var(--aup-fs-text);line-height:18px;font-weight:500;color:var(--aup-label-2);white-space:normal;overflow:visible}',
      '.aup-error{margin:0;font-size:var(--aup-fs-text);line-height:18px;color:var(--dsw-alias-state-error-primary);white-space:normal;overflow:visible}',
      '.aup-card-session-fixed{flex:1 1 auto;min-height:auto}',
      '.aup-card-session .aup-session-body{flex:1 1 auto;min-height:auto;display:flex;flex-direction:column;gap:4px;justify-content:space-evenly}',
      '.aup-card-session .aup-session-grid{flex:0 0 auto;display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;align-content:space-evenly;justify-items:stretch;margin:0;padding:0;width:100%}',
      '.aup-card-session .aup-session-cell{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0;text-align:left}',
      '.aup-card-session .aup-session-cell:nth-child(even){align-items:flex-end;text-align:right}',
      '.aup-models{display:flex;flex-direction:column;gap:0;flex:none;min-height:0}',
      // Per-provider session totals: one shared parent grid, every row inherits its
      // columns through subgrid, so names start on one line and figures end on one
      // (same rule as the balance rows - never one grid-template per row).
      '.aup-providers{display:grid;grid-template-columns:minmax(0,max-content) minmax(0,1fr);align-content:start;column-gap:6px;row-gap:2px;flex:none;min-height:0}',
      '.aup-provider-row{display:grid;grid-template-columns:subgrid;grid-column:1/-1;align-items:center;min-width:0;font-size:var(--aup-fs-text);line-height:17px;font-variant-numeric:tabular-nums}',
      '.aup-provider-name{min-width:0;font-size:var(--aup-fs-text);line-height:17px;white-space:normal;overflow-wrap:anywhere;color:var(--aup-label-2)}',
      '.aup-provider-tokens{justify-self:end;min-width:0;font-weight:500;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}',
      '.aup-model-row{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:2px 10px;min-width:0;font-size:var(--aup-fs-text);line-height:17px;font-variant-numeric:tabular-nums}',
      '.aup-model-name{flex:1 1 auto;min-width:0;font-size:var(--aup-fs-text);line-height:17px;white-space:normal;overflow-wrap:anywhere;color:var(--aup-label-2)}',
                  '.aup-model-tokens{flex:none;margin-left:auto;font-weight:500;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}',
      '.aup-token-dot{flex:none;width:6px;height:6px;border-radius:2px}',
      '.aup-stat-list{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:1px 20px}',
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
      '.aup-context-legend{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:baseline;column-gap:12px;row-gap:2px;font-size:var(--aup-fs-text);line-height:18px;font-weight:500;color:var(--aup-label-2);font-variant-numeric:tabular-nums}',
      '.aup-context-legend>span:nth-child(1){justify-self:start;text-align:left}',
      '.aup-context-legend>span:nth-child(2){justify-self:center;text-align:center}',
      '.aup-context-legend>span:nth-child(3){justify-self:end;text-align:right}',
      '.aup-card-account-provider{flex:1 1 auto;min-height:auto;justify-content:flex-start}',
      '.aup-value-long{letter-spacing:-.02em}',
      '.aup-value-longer{letter-spacing:-.04em}',
      '.aup-card-session .aup-session-label{display:flex;align-items:center;gap:5px;margin:0;font-size:var(--aup-fs-text);line-height:16px;font-weight:500;color:var(--aup-label-2);white-space:nowrap}',
      '.aup-card-session .aup-session-value{margin:0;font-size:var(--aup-fs-text);line-height:18px;font-weight:500;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.aup-card-session .aup-bar{height:6px}',
      '.aup-session-total{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex:none;width:100%}',
      '.aup-session-total-value{font-size:var(--aup-fs-text);line-height:24px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);white-space:nowrap}',
      '.aup-session-total-label{font-size:var(--aup-fs-text);line-height:16px;font-weight:500;color:var(--aup-label-2);white-space:nowrap}',
      '.aup-compose{display:flex;height:8px;flex:none;gap:1px;border-radius:999px;overflow:hidden;background:var(--dsw-alias-bg-skeleton)}',
      '.aup-compose-seg{flex:1 1 0;min-width:2px;height:100%}',
      '.aup-context{display:flex;flex-direction:column;gap:3px;margin-top:2px}',
      '.aup-context-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 12px;font-variant-numeric:tabular-nums;font-size:var(--aup-fs-text);line-height:18px;font-weight:500;color:var(--aup-label-2);min-width:0}',
      '.aup-context-head>span{min-width:0;white-space:nowrap}',
      '.aup-context-figures{flex:none;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);text-align:right}',
      '.aup-bar{height:4px;border-radius:999px;background:var(--dsw-alias-bg-skeleton);overflow:hidden}',
      '.aup-bar-fill{display:block;height:100%;border-radius:inherit;background:var(--dsw-alias-brand-primary)}',
      
      '.aup-card-session .aup-session-body>.aup-context{margin-top:0}',
      '.aup-tab-icon{flex:none;width:14px;height:14px;vertical-align:-2px;color:var(--dsw-alias-label-secondary)}',
      // ---- one shared type scale: every Chinese text is 13px, only numbers vary by role ----
      '.aup-card{gap:3px;padding:8px}',
      '.aup-card-title{font-size:var(--aup-fs-text);line-height:16px;font-weight:500}',
      '.aup-card-icon{width:15px;height:15px}',
      '.aup-card-icon svg{width:100%;height:100%}',
      '.aup-session-total-value{font-size:var(--aup-fs-text);line-height:26px}',
      '.aup-session-total-label{font-size:var(--aup-fs-text);line-height:16px}',
      '.aup-session-label{font-size:var(--aup-fs-text);line-height:16px}',
      '.aup-session-value{font-size:var(--aup-fs-text);line-height:16px;font-weight:500}',
      '.aup-card-session .aup-session-grid{gap:6px 12px}',
      '.aup-compose{height:5px}',
      '.aup-bar{height:6px}',
      '.aup-context{gap:4px}',
      '.aup-context-head{font-size:var(--aup-fs-text);line-height:16px}',
      '.aup-hint{font-size:var(--aup-fs-text);line-height:16px}',
      // ---- narrow panes: one more compaction step so balance rows stay on one line ----
      // The documented comfort width is 340px (where even three `100%` windows fit); below it,
      // typical values must still read as a single line, without scaling text.
      // Between the comfortable width and the comfort minimum the pairs give back only the
      // extra air the wide layout added - never the label/figure separation itself.
      '@container aup-panel (max-width:440px){.aup-acct-pairs{gap:2px 9px}.aup-acct-pairs.aup-acct-pairs-tight{column-gap:8px}.aup-acct-pair{gap:4px}}',
      '@container aup-panel (max-width:380px){.aup-acct-pairs{gap:2px 7px;letter-spacing:-0.3px}.aup-acct-pairs.aup-acct-pairs-tight{column-gap:6px}.aup-acct-pair{gap:3px}}',
      '@container aup-panel (max-width:330px){.aup-acct-srcs{column-gap:4px}.aup-acct-pair{gap:2px}.aup-acct-pairs{gap:1px 5px;letter-spacing:-0.7px;font-variant-numeric:proportional-nums}.aup-context-legend{column-gap:6px}.aup-context-legend>span{white-space:nowrap}.aup-model-row{gap:2px 6px}.aup-model-name{letter-spacing:-0.2px}}',
      // ---- ultra-narrow panes (<=310px): the last spacing step so even three `100%`
      // windows stay on one line; still 13px text, only tighter rhythm. ----
      '@container aup-panel (max-width:320px){.aup-card{padding-left:5px;padding-right:5px}.aup-acct-srcs{column-gap:2px}.aup-acct-src-label{letter-spacing:-0.5px}.aup-acct-pair{gap:2px}.aup-acct-pairs{gap:0 5px;letter-spacing:-1px}.aup-acct-pairs.aup-acct-pairs-tight{gap:0 5px;letter-spacing:-1.6px}.aup-model-row{gap:2px 5px}.aup-model-name{letter-spacing:-0.4px}}',
      // ---- content shedding on short panes: container queries, no measurement ----
      // Measured ladder (test/layout-check.mjs --tiers): each step keeps the whole
      // panel inside its own height so the card column never has to scroll. These are
      // CONTAINER queries on the panel root, not media queries on the window: the pane
      // is shorter than the window (right-sidebar tab strip + header) and viewport
      // breakpoints fired ~90px too late, which is why the pane still scrolled.
      // The session card never truncates: every model row is rendered (2026-11-09);
      // these steps only shed whole blocks when the pane is physically too short.
      // They must stay LAST and carry !important: a query adds no specificity.
      // Thresholds = `layout-check --tiers` content height + 58px of panel chrome,
      // re-measured for the two-card panel (1.0.16): 526 content -> 584, then one step
      // per shed block (575 / 532 / 448 / 384 / 330; the last step moved 325 -> 330
      // when the context block became the leading block and stopped owning a hairline).
      '@container aup-panel (max-height:584px){.aup-compose{display:none!important}}',
      '@container aup-panel (max-height:575px){.aup-card-session .aup-models,.aup-card-session .aup-sep-models{display:none!important}}',
      '@container aup-panel (max-height:532px){.aup-card-session .aup-stat-list,.aup-card-session .aup-sep-stats{display:none!important}}',
      '@container aup-panel (max-height:448px){.aup-card-session .aup-providers,.aup-card-session .aup-sep-providers{display:none!important}}',
      // The context block leads the card now, so it sheds on its own: no hairline is
      // left at the top of the card (the total keeps its own separator at the foot).
      '@container aup-panel (max-height:384px){.aup-card-session .aup-context{display:none!important}}',
      '@container aup-panel (max-height:330px){.aup-card-session .aup-session-grid{display:none!important}}',
      // Measured with `layout-check --tiers N`: each source beyond three adds one
      // balance row (25px) plus one per-provider row and its gap (19px) = 44px; its
      // single-model detail row is not drawn at all (1.0.16).
      // Budget by source count only - never by measured content - so no observer/state
      // feedback can occur.
      ...Array.from({ length: 13 }, (_, index) => {
        const count = index + 4;
        const extra = (count - 3) * 44;
        return [[584, ['.aup-compose']], [575, ['.aup-card-session .aup-models', '.aup-card-session .aup-sep-models']], [532, ['.aup-card-session .aup-stat-list', '.aup-card-session .aup-sep-stats']], [448, ['.aup-card-session .aup-providers', '.aup-card-session .aup-sep-providers']], [384, ['.aup-card-session .aup-context']], [330, ['.aup-card-session .aup-session-grid']]]
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

    /** Gauge glyph: the tab / guide mark shared with the shell's quick-action button. */
    function GaugeGlyph({ size = 14, className }) {
      if (GaugeIcon !== null) return h(GaugeIcon, { size, className });
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
          className
        },
        h('path', { d: 'M4.2 16.4a8 8 0 1 1 15.6 0' }),
        h('path', { d: 'M12 12.2l3.3-2.5' }),
        h('circle', { cx: 12, cy: 13.1, r: 1.1, fill: 'currentColor', stroke: 'none' })
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

    /** Display settings popover: composer stats and auto refresh. The two cards are
     * fixed (user 2026-11-09: 这两项配置删掉 就俩卡片 没有配置的必要). */
    function SettingsPanel({ settings, onChange, onReset, onClose, t }) {
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
        switchRow('hideComposerStats', 'settings.hideComposerStats', settings.hideComposerStats, (value) => ({ hideComposerStats: value })),
        switchRow('autoRefresh', 'settings.autoRefresh', settings.autoRefresh, (value) => ({ autoRefresh: value })),
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
      commandcode: 'Command Code',
      ollama: 'Ollama',
      azure: 'Azure',
      bedrock: 'AWS Bedrock',
      vertex: 'Vertex AI'
    };

    /** Shortcut id shared by the registered command and the guide card's key hint. */
    const SHORTCUT_ID = 'accountUsage.open';


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
      // No spaces around the separator (user 2026-11-09): the model row is the
      // widest single line in a narrow pane, so `Provider-model` saves two spaces.
      return provider === '' ? model : provider + '-' + model;
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

    const SESSION_MODELS_ROUTE = '/account-usage/session/models';
    const PROVIDER_BALANCE_ROUTE = '/account-usage/provider/balance';
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
      const windowCode = (id) => (id === 'rolling' || id === 'fiveHour' ? t('account.planRolling') : id === 'weekly' ? t('account.planWeekly') : t('account.planMonthly'));
      // One display rule for every source (user 2026-11-08): short muted label + figure
      // pairs, right aligned - `Bal 199.54¥ Bon 0.00¥`, `5H 63% WE 70% MO 85%`.
      // Short codes are never glued to their figure (user 2026-11-09: 「英文和数字之间
      // 也加个空格吧 太挤了 看不清数字了」): label and figure stay apart in every pair,
      // and every pair keeps a visible gap before the next label.
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

      /**
       * Remaining Command Code credits: the plan allowance left plus any on-demand
       * top-ups. Absent credits are unknown, never zero.
       */
      const creditsRemaining = (credits) => {
        if (credits === null || typeof credits !== 'object') return undefined;
        const parts = ['monthly', 'purchased', 'free']
          .map((key) => credits[key])
          .filter((value) => Number.isFinite(value));
        if (parts.length === 0) return undefined;
        // Pass the raw sum: `formatMoney` truncates positive amounts to cents, the
        // same rule the platform amounts follow, so this must not round first.
        return parts.reduce((sum, value) => sum + value, 0);
      };

      const providerSummary = (source) => {
        const status = providerBalances && providerBalances.byProvider && providerBalances.byProvider[source.id];
        const entry = status ? status.data : providerRows.find((row) => row && row.provider === source.id);
        if (entry !== undefined && (!status || status.phase === 'ready')) {
          const currency = currencyOf(entry);
          const money = (value) => formatMoney(String(value), currency, locale);
          if (Array.isArray(entry.windows)) {
            // Plan rule (user 2026-11-08): `5H63%  WE70%  MO85%` - every figure is the
            // share LEFT, so no "left/used" wording; fixed order 5h -> week -> month.
            // Command Code publishes a 5-hour and a weekly window plus the credits left
            // beside them, so its row appends one `CR / 额度` pair.
            const windows = ['rolling', 'fiveHour', 'weekly', 'monthly']
              .map((id) => entry.windows.find((window) => window && window.id === id))
              .filter((window) => window !== undefined && Number.isFinite(window.usedPercent));
            const figures = windows.map((window) => Math.round((100 - window.usedPercent) * 10) / 10 + '%');
            const items = windows.map((window, index) => [window.id, windowCode(window.id), figures[index]]);
            const creditsLeft = creditsRemaining(entry.credits);
            const creditFigure = creditsLeft === undefined ? undefined : money(creditsLeft);
            if (creditFigure !== undefined) items.push(['credits', t('account.creditsLabel'), creditFigure]);
            if (items.length === 0) return { value: t('account.status.noBalance'), muted: true };
            // Deterministic, not measured: only wide figure text needs the extra step
            // (three `100%`, or Command Code's two windows plus a wide credit amount).
            const tight = figures.concat(creditFigure === undefined ? [] : [creditFigure]).join('').length >= 10;
            return pairs(items, tight ? 'aup-acct-pairs-tight' : undefined);
          }
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
      // Consumption per provider type, folded into the session card (user 2026-11-09:
      // the usage-statistics card is gone, its per-provider session totals live here).
      // One row per provider, in first-appearance order, summed from the model rows.
      const providerRows = [];
      for (const item of modelRows) {
        if (item === null || item === undefined || typeof item.provider !== 'string' || item.provider === '') continue;
        let entry = null;
        for (const row of providerRows) {
          if (row.provider === item.provider) {
            entry = row;
            break;
          }
        }
        if (entry === null) {
          entry = { provider: item.provider, tokens: 0, requests: 0 };
          providerRows.push(entry);
        }
        entry.tokens += Number.isFinite(item.tokens) ? item.tokens : 0;
        entry.requests += Number.isFinite(item.requests) ? item.requests : 0;
      }
      // Per-model detail repeats the provider already shown above, so it is only
      // worth a row when a provider actually ran more than one model: a single-model
      // provider's model row would print the very same figure twice (user 2026-11-09:
      // "重复了 provider+type 保留一次统计即可"). Nothing is hidden by this rule - the
      // provider row carries exactly the tokens of its one model.
      const modelsPerProvider = {};
      for (const item of modelRows) {
        if (item === null || item === undefined || typeof item.provider !== 'string' || item.provider === '') continue;
        modelsPerProvider[item.provider] = (modelsPerProvider[item.provider] || 0) + 1;
      }
      const detailModelRows = modelRows.filter(
        (item) => item !== null && item !== undefined && typeof item.provider === 'string' && modelsPerProvider[item.provider] > 1
      );
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
        { key: 'turnsSteps', label: t('tokens.stat.turnsSteps'), value: turns === undefined && steps === undefined ? undefined : (turns === undefined ? '—' : String(turns)) + '/' + (steps === undefined ? '—' : String(steps)) },
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
        detailModelRows.length === 0
          ? null
          : h(
              'div',
              { className: 'aup-models' },
              // Multi-model providers keep one row per model - never truncated, only
              // compressed (user 2026-11-09). Single-model providers are already
              // covered by their row in the per-provider block above.
              detailModelRows.map((item) => {
                const text = modelRowLabel(item, t);
                return h(
                  'div',
                  { key: (item.provider || '') + '/' + item.model, className: 'aup-model-row', title: (item.provider === undefined ? '' : item.provider + ' / ') + item.model },
                  h('span', { className: 'aup-model-name' + modelRowLabelClass(text) }, text),
                  h('span', { className: 'aup-model-tokens' }, formatTokens(item.tokens))
                );
              })
            );

      const providerBlock =
        providerRows.length === 0
          ? null
          : h(
              'div',
              { className: 'aup-providers' },
              providerRows.map((row) => {
                const label = providerLabel(row.provider, t);
                return h(
                  'div',
                  {
                    key: row.provider,
                    className: 'aup-provider-row',
                    title: label + ' · ' + formatTokens(row.tokens) + ' · ' + t('tokens.requestsCount', { count: String(row.requests) })
                  },
                  h('span', { className: 'aup-provider-name' }, label),
                  h('span', { className: 'aup-provider-tokens' }, formatTokens(row.tokens))
                );
              })
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

      const totalBlock = h(
        'div',
        { className: 'aup-session-total' },
        h('span', { className: 'aup-session-total-label' }, t('tokens.total')),
        h('span', { className: 'aup-session-total-value' }, usage ? formatTokens(total) : '—')
      );

      // Context occupancy opens the card and the session total closes it (user
      // 2026-11-09: 我想 contextusage 的位置和 total 换一下). How full the window is
      // is the live, actionable figure - it had been buried under the whole card.
      const contextBlock = h(
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
      );

      const sessionBody = h(
        'div',
        { className: 'aup-session-body' },
        contextBlock,
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
        providerBlock === null ? null : h('span', { className: 'aup-session-sep aup-sep-providers', 'aria-hidden': true }),
        providerBlock,
        modelBlock === null ? null : h('span', { className: 'aup-session-sep aup-sep-models', 'aria-hidden': true }),
        modelBlock,
        h('span', { className: 'aup-session-sep aup-sep-total', 'aria-hidden': true }),
        totalBlock
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
    function AccountUsageBody({ t: initialT, useProjection, readAccount, readSessionModels, readProviderBalances, readLocale, subscribeLocale, bindTranslation, sessionId }) {
      const [account, setAccount] = React.useState({ phase: 'loading', result: undefined, refreshing: false });
      const [sessionModels, setSessionModels] = React.useState({ phase: 'idle', items: [], totalTokens: 0, lastProvider: '' });
      const [providerBalances, setProviderBalances] = React.useState({ phase: 'idle', byProvider: {} });
      const [settings, setSettings] = React.useState(readSettings);
      const [accountRequest, setAccountRequest] = React.useState({ count: 0, force: false });
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
      const sessionProviders = [...new Set((sessionModels.items || []).map((item) => item.provider).filter((provider) => typeof provider === 'string' && provider !== ''))];
      const offAccountProviders = sessionProviders.filter((provider) => !isAccountProvider(provider));
      const offAccountAll = sessionProviders.length > 0 && offAccountProviders.length === sessionProviders.length;
      // Only the balance reads can be in flight now; the platform usage card is gone.
      const busy = offAccountAll !== true && account.refreshing === true;
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
      }, [sessionId, accountRequest.count, accountRequest.force, readSessionModels]);

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
        for (const provider of offAccountProviders) loadProviderBalance(provider, accountRequest.force === true);
        return () => {
          // Invalidate in-flight reads on refresh, session change, or unmount.
          for (const [provider, ticket] of providerReads.current) providerReads.current.set(provider, ticket + 1);
        };
      }, [sessionId, offAccountProviders.join('|'), accountRequest.count, accountRequest.force, readProviderBalances]);

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

      const refresh = () => {
        setAccountRequest((previous) => ({ count: previous.count + 1, force: true }));
      };

      /** Merge one display-settings patch into the persisted preferences. */
      const applySettings = (patch) => {
        setSettings((previous) => ({ ...previous, ...patch }));
      };
      const resetSettings = () => {
        setSettings(DEFAULT_SETTINGS);
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
          h(TokenSection, { useProjection, t, sessionModels }),
          h(AccountSection, {
            state: account,
            t,
            providerBalances,
            sources: accountSources,
            currentSource,
            locale: displayLocale
          })
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

    /** Tab chip: gauge glyph plus the short tab title (never the cached long title). */
    function AccountUsageTitle({ useTabInfo, t }) {
      const info = useTabInfo();
      const label = typeof t === 'function' ? t('tab.title') : info.tab.title;
      return h(React.Fragment, null, h(GaugeGlyph, { size: 14, className: 'aup-tab-icon' }), label);
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
                icon: GaugeGlyph
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
                inject: () => ({ readAccount, readSessionModels, readProviderBalances, readLocale, subscribeLocale, bindTranslation })
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
