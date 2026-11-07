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
      'header.trend': '近 7 天',
      'header.trendTitle': '最近 7 天 Token 趋势',
      'header.live': '实时',
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
      'settings.reset': '恢复默认',
      'settings.close': '关闭',
      'settings.allHidden': '三张卡片都已隐藏，点右上角设置可重新开启。',
      'account.title': '账户余额',
      'account.signedOut': '当前未登录 DeepSeek 账号',
      'account.signedOutHint': '设置 → 账号 登录后显示余额',
      'balance.recharge': '余额',
      'provider.deepseekAccount': 'DeepSeek 账号',
      'provider.deepseekApiKey': 'DeepSeek API Key',
      'balance.used': '已用',
      'account.providerUnavailable': '暂时读不到 {provider} 余额。',
      'account.providerUnsupported': '{provider} 不支持余额查询。',
      'account.providerNoKey': '未配置 {provider} API Key，无法读取余额。',
      'account.offAccountAll': '本次会话由 {provider} 提供，不消耗 DeepSeek 余额。',
      'account.offAccountPartial': '本次会话部分使用 {provider}，该部分不消耗 DeepSeek 余额。',
      'stats.platformBadge': 'DeepSeek 平台',
      'stats.sessionScope': '本会话',
      'account.partialBadge': '部分 {provider}',
      'stats.platformBadgeHint': '平台用量只统计 DeepSeek 账号，不含第三方 Provider。',
      'balance.bonus': '赠送额度',
      'balance.failed': '余额读取失败',
      'balance.empty': '暂无余额数据',
      'stats.title': '用量统计',
      'stats.dim.day': '日',
      'stats.dim.week': '周',
      'stats.dim.month': '月',
      'stats.dim.quarter': '季',
      'stats.dim.year': '年',
      'stats.summary.requests': '合计 {total} · {count} 次请求',
      'stats.summary.sessions': '合计 {total} · {count} 个会话',
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
      'tokens.detail': '会话明细',
      'tokens.modelMeta': '{requests} 次请求 · 占比 {share}%',
      'tokens.byModel': '按模型',
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
      'account.providerNote': '余额由 {provider} 提供',
      'account.providerNoBalance': '{provider} 暂未开放余额接口，显示本会话用量。',
      'tokens.sessionUsage': '本会话用量',
      'tokens.requestsCount': '{count} 次请求',
      'account.providerUpdated': '更新于 {time}',
      'account.providerUsedRate': '已用 {percent}%',
    };

    /** English dictionary, checked against the Chinese key set. */
    const en = {
      'tab.title': 'Usage',
      'panel.title': 'Account usage',
      'header.trend': 'Last 7 days',
      'header.trendTitle': 'Token trend over the last 7 days',
      'header.live': 'Live',
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
      'settings.reset': 'Reset to defaults',
      'settings.close': 'Close',
      'settings.allHidden': 'All three cards are hidden. Turn them back on in the display settings.',
      'account.title': 'Account balance',
      'account.signedOut': 'No DeepSeek account is signed in',
      'account.signedOutHint': 'Sign in via Settings to see the balance',
      'balance.recharge': 'Balance',
      'provider.deepseekAccount': 'DeepSeek account',
      'provider.deepseekApiKey': 'DeepSeek API key',
      'balance.used': 'Used',
      'account.providerUnavailable': 'Cannot read the {provider} balance right now.',
      'account.providerUnsupported': '{provider} does not expose a balance API.',
      'account.providerNoKey': 'No {provider} API key is configured.',
      'account.offAccountAll': 'This session runs on {provider}; it does not use your DeepSeek balance.',
      'account.offAccountPartial': 'Part of this session runs on {provider}; that part does not use your DeepSeek balance.',
      'stats.platformBadge': 'DeepSeek platform',
      'stats.sessionScope': 'session',
      'account.partialBadge': 'partly {provider}',
      'stats.platformBadgeHint': 'Platform usage covers the DeepSeek account only, not third-party providers.',
      'balance.bonus': 'Bonus credit',
      'balance.failed': 'Could not read the balance',
      'balance.empty': 'No balance data yet',
      'stats.title': 'Usage statistics',
      'stats.dim.day': 'Day',
      'stats.dim.week': 'Week',
      'stats.dim.month': 'Month',
      'stats.dim.quarter': 'Qtr',
      'stats.dim.year': 'Year',
      'stats.summary.requests': 'Total {total} · {count} requests',
      'stats.summary.sessions': 'Total {total} · {count} sessions',
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
      'tokens.detail': 'Session details',
      'tokens.modelMeta': '{requests} calls · {share}%',
      'tokens.byModel': 'By model',
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
      'account.providerNote': 'Balance provided by {provider}',
      'account.providerNoBalance': '{provider} has no balance API yet; showing this session.',
      'tokens.sessionUsage': 'Session usage',
      'tokens.requestsCount': '{count} requests',
      'account.providerUpdated': 'Updated {time}',
      'account.providerUsedRate': '{percent}% used',
    };

    // ----------------------------------------------------------------- styles --

    const CSS = [
      'html[data-account-usage-hide-stats] [data-composer-dock]{display:none!important}',
      'html[data-account-usage-hide-stats] [data-slot="conversation.composer.dock"]{display:none!important}',
      'html[data-account-usage-hide-stats] [data-composer-stat]{display:none!important}',
      '.aup-root{position:relative;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;height:100%;min-height:0;overflow:hidden;padding:16px;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:20px}',
      '.aup-root *{box-sizing:border-box}',
      '.aup-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none}',
      '.aup-glyph{flex:none;color:var(--dsw-alias-label-secondary);display:inline-flex}',
      '.aup-title{flex:1;min-width:0;margin:0;font-size:14px;font-weight:500;line-height:20px;white-space:nowrap}',
      '.aup-icon-button{flex:none;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background-color .12s,color .12s}',
      '.aup-icon-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.aup-icon-button:disabled{opacity:.4;cursor:default}',
      '.aup-head-actions{display:inline-flex;align-items:center;gap:2px;flex:none}',
      '.aup-head-spark{flex:1 1 auto;min-width:0;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:16px;font-weight:500;white-space:nowrap;overflow:hidden}',
      '.aup-head-spark-label{overflow:hidden;text-overflow:clip}',
      '.aup-head-spark svg{flex:none;width:56px;height:18px;overflow:visible}',
      '.aup-live-dot{flex:none;width:6px;height:6px;border-radius:999px;background:var(--dsw-alias-brand-primary)}',
      '.aup-spark-line{fill:none;stroke:var(--dsw-alias-brand-primary);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}',
      '.aup-spark-area{fill:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent)}',
      '.aup-spark-dot{fill:var(--dsw-alias-brand-primary);animation:aup-pulse 2.4s ease-in-out infinite}',
      '@keyframes aup-pulse{0%,100%{opacity:1}50%{opacity:.35}}',
      '@media (prefers-reduced-motion:reduce){.aup-spark-dot{animation:none}}',
      '.aup-icon-button[data-active]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.aup-pop-backdrop{position:absolute;inset:0;z-index:20}',
      '.aup-pop{position:absolute;top:44px;left:12px;z-index:21;width:258px;max-width:calc(100% - 24px);max-height:calc(100% - 56px);overflow:auto;display:flex;flex-direction:column;gap:6px;padding:12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 10px 28px color-mix(in srgb,var(--dsw-alias-label-primary) 16%,transparent)}',
      '.aup-pop-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px}',
      '.aup-pop-title{font-size:13px;line-height:18px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.aup-pop-close{width:22px;height:22px;margin-right:-4px}',
      '.aup-pop-close-glyph{font-size:16px;line-height:1;font-weight:400}',
      '.aup-pop-block{display:flex;flex-direction:column;gap:6px;margin-top:2px}',
      '.aup-pop-label{font-size:13px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-secondary)}',
      '.aup-pop-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:26px}',
      '.aup-pop-row>span{font-size:13px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-primary);white-space:nowrap}',
      '.aup-pop-hint{font-size:13px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:visible;text-overflow:clip}',
      '.aup-pop-sep{flex:none;height:1px;margin:2px 0;background:var(--dsw-alias-border-l2)}',
      '.aup-pop-foot{display:flex;justify-content:flex-end;padding-top:2px}',
      '.aup-pop-link{padding:0;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}',
      '.aup-pop-link:hover{color:var(--dsw-alias-label-primary)}',
      '.aup-dims-mini{background:var(--dsw-alias-bg-skeleton);padding:2px;gap:2px;border-radius:8px}',
      '.aup-dims-mini .aup-dim{flex:1 1 0;height:22px;padding:0 4px;border-radius:6px;font-size:12px;line-height:16px}',
      '.aup-toggle{position:relative;flex:none;width:34px;height:20px;padding:0;border:none;border-radius:999px;background:var(--dsw-alias-bg-skeleton);cursor:pointer;transition:background-color .15s}',
      '.aup-toggle[data-on]{background:var(--dsw-alias-brand-primary)}',
      '.aup-toggle-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 2px color-mix(in srgb,var(--dsw-alias-label-primary) 20%,transparent);transition:transform .15s}',
      '.aup-toggle[data-on] .aup-toggle-knob{transform:translateX(14px)}',
      '.aup-toggle:focus-visible,.aup-pop-link:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '@media (prefers-reduced-motion:reduce){.aup-toggle,.aup-toggle-knob{transition:none}}',
      '.aup-empty{padding:12px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:18px;font-weight:500;text-align:center}',      '.aup-icon-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.aup-spin{animation:aup-spin 1s linear infinite}',
      '@keyframes aup-spin{to{transform:rotate(360deg)}}',
      '.aup-cards{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:12px}',
      '.aup-card{flex:1 1 0;min-height:0;display:flex;flex-direction:column;gap:10px;padding:12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}',
      '.aup-card-session{flex:4 1 0;justify-content:flex-start}',
      '.aup-card-stats{flex:1 1 0;justify-content:space-between}',
      '.aup-card-account{flex:0 0 auto;min-height:0;justify-content:flex-start}',
      '.aup-card-head{display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;flex:none}',
      '.aup-divider{display:block;height:1px;flex:none;margin:0;background:var(--dsw-alias-border-l2)}',
      '.aup-card-icon{display:inline-flex;flex:none;color:var(--dsw-alias-label-secondary)}',
      '.aup-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}',
      '.aup-skeleton{display:block;height:10px;border-radius:6px;background:linear-gradient(90deg,color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent) 25%,color-mix(in srgb,var(--dsw-alias-label-primary) 11%,transparent) 37%,color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent) 63%);background-size:400% 100%;animation:aup-shimmer 1.4s ease-in-out infinite}',
      '@keyframes aup-shimmer{0%{background-position:100% 0}100%{background-position:0 0}}',
      '.aup-skeleton-row{pointer-events:none}',
      '.aup-skeleton-label{width:38px}',
      '.aup-skeleton-track{width:100%;height:8px;border-radius:999px;justify-self:stretch}',
      '.aup-skeleton-value{width:44px;justify-self:end}',
      '@media (prefers-reduced-motion:reduce){.aup-skeleton{animation:none}}',
      '.aup-badge{flex:none;padding:0 6px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:18px;font-weight:500;white-space:nowrap}',
      '.aup-card-title{margin:0;font-size:12px;font-weight:500;line-height:18px;color:var(--dsw-alias-label-secondary)}',

      '.aup-balance{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:4px 16px;margin:0;padding:0}',
      '.aup-balance-item{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.aup-balance-label{margin:0;font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary);white-space:normal;overflow-wrap:anywhere}',
      '.aup-balance-value{margin:0;font-size:16px;font-weight:500;line-height:22px;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.aup-balance-value.aup-minor{font-size:16px;line-height:22px;font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.aup-hint{margin:0;font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary);white-space:normal;overflow:visible}',
      '.aup-error{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary);white-space:normal;overflow:visible}',
      '.aup-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.aup-retry{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}',
      '.aup-retry:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.aup-card-session-fixed{flex:0 1 auto}',
      '.aup-card-session .aup-session-body{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:10px;justify-content:flex-start}',
      '.aup-card-session .aup-session-grid{flex:0 0 auto;display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;align-content:space-evenly;justify-items:stretch;margin:0;padding:0;width:100%}',
      '.aup-card-session .aup-session-cell{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0;text-align:left}',
      '.aup-card-session .aup-session-cell:nth-child(even){align-items:flex-end;text-align:right}',
      '.aup-models{display:flex;flex-direction:column;gap:2px;flex:none;min-height:0}',
      '.aup-models-caption{font-size:13px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-secondary)}',
      '.aup-model-item{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.aup-model-track{height:4px;border-radius:999px;background:var(--dsw-alias-bg-skeleton);overflow:hidden}',
      '.aup-model-fill{display:block;height:100%;border-radius:inherit;background:var(--dsw-alias-brand-primary)}',
      '.aup-model-meta{display:flex;justify-content:space-between;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:16px}',
      '.aup-model-row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;min-width:0;font-size:13px;line-height:17px;font-variant-numeric:tabular-nums}',
      '.aup-model-name{min-width:0;font-size:12px;line-height:16px;white-space:nowrap;color:var(--dsw-alias-label-secondary)}',
      '.aup-model-name.aup-model-name-long{font-size:11px}',
      '.aup-model-tokens{flex:none;font-weight:500;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}',
      '.aup-model-more{font-size:13px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.aup-token-dot{flex:none;width:6px;height:6px;border-radius:2px}',
      '.aup-provider-updated{margin:0;font-size:13px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-secondary)}',
      '.aup-stat-list{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px}',
      '.aup-session-sep{flex:none;height:1px;background:var(--dsw-alias-border-l2)}',
      '.aup-stat-row{display:grid;grid-template-columns:60px minmax(0,1fr);align-items:baseline;gap:4px;min-width:0;font-size:13px;line-height:20px}',
      '.aup-stat-label{min-width:0;color:var(--dsw-alias-label-secondary);white-space:nowrap;line-height:20px}',
      '.aup-stat-value{min-width:0;justify-self:stretch;text-align:right;color:var(--dsw-alias-label-primary);font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:13px;line-height:20px}',
      '.aup-context-breakdown{display:flex;flex-direction:column;gap:4px;margin-top:2px}',
      '.aup-context-used{display:flex;height:100%;gap:1px;border-radius:inherit;overflow:hidden}',
      '.aup-context-seg{flex:1 1 0;min-width:2px;height:100%}',
      '.aup-context-legend{display:flex;flex-wrap:nowrap;justify-content:space-between;gap:2px 8px;font-size:13px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-secondary)}',
      '.aup-models-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;min-width:0}',
      '.aup-models-provider{min-width:0;white-space:nowrap;font-size:13px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.aup-model-provider{display:block;margin-top:2px;font-size:13px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.aup-card-account-provider{flex:0 1 auto;min-height:0;justify-content:flex-start}',
      '.aup-provider-mode .aup-card-session-fixed{flex:1.1 1 0}',
      '.aup-provider-mode .aup-session-body{justify-content:space-between}',
      '.aup-card-detail{justify-content:flex-start}',
      '.aup-detail-body{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:10px;justify-content:space-between}',
      '.aup-provider-mode .aup-card-detail{flex:1.6 1 0}',
      '.aup-provider-mode .aup-card-account-provider{flex:1.1 1 0}',
      '.aup-provider-mode .aup-provider-body{flex:1 1 auto;justify-content:space-between}',
      '.aup-card-account-provider .aup-balance{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 12px;align-content:center}',
      '.aup-card-account-provider .aup-balance-value{font-size:16px;line-height:22px}',
      '.aup-card-account-provider .aup-balance-value.aup-minor{font-size:16px;line-height:22px}',
      '.aup-card-account-provider .aup-balance-value.aup-value-long{font-size:14px}',
      '.aup-card-account-provider .aup-balance-value.aup-value-longer{font-size:12px}',
      '.aup-provider-body{flex:0 0 auto;min-height:0;display:flex;flex-direction:column;gap:8px;justify-content:flex-start}',
      '.aup-provider-hero{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.aup-value-long{font-size:.82em}',
      '.aup-value-longer{font-size:.68em}',
      '.aup-balance-value.aup-value-long{font-size:14px}',
      '.aup-balance-value.aup-value-longer{font-size:12px}',
      '.aup-provider-hero-value.aup-value-long{font-size:18px}',
      '.aup-provider-hero-value.aup-value-longer{font-size:16px}',
      '.aup-provider-meta-value.aup-value-long{font-size:14px}',
      '.aup-provider-meta-value.aup-value-longer{font-size:13px}',
      '.aup-provider-hero-label{font-size:13px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-secondary)}',
      '.aup-provider-hero-value{font-size:20px;line-height:26px;font-weight:500;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.aup-provider-progress{display:flex;flex-direction:column;gap:6px}',
      '.aup-provider-meta{display:flex;flex-wrap:wrap;gap:8px 18px}',
      '.aup-provider-meta-item{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.aup-provider-meta-label{font-size:13px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.aup-provider-meta-value{font-size:16px;line-height:22px;font-weight:500;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.aup-provider-rate{display:flex;align-items:baseline;justify-content:space-between;gap:10px;font-size:13px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-secondary)}',
      '.aup-provider-note{margin:0;font-size:13px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-secondary)}',
      '.aup-provider-figures{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.aup-provider-figure{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:baseline;gap:2px 10px;min-width:0}',
      '.aup-provider-figure-label{min-width:0;font-size:13px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.aup-provider-figure-value{font-size:20px;line-height:26px;font-weight:500;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.aup-provider-figure-meta{grid-column:1/-1;font-size:13px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.aup-card-session .aup-session-label{display:flex;align-items:center;gap:5px;margin:0;font-size:13px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.aup-card-session .aup-session-value{margin:0;font-size:13px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.aup-card-session .aup-bar{height:8px}',
      '.aup-session-total{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex:none;width:100%}',
      '.aup-session-total-value{font-size:20px;line-height:26px;font-weight:500;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);white-space:nowrap}',
      '.aup-session-total-label{font-size:11px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.aup-compose{display:flex;height:8px;flex:none;gap:1px;border-radius:999px;overflow:hidden;background:var(--dsw-alias-bg-skeleton)}',
      '.aup-compose-seg{flex:1 1 0;min-width:2px;height:100%}',
      '.aup-context{display:flex;flex-direction:column;gap:6px;margin-top:2px}',
      '.aup-context-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 12px;font-variant-numeric:tabular-nums;font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary);min-width:0}',
      '.aup-context-head>span{min-width:0;white-space:nowrap}',
      '.aup-context-figures{flex:none;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);text-align:right}',
      '.aup-bar{height:4px;border-radius:999px;background:var(--dsw-alias-bg-skeleton);overflow:hidden}',
      '.aup-bar-fill{display:block;height:100%;border-radius:inherit;background:var(--dsw-alias-brand-primary)}',
      '.aup-dims{display:flex;gap:2px;flex-wrap:nowrap;padding:2px;border-radius:9px;background:var(--dsw-alias-bg-skeleton)}',
      '.aup-dim{flex:1;min-width:0;height:22px;padding:0 4px;border:.5px solid transparent;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;font-weight:500;line-height:18px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;transition:background-color .12s,color .12s}',
      '.aup-dim:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.aup-dim[data-active]{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l3);box-shadow:0 1px 2px color-mix(in srgb,var(--dsw-alias-label-primary) 9%,transparent);color:var(--dsw-alias-label-primary);font-weight:500}',
      '.aup-dim:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.aup-stats-summary{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 12px;font-variant-numeric:tabular-nums;font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary)}',
      '.aup-stats-summary>span{min-width:0;white-space:normal;overflow-wrap:anywhere}',
      '.aup-sources{display:flex;flex-direction:column;gap:2px;flex:none}',
      '.aup-source-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:baseline;gap:10px;font-size:13px;line-height:18px;font-variant-numeric:tabular-nums}',
      '.aup-source-row-account .aup-source-tokens,.aup-source-row-account .aup-source-cost{font-size:16px;line-height:22px;font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.aup-source-label{min-width:0;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.aup-source-tokens{color:var(--dsw-alias-label-primary);font-weight:500;white-space:nowrap;text-align:right}',
      '.aup-source-cost{min-width:52px;color:var(--dsw-alias-label-secondary);white-space:nowrap;text-align:right}',
      '.aup-stats-total{flex:none;font-size:20px;line-height:26px;font-weight:500;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;text-align:right}',
      '.aup-card-stats .aup-series{flex:1 1 auto;display:flex;flex-direction:column;justify-content:space-between;gap:4px}',
      '.aup-card-stats .aup-series-row{flex:1 1 0;min-height:17px;padding:0 6px;margin:0 -6px;border-radius:8px;transition:background-color .12s}',
      '.aup-card-stats .aup-series-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.aup-card-stats .aup-series-row[data-current]{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)}',
      '.aup-card-stats .aup-series-row[data-zero]{opacity:.45}',
      '.aup-card-stats .aup-series-row[data-zero]:hover{opacity:.8}',
      '.aup-card-stats .aup-series-row[data-zero] .aup-series-track{opacity:.5}',
      '.aup-card-stats .aup-series-row[data-current]:hover{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent)}',
      '.aup-card-stats .aup-series-track{height:8px}',
      '.aup-series-row{display:grid;grid-template-columns:minmax(46px,max-content) minmax(0,1fr) minmax(52px,max-content);align-items:center;gap:8px;font-size:12px;line-height:18px}',
      '.aup-series-label{color:var(--dsw-alias-label-secondary);white-space:nowrap;font-variant-numeric:tabular-nums}',
      '.aup-series-tokens{white-space:nowrap}',
      '.aup-series-cost{white-space:nowrap}',
      '.aup-series-track{height:6px;border-radius:999px;background:var(--dsw-alias-bg-skeleton);overflow:hidden}',
      '.aup-series-fill{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--dsw-alias-brand-primary),color-mix(in srgb,var(--dsw-alias-brand-primary) 55%,var(--dsw-alias-bg-layer-1)))}',
      '.aup-series-value{display:flex;flex-direction:row;align-items:baseline;justify-content:flex-end;gap:6px;font-weight:500;line-height:16px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}',
      '.aup-series-tokens{font-size:13px;line-height:16px;font-variant-numeric:tabular-nums}',
      '.aup-series-cost{font-size:13px;line-height:16px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.aup-series-row[data-current] .aup-series-label,.aup-series-row[data-current] .aup-series-value{color:var(--dsw-alias-label-primary);font-weight:500}',
      '.aup-series-row[data-current] .aup-series-cost{color:var(--dsw-alias-label-primary)}',
      '.aup-tab-title{display:inline-flex;align-items:center;gap:6px;min-width:0;overflow:hidden}',
      '.aup-tab-title-text{min-width:0;white-space:nowrap}',
      // ---- one shared type scale: every Chinese text is 13px, only numbers vary by role ----
      '.aup-card{gap:6px;padding:10px}',
      '.aup-card-title{font-size:13px;line-height:16px;font-weight:500}',
      '.aup-card-icon{width:15px;height:15px}',
      '.aup-card-icon svg{width:100%;height:100%}',
      '.aup-dim{height:22px;font-size:13px;line-height:16px}',
      '.aup-session-total-value{font-size:20px;line-height:26px}',
      '.aup-session-total-label{font-size:13px;line-height:16px}',
      '.aup-session-label{font-size:13px;line-height:16px}',
      '.aup-session-value{font-size:13px;line-height:16px;font-weight:500}',
      '.aup-card-session .aup-session-grid{gap:8px 12px}',
      '.aup-compose{height:6px}',
      '.aup-bar{height:6px}',
      '.aup-context{gap:4px}',
      '.aup-context-head{font-size:13px;line-height:16px}',
      '.aup-stats-summary{font-size:13px;line-height:16px}',
      '.aup-stats-total{font-size:20px;line-height:26px}',
      '.aup-card-stats .aup-series{flex:1 1 auto;min-height:0}',
      '.aup-card-stats .aup-series-row{font-size:13px;line-height:16px}',
      '.aup-card-stats .aup-series-track{height:6px}',
      '.aup-card-stats .aup-series-label,.aup-card-stats .aup-series-tokens{font-size:inherit;line-height:15px}',
      '.aup-card-stats .aup-series-cost{font-size:13px;line-height:16px}',
      '.aup-card-account .aup-balance-item{flex-direction:row;align-items:baseline;justify-content:space-between;gap:8px;min-width:0}',
      '.aup-card-account .aup-balance{grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:4px 16px;align-content:center;padding:2px 0}',
      '.aup-card-account .aup-balance-value{font-size:16px;line-height:22px;letter-spacing:0}',
      '.aup-card-account .aup-balance-value.aup-minor{font-size:16px;line-height:22px;font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.aup-card-account .aup-balance-value.aup-value-long{font-size:14px}',
      '.aup-card-account .aup-balance-value.aup-value-longer{font-size:12px}',
      '.aup-card-account .aup-balance-label{font-size:13px;line-height:16px;font-weight:500}',
      '.aup-hint{font-size:13px;line-height:16px}',
      // ---- content shedding at short card heights (no scrolling) ----
      '@container aup-card (max-height:380px){.aup-card-session .aup-compose{display:none}}',
      '@container aup-card (max-height:330px){.aup-card-session .aup-stat-list{display:none}}',
      '@container aup-card (max-height:260px){.aup-card-session .aup-models{display:none}}',
      '@container aup-card (max-height:250px){.aup-card-session .aup-context{display:none}}',
      '@container aup-card (max-height:150px){.aup-card-session .aup-session-grid{display:none}}',
      '@container aup-card (max-height:180px){.aup-card-stats .aup-stats-summary{display:none}}'
    ].join('\n');

    // --------------------------------------------------------------- glyphs --

    /** Wallet glyph used by the panel header, the guide card, and the foot action. */
    function WalletGlyph({ size = 16 }) {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          'aria-hidden': true,
          focusable: 'false'
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
        icon === undefined ? null : h('span', { className: 'aup-card-icon' }, h(icon, { size: 14 })),
        h('h3', { className: 'aup-card-title' }, title),
        extra === undefined ? null : extra
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

    /** Provider id that bills the signed-in DeepSeek account balance. */
    const ACCOUNT_PROVIDER = 'deepseek-account';

    function providerLabel(provider, t) {
      if (provider === 'deepseek-account') return t('provider.deepseekAccount');
      if (provider === 'deepseek' || (typeof provider === 'string' && provider.startsWith('deepseek-api'))) return t('provider.deepseekApiKey');
      return PROVIDER_NAMES[provider] === undefined ? provider : PROVIDER_NAMES[provider];
    }

    /** Short display name for a model id: the last path segment without routing prefixes. */
    function shortModelName(model) {
      if (typeof model !== 'string' || model === '') return '—';
      const index = model.lastIndexOf('/');
      const tail = index >= 0 ? model.slice(index + 1) : model;
      return tail.replace(/^~+/, '');
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
    function moneyText(amount, currency, locale) {
      const key = String(currency === undefined ? '' : currency) + '|' + String(locale === undefined ? '' : locale);
      let formatter = moneyFormatters.get(key);
      if (formatter === undefined) {
        try {
          formatter = new Intl.NumberFormat(locale === undefined ? undefined : locale, {
            style: 'currency',
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          });
        } catch (error) {
          formatter = null;
        }
        moneyFormatters.set(key, formatter);
      }
      if (formatter !== null) return formatter.format(amount);
      const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : '';
      return symbol + amount.toFixed(2);
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
      { id: 'year', key: 'stats.dim.year', buckets: 3 }
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
          return pad(month + 1) + '-' + pad(start.getDate());
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

    /** The most recent bucket starts of one dimension, oldest first. */
    function bucketStarts(dimensionId, now) {
      const dimension = DIMENSIONS.find((entry) => entry.id === dimensionId) || DIMENSIONS[0];
      const currentStart = startOfBucket((now === undefined ? new Date() : now).getTime(), dimension.id);
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
      const { starts } = bucketStarts(dimensionId, now);
      const reference = now === undefined ? new Date() : now;
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

    /** Platform usage over one dimension's window, folded into day records. */
    async function readPlatformUsage(dimension, force) {
      restorePersistedMonths();
      const months = monthsForDimension(dimension, new Date());
      const results = await mapLimit(months, 6, (period) => readPlatformMonth(period, force === true && isCurrentMonth(period)));
      const failed = results.find((result) => result.ok !== true);
      if (failed !== undefined) return { ok: false, code: failed.code };
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
              totalTokens: Number.isFinite(body.data.totalTokens) ? body.data.totalTokens : 0
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

    /** Derived session statistics for the provider detail card. */
    function buildDetailStats({ t, usage, sessionStats, requestCount, total }) {
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
      return [
        { key: 'turnsSteps', label: t('tokens.stat.turnsSteps'), value: turns === undefined && steps === undefined ? undefined : (turns === undefined ? '—' : String(turns)) + ' / ' + (steps === undefined ? '—' : String(steps)) },
        { key: 'requests', label: t('tokens.stat.requests'), value: requestCount > 0 ? String(requestCount) : undefined },
        { key: 'cacheHit', label: t('tokens.stat.cacheHit'), value: cacheHit === undefined ? undefined : cacheHit + '%' },
        { key: 'average', label: t('tokens.stat.avg'), value: average === undefined || average <= 0 ? undefined : formatTokens(average) },
        { key: 'speed', label: t('tokens.stat.speed'), value: speed === undefined || speed <= 0 ? undefined : speed + ' tok/s' },
        { key: 'llm', label: t('tokens.stat.llm'), value: llmTime },
        { key: 'tool', label: t('tokens.stat.tool'), value: toolTime },
        { key: 'ttft', label: t('tokens.stat.ttft'), value: ttft }
      ].filter((item) => item.value !== undefined);
    }

    /** First fetchedAt among provider balance rows (all rows share the same fetch). */
    function singleFetchedAt(rows) {
      for (const row of rows) {
        if (row !== null && row !== undefined && Number.isFinite(row.fetchedAt)) return row.fetchedAt;
      }
      return undefined;
    }

    /** Provider session detail: per-model totals plus context composition. */
    function SessionDetailCard({ t, useProjection, sessionModels, extraLabel }) {
      const usage = useProjection('tokenUsage');
      const sessionStats = useProjection('sessionStats');
      const pressure = useProjection('contextPressure');
      const contextBreakdown = useProjection('contextBreakdown');
      const modelRows = sessionModels !== null && sessionModels !== undefined && Array.isArray(sessionModels.items) ? sessionModels.items : [];
      const total = usage ? (usage.uncachedInputTokens || 0) + (usage.outputTokens || 0) + (usage.cacheReadTokens || 0) + (usage.cacheWriteTokens || 0) : 0;
      const requestCount = modelRows.reduce((sum, item) => sum + (Number.isFinite(item.requests) ? item.requests : 0), 0);
      const detailItems = buildDetailStats({ t, usage, sessionStats, requestCount, total });
      const sessionTokens = modelRows.reduce((sum, item) => sum + (Number.isFinite(item.tokens) ? item.tokens : 0), 0);
      const renderModel = (item) => {
        const text = shortModelName(item.model);
        const share = sessionTokens > 0 && Number.isFinite(item.tokens) ? Math.round((item.tokens / sessionTokens) * 100) : 0;
        return h(
          'div',
          { key: (item.provider || '') + '/' + item.model, className: 'aup-model-item' },
          h(
            'div',
            { className: 'aup-model-row' },
            h('span', { className: 'aup-model-name' + (text.length > 22 ? ' aup-model-name-long' : ''), title: item.model }, text),
            h('span', { className: 'aup-model-tokens' }, formatTokens(item.tokens))
          ),
          h(
            'div',
            { className: 'aup-model-meta' },
            h('span', null, t('tokens.modelMeta', { requests: String(Number.isFinite(item.requests) ? item.requests : 0), share: String(share) }))
          ),
          modelRows.length > 1
            ? h('div', { className: 'aup-model-track' }, h('span', { className: 'aup-model-fill', style: { width: share + '%' } }))
            : null
        );
      };

      const groups = new Map();
      for (const item of modelRows.slice(0, 3)) {
        const key = typeof item.provider === 'string' ? item.provider : '';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      }
      const modelBlock =
        modelRows.length === 0
          ? h(Hint, null, t('tokens.empty'))
          : h(
              'div',
              { className: 'aup-models', 'aria-label': t('tokens.byModel') },
              h(
                'div',
                { className: 'aup-models-head' },
                h('span', { className: 'aup-models-caption' }, t('tokens.byModel')),
                groups.size === 1 && [...groups.keys()][0] !== '' ? h('span', { className: 'aup-models-provider' }, providerLabel([...groups.keys()][0], t)) : null
              ),
              [...groups.entries()].flatMap(([provider, items]) =>
                provider === '' || groups.size === 1
                  ? items.map((item) => renderModel(item))
                  : [
                      h('span', { key: 'provider-' + provider, className: 'aup-model-provider' }, providerLabel(provider, t)),
                      ...items.map((item) => renderModel(item))
                    ]
              ),
              modelRows.length > 3 ? h('span', { className: 'aup-model-more' }, t('tokens.moreModels', { count: String(modelRows.length - 3) })) : null
            );

      const usedTokens =
        pressure && Number.isFinite(pressure.projectedTokens)
          ? pressure.projectedTokens
          : pressure && Number.isFinite(pressure.pressureTokens)
            ? pressure.pressureTokens
            : undefined;
      const contextWindow = pressure && Number.isFinite(pressure.contextWindow) ? pressure.contextWindow : undefined;
      const hasContext = usedTokens !== undefined && contextWindow !== undefined && contextWindow > 0;
      const percent = hasContext ? Math.min(100, Math.round((usedTokens / contextWindow) * 100)) : 0;
      const contextParts = contextBreakdown === null || contextBreakdown === undefined
        ? []
        : [
            { key: 'system', label: t('tokens.breakdown.system'), value: Number.isFinite(contextBreakdown.systemTokens) ? contextBreakdown.systemTokens : 0, color: 'var(--dsw-static-neutral-bluish-400, #adb2b8)' },
            { key: 'tools', label: t('tokens.breakdown.tools'), value: Number.isFinite(contextBreakdown.toolsTokens) ? contextBreakdown.toolsTokens : 0, color: 'var(--dsw-static-violet-400, #a78bfa)' },
            { key: 'messages', label: t('tokens.breakdown.messages'), value: Number.isFinite(contextBreakdown.messageTokens) ? contextBreakdown.messageTokens : 0, color: 'var(--dsw-static-blue-450, #4d93f8)' }
          ].filter((part) => part.value > 0);
      const contextTotal = contextParts.reduce((sum, part) => sum + part.value, 0);
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
            hasContext ? t('tokens.contextValue', { used: formatTokens(usedTokens), window: formatTokens(contextWindow), percent: String(percent) }) : t('tokens.contextUnknown')
          )
        ),
        hasContext
          ? h(
              'div',
              { className: 'aup-bar' },
              contextTotal === 0
                ? h('span', { className: 'aup-bar-fill', style: { width: percent + '%' } })
                : h(
                    'span',
                    { className: 'aup-context-used', style: { width: percent + '%' } },
                    contextParts.map((part) => h('span', { key: part.key, className: 'aup-context-seg', style: { flexGrow: part.value, background: part.color } }))
                  )
            )
          : null,
        contextTotal === 0
          ? null
          : h(
              'div',
              { className: 'aup-context-breakdown' },
              h(
                'div',
                { className: 'aup-context-legend' },
                contextParts.map((part) => h('span', { key: part.key, className: 'aup-context-legend-item' }, part.label + ' ' + Math.round((part.value / contextTotal) * 100) + '%'))
              )
            )
      );

      return h(
        'section',
        { className: 'aup-card aup-card-detail' },
        h(CardHead, {
          icon: ChartGlyph,
          title: t('tokens.detail'),
          extra: typeof extraLabel === 'string' && extraLabel !== '' ? h('span', { className: 'aup-badge' }, extraLabel) : null
        }),
        h('span', { className: 'aup-divider', 'aria-hidden': true }),
        h(
          'div',
          { className: 'aup-detail-body' },
          detailItems.length === 0
            ? null
            : h(
                'div',
                { className: 'aup-stat-list' },
                detailItems.map((item) => h('div', { key: item.key, className: 'aup-stat-row' }, h('span', { className: 'aup-stat-label' }, item.label), h('span', { className: 'aup-stat-value' }, item.value)))
              ),
          h('span', { className: 'aup-session-sep', 'aria-hidden': true }),
          modelBlock,
          h('span', { className: 'aup-session-sep', 'aria-hidden': true }),
          contextBlock
        )
      );
    }

    /** One labelled wallet row. */
    function WalletItem({ label, wallet, locale, major }) {
      return h(
        'div',
        { className: 'aup-balance-item' },
        h('span', { className: 'aup-balance-label' }, label),
        (() => {
          const text = formatMoney(wallet.balance, wallet.currency, locale);
          return h('span', { className: 'aup-balance-value' + (major ? '' : ' aup-minor') + valueClass(text) }, text);
        })()
      );
    }

    /** Hint copy: wraps when needed, never truncated. */
    function Hint({ children }) {
      return h('p', { className: 'aup-hint', title: typeof children === 'string' ? children : undefined }, children);
    }

    /** Error copy: wraps when needed, never truncated. */
    function ErrorText({ children }) {
      return h('p', { className: 'aup-error', title: typeof children === 'string' ? children : undefined }, children);
    }

    /** Signed-in identity and wallet balances. */
    function AccountSection({ state, t, onRetry, offAccountLabel, offAccountAll, providerBalances, sessionUsage, locale: uiLocale }) {
      const result = state.result;
      const accountLocale = result === undefined ? undefined : result.locale;
      const locale = uiLocale === undefined ? accountLocale : uiLocale;
      const head = [
        h(CardHead, {
          icon: WalletGlyph,
          title: t('account.title'),
          extra:
            offAccountAll === true
              ? typeof offAccountLabel === 'string' && offAccountLabel !== ''
                ? h('span', { className: 'aup-badge' }, offAccountLabel)
                : null
              : typeof offAccountLabel === 'string' && offAccountLabel !== ''
                ? h('span', { className: 'aup-badge', title: t('account.offAccountPartial', { provider: offAccountLabel }) }, t('account.partialBadge', { provider: offAccountLabel }))
                : null
        }),
        h('span', { className: 'aup-divider', 'aria-hidden': true })
      ];

      if (offAccountAll === true) {
        const providerHead = [
          h(CardHead, {
            icon: WalletGlyph,
            title: t('account.title'),
            extra: offAccountLabel === '' ? null : h('span', { className: 'aup-badge' }, offAccountLabel)
          }),
          h('span', { className: 'aup-divider', 'aria-hidden': true })
        ];
        const phase = providerBalances === null || providerBalances === undefined ? 'loading' : providerBalances.phase;
        const rows = phase === 'ready' && Array.isArray(providerBalances.items) ? providerBalances.items : [];
        if (phase !== 'ready') return h('section', { className: 'aup-card aup-card-account aup-card-account-provider' }, providerHead, h(Hint, null, t('loading')));
        if (rows.length === 0) {
          const code = providerBalances.error;
          if (code === 'unsupported_provider') {
            const usageRows = Array.isArray(sessionUsage)
              ? sessionUsage.filter((row) => row !== null && row !== undefined && Number.isFinite(row.tokens) && row.tokens > 0)
              : [];
            return h(
              'section',
              { className: 'aup-card aup-card-account aup-card-account-provider' },
              providerHead,
              h(
                'div',
                { className: 'aup-provider-body' },
                h('p', { className: 'aup-provider-note' }, t('account.providerNoBalance', { provider: offAccountLabel })),
                usageRows.length === 0
                  ? null
                  : h(
                      'div',
                      { className: 'aup-provider-figures' },
                      usageRows.map((row) =>
                        h(
                          'div',
                          { key: row.provider, className: 'aup-provider-figure' },
                          h('span', { className: 'aup-provider-figure-label' }, row.label === '' ? t('tokens.sessionUsage') : row.label + ' · ' + t('tokens.sessionUsage')),
                          h('span', { className: 'aup-provider-figure-value' }, formatTokens(row.tokens)),
                          h('span', { className: 'aup-provider-figure-meta' }, t('tokens.requestsCount', { count: String(row.requests) }))
                        )
                      )
                    )
              )
            );
          }
          const messageKey = code === 'no_credential' ? 'account.providerNoKey' : 'account.providerUnavailable';
          return h(
            'section',
            { className: 'aup-card aup-card-account aup-card-account-provider' },
            providerHead,
            h(Hint, null, t(messageKey, { provider: offAccountLabel })),
            h('div', { className: 'aup-actions' }, h('button', { type: 'button', className: 'aup-retry', onClick: onRetry }, t('retry')))
          );
        }
        const currencyOf = (entry) => (typeof entry.currency === 'string' ? entry.currency : 'USD');
        const updatedAt = Number.isFinite(singleFetchedAt(rows)) ? new Date(singleFetchedAt(rows)) : undefined;
        const updatedTime = updatedAt === undefined ? '' : new Intl.DateTimeFormat(locale || undefined, { hour: '2-digit', minute: '2-digit' }).format(updatedAt);
        const note = h('p', { className: 'aup-provider-note' }, t('account.providerNote', { provider: offAccountLabel }));
        const updated = updatedTime === '' ? null : h('p', { className: 'aup-provider-updated' }, t('account.providerUpdated', { time: updatedTime }));
        if (rows.length > 1) {
          const items = [];
          for (const entry of rows) {
            const currency = currencyOf(entry);
            const prefix = providerLabel(entry.provider, t) + ' ';
            if (Number.isFinite(entry.remaining)) items.push(h('div', { key: entry.provider + '-remaining', className: 'aup-balance-item' }, h('span', { className: 'aup-balance-label' }, prefix + t('balance.recharge')), h('span', { className: 'aup-balance-value' }, formatMoney(String(entry.remaining), currency, locale))));
            if (Number.isFinite(entry.used)) items.push(h('div', { key: entry.provider + '-used', className: 'aup-balance-item' }, h('span', { className: 'aup-balance-label' }, prefix + t('balance.used')), h('span', { className: 'aup-balance-value aup-minor' }, formatMoney(String(entry.used), currency, locale))));
          }
          return h('section', { className: 'aup-card aup-card-account aup-card-account-provider' }, providerHead, h('div', { className: 'aup-provider-body' }, h('div', { className: 'aup-balance' }, items), updated, note));
        }

        const single = rows[0];
        const currency = currencyOf(single);
        const remaining = Number.isFinite(single.remaining) ? single.remaining : undefined;
        const used = Number.isFinite(single.used) ? single.used : undefined;
        const total = Number.isFinite(single.total) ? single.total : undefined;
        const granted = Number.isFinite(single.granted) ? single.granted : undefined;
        const heroLabel = remaining !== undefined ? t('balance.recharge') : used !== undefined ? t('balance.used') : total !== undefined ? t('balance.total') : t('balance.recharge');
        const heroValue = remaining !== undefined ? remaining : used !== undefined ? used : total !== undefined ? total : 0;
        const totalKnown = total !== undefined ? total : remaining !== undefined && used !== undefined ? remaining + used : undefined;
        const usedPercent = used !== undefined && totalKnown !== undefined && totalKnown > 0 ? Math.min(100, Math.max(0, Math.round((used / totalKnown) * 1000) / 10)) : undefined;
        const meta = [];
        if (usedPercent === undefined) {
          if (remaining !== undefined && heroLabel !== t('balance.recharge')) meta.push({ key: 'remaining', label: t('balance.recharge'), value: remaining });
          if (used !== undefined && heroLabel !== t('balance.used')) meta.push({ key: 'used', label: t('balance.used'), value: used });
          if (total !== undefined && heroLabel !== t('balance.total')) meta.push({ key: 'total', label: t('balance.total'), value: total });
        }
        if (granted !== undefined) meta.push({ key: 'granted', label: t('balance.bonus'), value: granted });
        return h(
          'section',
          { className: 'aup-card aup-card-account aup-card-account-provider' },
          providerHead,
          h(
            'div',
            { className: 'aup-provider-body' },
            h(
              'div',
              { className: 'aup-provider-hero' },
              h('span', { className: 'aup-provider-hero-label' }, heroLabel),
              (() => {
                const text = formatMoney(String(heroValue), currency, locale);
                return h('span', { className: 'aup-provider-hero-value' + valueClass(text) }, text);
              })()
            ),
            usedPercent === undefined
              ? null
              : h(
                  'div',
                  { className: 'aup-provider-progress' },
                  h(
                    'div',
                    { className: 'aup-provider-rate' },
                    h('span', null, t('account.providerUsedRate', { percent: String(usedPercent) }) + (used === undefined ? '' : ' · ' + formatMoney(String(used), currency, locale))),
                    h('span', null, totalKnown === undefined ? '' : formatMoney(String(totalKnown), currency, locale))
                  ),
                  h('div', { className: 'aup-bar' }, h('span', { className: 'aup-bar-fill', style: { width: usedPercent + '%' } }))
                ),
            updated,
            meta.length === 0
              ? null
              : h(
                  'div',
                  { className: 'aup-provider-meta' },
                  meta.map((item) => h('div', { key: item.key, className: 'aup-provider-meta-item' }, h('span', { className: 'aup-provider-meta-label' }, item.label), (() => {
                    const text = formatMoney(String(item.value), currency, locale);
                    return h('span', { className: 'aup-provider-meta-value' + valueClass(text) }, text);
                  })()))
                ),
            note
          )
        );
      }

      if (state.phase === 'loading') {
        return h('section', { className: 'aup-card aup-card-account' }, head, h(Hint, null, t('loading')));
      }
      if (state.phase === 'error' || !result || result.ok !== true) {
        const code = result && typeof result.code === 'string' ? result.code : '';
        const reasonKey = code === '' ? '' : 'stats.reason.' + code;
        const reason = reasonKey !== '' && t(reasonKey) !== reasonKey ? t(reasonKey) : '';
        const rawDetail = result && result.message ? String(result.message) : '';
        const chinese = String(locale || '').toLowerCase().startsWith('zh');
        const detail = reason !== '' ? reason : chinese ? rawDetail : '';
        return h(
          'section',
          { className: 'aup-card aup-card-account' },
          head,
          h(ErrorText, null, t('error')),
          detail === '' ? null : h(Hint, null, detail),
          h('div', { className: 'aup-actions' }, h('button', { type: 'button', className: 'aup-retry', onClick: onRetry }, t('retry')))
        );
      }

      const view = result.view || {};
      if (view.status !== 'credential-stored') {
        return h(
          'section',
          { className: 'aup-card aup-card-account' },
          head,
          h(Hint, null, t('account.signedOut')),
          h(Hint, null, t('account.signedOutHint'))
        );
      }

      const balance = result.balance;
      const wallets = balance && balance.status === 'ready' ? balance.value || [] : [];
      const bonusWallets = balance && balance.status === 'ready' ? balance.bonusWallets || [] : [];
      const walletItems = wallets.map((wallet, index) =>
        h(WalletItem, { key: 'w' + index, label: t('balance.recharge'), wallet, locale, major: index === 0 })
      );
      const bonusItems = bonusWallets.map((wallet, index) =>
        h(WalletItem, { key: 'b' + index, label: t('balance.bonus'), wallet, locale, major: false })
      );

      return h(
        'section',
        { className: 'aup-card aup-card-account' },
        head,
        !balance || balance.status === 'failed'
          ? h(Hint, null, t('balance.failed'))
          : walletItems.length === 0 && bonusItems.length === 0
            ? h(Hint, null, t('balance.empty'))
            : h('div', { className: 'aup-balance' }, walletItems, bonusItems),
      );
    }

    /** Date-dimension statistics over real platform usage (local estimates as fallback). */
    function UsageSection({ state, dimension, onDimension, onRetry, t, fallbackCurrency, locale, showCost, thirdPartyLabel, categories }) {
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

      const platformBadge =
        state.source !== 'local' && typeof thirdPartyLabel === 'string' && thirdPartyLabel !== ''
          ? h('span', { className: 'aup-badge', title: t('stats.platformBadgeHint') }, t('stats.platformBadge'))
          : null;
      const head = [
        h(CardHead, {
          icon: ChartGlyph,
          title: t('stats.title'),
          extra: state.source === 'local' ? h('span', { className: 'aup-badge' }, t('stats.localBadge')) : platformBadge
        }),
        h('span', { className: 'aup-divider', 'aria-hidden': true }),
        dimensions
      ];

      if (state.phase === 'loading') {
        const skeletonRows = [];
        for (let index = 0; index < 7; index += 1) {
          skeletonRows.push(
            h(
              'div',
              { key: 'skeleton-' + index, className: 'aup-series-row aup-skeleton-row' },
              h('span', { className: 'aup-skeleton aup-skeleton-label' }),
              h('span', { className: 'aup-skeleton aup-skeleton-track' }),
              h('span', { className: 'aup-skeleton aup-skeleton-value' })
            )
          );
        }
        return h(
          'section',
          { className: 'aup-card aup-card-stats', 'aria-busy': true },
          head,
          h('span', { className: 'aup-sr-only' }, t('stats.loading')),
          h('div', { className: 'aup-series', 'aria-hidden': true }, skeletonRows)
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
          reasonText === '' ? null : h(Hint, null, reasonText),
          h(
            'div',
            { className: 'aup-actions' },
            h('button', { type: 'button', className: 'aup-retry', onClick: onRetry }, t('retry'))
          )
        );
      }

      const source = state.source === 'platform' ? 'platform' : 'local';
      const estimate = source !== 'platform';
      const currency = typeof state.currency === 'string' && state.currency !== '' ? state.currency : fallbackCurrency || 'CNY';
      const series = buildSeries(state.days || [], dimension);
      const summary = t(source === 'platform' ? 'stats.summary.requests' : 'stats.summary.sessions', {
        total: formatTokens(series.total),
        count: String(series.count)
      });
      const rows = series.cells.map((cell) => {
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
          h(
            'span',
            { className: 'aup-series-track' },
            h('span', {
              className: 'aup-series-fill',
              style: {
                width:
                  series.max === 0 || cell.total === 0
                    ? '0%'
                    : Math.max(2, Math.round((cell.total / series.max) * 100)) + '%'
              }
            })
          ),
          h(
            'span',
            { className: 'aup-series-value' },
            h('span', { className: 'aup-series-tokens' }, formatTokens(cell.total)),
            showCost !== false && cell.cost > 0
              ? h('span', { className: 'aup-series-cost' }, formatCost(cell.cost, currency, locale, estimate))
              : null
          )
        );
      });

      const extraSources = (Array.isArray(categories) ? categories : []).filter(
        (row) => row !== null && row !== undefined && Number.isFinite(row.tokens) && row.tokens > 0
      );
      const sourceBlock =
        extraSources.length === 0
          ? null
          : h(
              'div',
              { className: 'aup-sources' },
              h(
                'div',
                { key: 'account', className: 'aup-source-row aup-source-row-account' },
                h('span', { className: 'aup-source-label' }, t('stats.platformBadge')),
                h('span', { className: 'aup-source-tokens' }, formatTokens(series.total)),
                showCost === false
                  ? null
                  : h('span', { className: 'aup-source-cost' }, formatCost(series.cost, currency, locale, estimate))
              ),
              extraSources.map((row) =>
                h(
                  'div',
                  { key: row.provider, className: 'aup-source-row' },
                  h('span', { className: 'aup-source-label' }, row.label),
                  h('span', { className: 'aup-source-tokens' }, formatTokens(row.tokens)),
                  h('span', { className: 'aup-source-cost' }, t('stats.sessionScope'))
                )
              )
            );

      return h(
        'section',
        { className: 'aup-card aup-card-stats' },
        head,
        sourceBlock === null
          ? h(
              'div',
              { className: 'aup-stats-summary' },
              h('span', null, summary),
              showCost !== false
                ? h('span', { className: 'aup-stats-total' }, formatCost(series.cost, currency, locale, estimate))
                : null
            )
          : sourceBlock,
        series.total === 0
          ? h(Hint, null, t('stats.empty'))
          : h('div', { className: 'aup-series' }, rows)
      );
    }

    /** This session's durable token totals plus context occupancy. */
    function TokenSection({ useProjection, t, sessionModels, providerMode }) {
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
        { key: 'llm', label: t('tokens.stat.llm'), value: llmTime },
        { key: 'tool', label: t('tokens.stat.tool'), value: toolTime },
        { key: 'ttft', label: t('tokens.stat.ttft'), value: ttft }
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

      const groups = new Map();
      for (const item of modelRows.slice(0, 3)) {
        const key = typeof item.provider === 'string' ? item.provider : '';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      }
      const modelBlock =
        providerMode === true || modelRows.length === 0
          ? null
          : h(
              'div',
              { className: 'aup-models', 'aria-label': t('tokens.byModel') },
              h(
                'div',
                { className: 'aup-models-head' },
                h('span', { className: 'aup-models-caption' }, t('tokens.byModel')),
                groups.size === 1 && [...groups.keys()][0] !== '' ? h('span', { className: 'aup-models-provider' }, providerLabel([...groups.keys()][0], t)) : null
              ),
              [...groups.entries()].flatMap(([provider, items]) =>
                provider === '' || groups.size === 1
                  ? items.map((item) =>
                      h(
                        'div',
                        { key: (item.provider || '') + '/' + item.model, className: 'aup-model-row' },
                        (() => {
                        const text = shortModelName(item.model);
                        return h('span', { className: 'aup-model-name' + (text.length > 22 ? ' aup-model-name-long' : ''), title: item.model }, text);
                      })(),
                        h('span', { className: 'aup-model-tokens' }, formatTokens(item.tokens))
                      )
                    )
                  : [
                      h('span', { key: 'provider-' + provider, className: 'aup-model-provider' }, providerLabel(provider, t)),
                      ...items.map((item) =>
                        h(
                          'div',
                          { key: (item.provider || '') + '/' + item.model, className: 'aup-model-row' },
                          (() => {
                        const text = shortModelName(item.model);
                        return h('span', { className: 'aup-model-name' + (text.length > 22 ? ' aup-model-name-long' : ''), title: item.model }, text);
                      })(),
                          h('span', { className: 'aup-model-tokens' }, formatTokens(item.tokens))
                        )
                      )
                    ]
              ),
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
        providerMode === true || detailItems.length === 0 ? null : h('span', { className: 'aup-session-sep', 'aria-hidden': true }),
        providerMode === true || detailItems.length === 0
          ? null
          : h(
              'div',
              { className: 'aup-stat-list' },
              detailItems.map((item) =>
                h('div', { key: item.key, className: 'aup-stat-row' }, h('span', { className: 'aup-stat-label' }, item.label), h('span', { className: 'aup-stat-value' }, item.value))
              )
            ),
        modelBlock === null ? null : h('span', { className: 'aup-session-sep', 'aria-hidden': true }),
        modelBlock,
        providerMode === true ? null : h('span', { className: 'aup-session-sep', 'aria-hidden': true }),
        providerMode === true ? null : h(
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
                { className: 'aup-bar' },
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
      const [sessionModels, setSessionModels] = React.useState({ phase: 'idle', items: [], totalTokens: 0 });
      const [providerBalances, setProviderBalances] = React.useState({ phase: 'idle', items: [], error: undefined });
      const [settings, setSettings] = React.useState(readSettings);
      const [dimension, setDimension] = React.useState(settings.dimension);
      const [accountRequest, setAccountRequest] = React.useState({ count: 0, force: false });
      const [usageRequest, setUsageRequest] = React.useState({ count: 0, force: false });
      const [settingsOpen, setSettingsOpen] = React.useState(false);
      const gearRef = React.useRef(null);
      const [localeId, setLocaleId] = React.useState(readLocale);
      const t = React.useMemo(() => bindTranslation(), [bindTranslation, localeId]);
      const displayLocale = String(localeId).toLowerCase().startsWith('zh') ? localeId : 'en';

      React.useEffect(() => {
        const update = () => setLocaleId(readLocale());
        update();
        return subscribeLocale(update);
      }, [readLocale, subscribeLocale]);
      const busy = account.refreshing === true || usage.refreshing === true;
      const sessionProviders = [...new Set((sessionModels.items || []).map((item) => item.provider).filter((provider) => typeof provider === 'string' && provider !== ''))];
      const offAccountProviders = sessionProviders.filter((provider) => !isAccountProvider(provider));
      const offAccountLabel = [...new Set(offAccountProviders.map((provider) => providerLabel(provider, t)))].join(' / ');
      const offAccountAll = sessionProviders.length > 0 && offAccountProviders.length === sessionProviders.length;
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
                // Year is the widest window: warming it also fills the month cache that
                // every narrower dimension reuses, so one background pass is enough.
                if (currentDimension !== 'year' && !dimensionResults.has('year')) {
                  setTimeout(() => {
                    (async () => {
                      try {
                        const warm = await readUsage('year', false, currencyRef.current);
                        if (warm.ok === true && warm.source === 'platform' && !dimensionResults.has('year')) {
                          dimensionResults.set('year', {
                            source: warm.source,
                            days: warm.days || [],
                            currency: warm.currency,
                            reason: warm.reason
                          });
                        }
                      } catch (error) {
                        /* warm-up is best effort */
                      }
                    })();
                  }, 1500);
                }
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
                ? { phase: 'ready', items: result.models, totalTokens: result.totalTokens }
                : { phase: 'empty', items: [], totalTokens: 0 }
            );
          })
          .catch((error) => {
            if (!cancelled) setSessionModels({ phase: 'empty', items: [], totalTokens: 0 });
          });
        return () => {
          cancelled = true;
        };
      }, [sessionId, usageRequest.count, usageRequest.force, readSessionModels]);

      React.useEffect(() => {
        let cancelled = false;
        if (offAccountAll !== true || offAccountProviders.length === 0) {
          setProviderBalances({ phase: 'idle', items: [], error: undefined });
          return undefined;
        }
        setProviderBalances((previous) => ({ ...previous, phase: previous.items.length === 0 ? 'loading' : 'ready' }));
        Promise.all(offAccountProviders.map(async (provider) => ({ provider, result: await readProviderBalances(provider, usageRequest.force === true) })))
          .then((entries) => {
            if (cancelled) return;
            const items = [];
            let error;
            for (const entry of entries) {
              if (entry.result.ok === true) items.push(entry.result);
              else if (error === undefined) error = entry.result.code;
            }
            setProviderBalances({ phase: 'ready', items, error });
          })
          .catch(() => {
            if (!cancelled) setProviderBalances({ phase: 'ready', items: [], error: 'fetch_failed' });
          });
        return () => {
          cancelled = true;
        };
      }, [offAccountAll, offAccountProviders.join('|'), usageRequest.count, usageRequest.force, readProviderBalances]);

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
        { className: 'aup-root' + (offAccountAll === true ? ' aup-provider-mode' : '') },
        h('style', null, CSS),
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
          h(HeaderDecor, {
            t,
            days: displayedUsage.days,
            providerMode: offAccountAll === true,
            providerLabel: offAccountAll === true ? offAccountLabel : ''
          }),
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
          { className: 'aup-cards' },
          settings.cards.session === true ? h(TokenSection, { useProjection, t, sessionModels, providerMode: offAccountAll === true }) : null,
          settings.cards.stats === true && offAccountAll === true
            ? h(SessionDetailCard, { t, useProjection, sessionModels, extraLabel: offAccountLabel })
            : null,
          settings.cards.stats === true && offAccountAll !== true
          ? h(UsageSection, {
              state: displayedUsage,
              dimension,
              onDimension: (next) => setDimension(next),
              onRetry: refresh,
              t,
              fallbackCurrency: currency,
              locale: displayLocale,
              showCost: settings.showCost,
              thirdPartyLabel: offAccountLabel,
              categories: providerSessionUsage
            })
          : null,
          settings.cards.account === true
          ? h(AccountSection, {
              state: account,
              t,
              onRetry: refresh,
              offAccountLabel,
              offAccountAll,
              providerBalances,
              sessionUsage: providerSessionUsage,
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
    function requestNarrowRightbar() {
      if (typeof document === 'undefined') return;
      const minimum = 300;
      const attempt = (tries) => {
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
          if (Number.isFinite(left) && frameWidth > 0 && frameWidth - left <= minimum + 4) return;
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
          fire('pointerdown', startX);
          fire('pointermove', startX + 600);
          fire('pointerup', startX + 600);
          handle.setPointerCapture = setCapture;
          handle.hasPointerCapture = hasCapture;
          handle.releasePointerCapture = releaseCapture;
        } catch (error) {
          /* host-internal detail: leave the current width */
        }
      };
      attempt(0);
    }

    /** Tab chip: wallet glyph plus the short tab title (never the cached long title). */
    function AccountUsageTitle({ useTabInfo, t }) {
      const info = useTabInfo();
      const label = typeof t === 'function' ? t('tab.title') : info.tab.title;
      return h(
        'span',
        { className: 'aup-tab-title' },
        h('span', { className: 'aup-glyph' }, h(WalletGlyph, { size: 15 })),
        h('span', { className: 'aup-tab-title-text' }, label)
      );
    }

    // ----------------------------------------------------------------- apply --

    /** Small header ornament: a 7-day token sparkline, or the provider badge in provider mode. */
    function HeaderDecor({ t, days, providerMode, providerLabel }) {
      if (providerMode === true) {
        return h(
          'span',
          { className: 'aup-head-spark', title: providerLabel },
          h('span', { className: 'aup-live-dot', 'aria-hidden': true }),
          h('span', { className: 'aup-head-spark-label' }, providerLabel)
        );
      }
      const points = (Array.isArray(days) ? days : [])
        .filter((day) => day !== null && day !== undefined && typeof day.date === 'string' && Number.isFinite(day.tokens))
        .sort((left, right) => left.date.localeCompare(right.date))
        .slice(-7);
      if (points.length < 2) {
        return h(
          'span',
          { className: 'aup-head-spark' },
          h('span', { className: 'aup-live-dot', 'aria-hidden': true }),
          h('span', { className: 'aup-head-spark-label' }, t('header.live'))
        );
      }
      const max = Math.max(...points.map((day) => day.tokens), 1);
      const width = 56;
      const height = 18;
      const coordinates = points.map((day, index) => {
        const x = (index / (points.length - 1)) * width;
        const y = height - (day.tokens / max) * (height - 2) - 1;
        return { x, y };
      });
      const line = coordinates.map((p) => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
      const area = '0,' + String(height) + ' ' + line + ' ' + String(width) + ',' + String(height);
      const last = coordinates[coordinates.length - 1];
      return h(
        'span',
        { className: 'aup-head-spark', title: t('header.trendTitle') },
        h('span', { className: 'aup-head-spark-label' }, t('header.trend')),
        h(
          'svg',
          { viewBox: '0 0 ' + String(width) + ' ' + String(height), width: String(width), height: String(height), 'aria-hidden': true },
          h('polygon', { className: 'aup-spark-area', points: area }),
          h('polyline', { className: 'aup-spark-line', points: line }),
          h('circle', { className: 'aup-spark-dot', cx: last.x.toFixed(1), cy: last.y.toFixed(1), r: '2' })
        )
      );
    }

    /** Client plugin body. */
    function apply(ctx) {
      const dictionaries = { zh, en, ja: en, es: en, fr: en, de: en, ru: en, pt: en };
      ctx.effect(() => ctx.locale.register(NS, dictionaries), 'account-usage: dictionaries');

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
          requestNarrowRightbar();
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
              id: 'accountUsage.open',
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
