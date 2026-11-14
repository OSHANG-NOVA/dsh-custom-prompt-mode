/**
 * Browser half of **Custom prompt 模式**.
 *
 * One settings page (`settings.section`, id `custom-prompt-mode`) that owns the
 * system prompt text and the tool switches, and persists both through the host
 * route `/custom-prompt-mode/api`. The host keeps them in memory and on disk,
 * the persona plugin reads the prompt on every assembly, and the host rebuilds
 * the preset whenever the tool selection changes — so saving here is enough for
 * the next session; no restart, no reload.
 *
 * Written without `@deepseek-ai/dsh-client-ui-primitives`: a third-party plugin
 * builds its own controls and styles them with `--dsw-alias-*` theme tokens.
 */
/**
 * Module ids this browser half answers to.
 *
 * The client module graph takes its id from the package name a host resolves
 * the loader row through, and that name differs by install form: an npm or
 * junction install resolves `dsh-custom-prompt-mode`, while a profile that
 * still links the package under its old scoped name resolves
 * `@local/dsh-custom-prompt-mode`. Registering both keeps either install
 * working; a graph that only asks for one leaves the other factory unused.
 */
const CANONICAL_ID = 'dsh-custom-prompt-mode';
const ALIAS_ID = '@local/dsh-custom-prompt-mode';

function defineBundle(require) {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const React = require('react');
    const h = React.createElement;

    /** Page key — also the locale namespace and the slot registration id. */
    const NS = 'customPromptMode';

    /** Host route owned by index.js. */
    const API_URL = '/custom-prompt-mode/api';

    const zh = {
      title: 'Custom prompt',
      heading: 'Custom prompt 模式',
      intro: '这里的文本会完全替换 DSH 的 System Prompt。选择 Custom prompt 模式的会话只会看到下面这段文字，DSH 内置的提示词一律不生效。工具不受 DSH 管理，完全由下面的清单决定。',
      placeholder: '在这里写下你的 System Prompt…',
      save: '保存',
      saving: '保存中…',
      reset: '恢复默认',
      saved: '已保存。提示词下一轮对话即刻生效；工具改动对之后新建的会话生效。',
      resetFilled: '已恢复默认设置，点击保存后生效。',
      loadFailed: '读取失败：',
      saveFailed: '保存失败：',
      loading: '读取中…',
      characters: '字符数',
      badgeDefault: '当前等于默认文本',
      badgeCustom: '当前为自定义文本',
      unsaved: '有未保存的修改',
      inSync: '已与生效内容一致',
      note: '提示词保存后立即生效：所有使用 Custom prompt 模式的会话，下一轮对话就会用上这段文字。',
      shortcut: 'Ctrl + S 保存',
      toolsHeading: '工具组',
      toolsIntro: '下面所有工具都是自动扫描当前安装的插件得到的，装了什么就列什么 —— 每一项都能单独开关，也可以全部关掉或全部打开。取消的工具不会出现在这个模式里，模型看不到也调不到。',
      selectAll: '全选',
      selectNone: '全不选',
      selectedCount: '已选',
      of: '/',
      toolCount: '项工具',
      toolsNote: '工具改动保存后，对之后新建的会话生效；已经在进行的会话保持原来的工具集。',
      translationHeading: '工具说明汉化',
      translationIntro: '插件自带的工具已经有中文说明；第三方插件带进来的工具是英文，可以在这里让模型读一遍原始说明，总结成一句中文。译文会存进状态文件，之后一直复用。',
      translationModel: '使用模型',
      translationAll: '全量汉化',
      translationMissing: '增量汉化',
      translationAllHint: '把所有还没有中文说明的工具都重新总结一遍。',
      translationMissingHint: '只补还没有译文的那些，已经译过的跳过。',
      translationCancel: '取消',
      translationClear: '清空译文',
      translationProgress: '进行中',
      translationDone: '汉化完成',
      translationFailed: '有失败项',
      translationPending: '待汉化',
      translationNone: '没有需要汉化的工具。',
      translationBusy: '正在汉化，完成前不能再次开始。',
      translationNoModels: '当前 profile 没有可用的模型路由，无法汉化。',
      translationNoRoute: '请先选择模型。',
      translationUntranslated: '英文原文',
      translationError: '汉化失败：',
      translationCleared: '译文已清空。',
      groupLabels: {},
    };

    const en = {
      title: 'Custom prompt',
      heading: 'Custom prompt mode',
      intro: 'The text below replaces the DSH system prompt entirely. A session using Custom prompt mode sees only this text — no built-in prompt section survives. Tools are not managed by DSH either: the list below decides them.',
      placeholder: 'Write your system prompt here…',
      save: 'Save',
      saving: 'Saving…',
      reset: 'Restore default',
      saved: 'Saved. The prompt applies from the next turn; tool changes apply to sessions created afterwards.',
      resetFilled: 'Defaults restored — press Save to apply.',
      loadFailed: 'Could not load: ',
      saveFailed: 'Could not save: ',
      loading: 'Loading…',
      characters: 'Characters',
      badgeDefault: 'Currently equal to the default text',
      badgeCustom: 'Currently a custom text',
      unsaved: 'Unsaved changes',
      inSync: 'In sync with the active text',
      note: 'Saved text takes effect immediately: every session using Custom prompt mode picks it up on its next turn.',
      shortcut: 'Ctrl + S to save',
      toolsHeading: 'Tools',
      toolsIntro: 'Every tool below is discovered by scanning the plugins installed in this profile — whatever is mounted gets listed. Each one is an independent switch, and you may turn them all off or all on. A tool you switch off does not exist in this mode — the model can neither see nor call it.',
      selectAll: 'Select all',
      selectNone: 'Select none',
      selectedCount: 'Selected',
      of: '/',
      toolCount: 'tools',
      toolsNote: 'Tool changes apply to sessions created after saving; a session already running keeps its original tool set.',
      translationHeading: 'Chinese tool descriptions',
      translationIntro: 'Tools shipped with this harness already carry Chinese copy; tools brought in by third-party plugins are English. Let a model read the original description and summarise it in one Chinese sentence. Translations are stored in the state file and reused.',
      translationModel: 'Model',
      translationAll: 'Translate all',
      translationMissing: 'Translate missing',
      translationAllHint: 'Re-summarise every tool that has no Chinese description yet.',
      translationMissingHint: 'Only fill the ones still untranslated; skip the rest.',
      translationCancel: 'Cancel',
      translationClear: 'Clear translations',
      translationProgress: 'In progress',
      translationDone: 'Translation finished',
      translationFailed: 'with failures',
      translationPending: 'pending',
      translationNone: 'Nothing left to translate.',
      translationBusy: 'A translation run is in progress; wait for it to finish.',
      translationNoModels: 'This profile mounts no model route, so translation is unavailable.',
      translationNoRoute: 'Pick a model first.',
      translationUntranslated: 'English original',
      translationError: 'Translation failed: ',
      translationCleared: 'Translations cleared.',
      groupLabels: {},
    };

    const css = [
      '.cpm-page{display:flex;flex-direction:column;gap:14px;',
      'color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.6;',
      'padding:4px 2px 28px;max-width:920px;box-sizing:border-box;}',
      '.cpm-title{margin:0;font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary);}',
      '.cpm-intro{margin:0;color:var(--dsw-alias-label-secondary);}',
      '.cpm-editor{display:flex;flex-direction:column;gap:8px;}',
      '.cpm-textarea{width:100%;min-height:280px;resize:vertical;box-sizing:border-box;',
      'padding:12px 14px;border-radius:var(--dsw-radius-md);border:1px solid var(--dsw-alias-border-l1);',
      'background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);',
      'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.65;',
      'outline:none;tab-size:2;}',
      '.cpm-textarea:focus{border-color:var(--dsw-focus-ring-color);}',
      '.cpm-textarea::placeholder{color:var(--dsw-alias-label-caption);}',
      '.cpm-textarea[disabled]{opacity:.6;cursor:default;}',
      '.cpm-meta{display:flex;flex-wrap:wrap;gap:10px;align-items:center;',
      'color:var(--dsw-alias-label-caption);font-size:12px;}',
      '.cpm-badge{display:inline-flex;align-items:center;gap:5px;padding:1px 8px;',
      'border-radius:999px;border:1px solid var(--dsw-alias-border-l1);',
      'background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11.5px;}',
      '.cpm-badge[data-tone="warn"]{color:var(--dsw-alias-state-error-primary);',
      'border-color:var(--dsw-alias-state-error-primary);}',
      '.cpm-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}',
      '.cpm-button{appearance:none;cursor:pointer;padding:6px 16px;border-radius:var(--dsw-radius-md);',
      'border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);',
      'color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;transition:background .12s ease;}',
      '.cpm-button:hover:not([disabled]){background:var(--dsw-alias-interactive-bg-hover);}',
      '.cpm-button[disabled]{opacity:.5;cursor:default;}',
      '.cpm-button[data-variant="primary"]{background:var(--dsw-alias-bg-module-platform);',
      'border-color:transparent;color:var(--dsw-alias-label-primary);font-weight:600;}',
      '.cpm-message{font-size:12px;color:var(--dsw-alias-label-secondary);}',
      '.cpm-message[data-tone="error"]{color:var(--dsw-alias-state-error-primary);}',
      '.cpm-note{color:var(--dsw-alias-label-caption);font-size:12px;margin:0;}',
      '.cpm-shortcut{color:var(--dsw-alias-label-dimmed);font-size:11.5px;}',
      '.cpm-section-head{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;margin-top:6px;}',
      '.cpm-section-title{margin:0;font-size:14px;font-weight:600;}',
      '.cpm-tools{margin:0;color:var(--dsw-alias-label-secondary);}',
      '.cpm-group{border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);',
      'background:var(--dsw-alias-bg-layer-1);overflow:hidden;}',
      '.cpm-group + .cpm-group{margin-top:8px;}',
      '.cpm-group-head{display:flex;align-items:center;gap:8px;padding:7px 12px;',
      'background:var(--dsw-alias-bg-layer-2);border-bottom:1px solid var(--dsw-alias-border-l1);}',
      '.cpm-group-name{font-weight:600;font-size:12.5px;color:var(--dsw-alias-label-primary);}',
      '.cpm-group-count{margin-left:auto;color:var(--dsw-alias-label-caption);font-size:11.5px;}',
      '.cpm-group-split{appearance:none;cursor:pointer;border:0;background:transparent;padding:0 2px;',
      'color:var(--dsw-alias-label-tertiary);font-size:11.5px;text-decoration:underline;}',
      '.cpm-group-split:hover{color:var(--dsw-alias-label-primary);}',
      '.cpm-tool{display:flex;gap:10px;align-items:flex-start;padding:8px 12px;cursor:pointer;}',
      '.cpm-tool + .cpm-tool{border-top:1px solid var(--dsw-alias-border-l1);}',
      '.cpm-tool:hover{background:var(--dsw-alias-interactive-bg-hover);}',
      '.cpm-tool input{margin:3px 0 0;flex:none;cursor:pointer;}',
      '.cpm-tool-body{display:flex;flex-direction:column;gap:1px;min-width:0;}',
      '.cpm-tool-label{font-size:12.5px;color:var(--dsw-alias-label-primary);}',
      '.cpm-tool-hint{font-size:11.5px;color:var(--dsw-alias-label-caption);line-height:1.5;}',
      '.cpm-tool[data-off="true"] .cpm-tool-label{color:var(--dsw-alias-label-tertiary);}',
      '.cpm-flag{display:inline-block;margin-left:6px;padding:0 5px;border-radius:999px;',
      'border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-dimmed);font-size:10.5px;}',
      '.cpm-translation{display:flex;flex-direction:column;gap:8px;padding:10px 12px;',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);',
      'background:var(--dsw-alias-bg-layer-1);}',
      '.cpm-select{appearance:none;padding:5px 10px;border-radius:var(--dsw-radius-md);',
      'border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);',
      'color:var(--dsw-alias-label-primary);font-size:12.5px;cursor:pointer;max-width:340px;}',
      '.cpm-select:focus{outline:none;border-color:var(--dsw-focus-ring-color);}',
      '.cpm-select[disabled]{opacity:.6;cursor:default;}',
      '.cpm-progress{display:flex;flex-wrap:wrap;gap:8px;align-items:center;',
      'color:var(--dsw-alias-label-secondary);font-size:12px;}',
      '.cpm-bar{position:relative;flex:1 1 160px;min-width:120px;height:5px;border-radius:999px;',
      'background:var(--dsw-alias-bg-layer-3);overflow:hidden;}',
      '.cpm-bar-fill{position:absolute;inset:0 auto 0 0;background:var(--dsw-alias-bg-module-platform);',
      'transition:width .2s ease;}',
    ].join('');

    /** Narrow an unknown JSON value to a plain object. */
    function asRecord(value) {
      return value !== null && typeof value === 'object' ? value : undefined;
    }

    /** Pull the human-readable error out of a failed route response. */
    function errorText(payload, fallback) {
      const message = asRecord(asRecord(payload)?.error)?.message;
      return typeof message === 'string' && message !== '' ? message : fallback;
    }

    /** Copy `source` into a plain boolean map, keeping only booleans. */
    function booleanMap(source) {
      const result = {};
      const record = asRecord(source);
      if (record === undefined) return result;
      for (const [key, value] of Object.entries(record)) {
        if (typeof value === 'boolean') result[key] = value;
      }
      return result;
    }

    /** Whether two switch maps hold the same values. */
    function sameMap(left, right) {
      const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
      for (const key of keys) if (left[key] !== right[key]) return false;
      return true;
    }

    /**
     * Pick one side of a `{zh, en}` label map for the active language.
     *
     * Read at render time: the shell re-renders outlets on a locale revision
     * bump, so the page never needs its own subscription.
     */
    function pickLabel(label, lang) {
      const record = asRecord(label);
      if (record === undefined) return String(label ?? '');
      const preferred = lang === 'zh' ? record.zh : record.en;
      return String(preferred ?? record.en ?? record.zh ?? '');
    }

    /**
     * Build the page component around one bound translate function.
     *
     * @param t - translate function bound to {@link NS}.
     * @param lang - reads the active locale id at render time.
     * @returns the component registered into `settings.section`.
     */
    function createPage(t, lang) {
      /**
       * The editor: load the active settings, edit them, save them back.
       *
       * Owner props carry `close` (the shell owns panel visibility); unused here
       * because saving needs no navigation.
       */
      return function CustomPromptPage() {
        const [status, setStatus] = React.useState('loading');
        const [text, setText] = React.useState('');
        const [saved, setSaved] = React.useState('');
        const [defaultText, setDefaultText] = React.useState('');
        const [tools, setTools] = React.useState({});
        const [savedTools, setSavedTools] = React.useState({});
        const [catalog, setCatalog] = React.useState({ groups: [], tools: [] });
        const [models, setModels] = React.useState({ providers: [], selected: undefined });
        const [choice, setChoice] = React.useState('');
        const [translation, setTranslation] = React.useState(undefined);
        const [busy, setBusy] = React.useState(false);
        const [message, setMessage] = React.useState(undefined);

        /** Flatten the model selection into one `<select>` value. */
        const choiceOf = (selected) => {
          if (asRecord(selected) === undefined) return '';
          const provider = typeof selected.provider === 'string' ? selected.provider : '';
          const model = typeof selected.model === 'string' ? selected.model : '';
          return provider === '' || model === '' ? '' : provider + '::' + model;
        };

        const adopt = React.useCallback((payload) => {
          const record = asRecord(payload);
          const nextText = typeof record?.text === 'string' ? record.text : '';
          const nextTools = booleanMap(record?.tools);
          setText(nextText);
          setSaved(nextText);
          setTools(nextTools);
          setSavedTools(nextTools);
          if (typeof record?.defaultText === 'string') setDefaultText(record.defaultText);
          const nextCatalog = asRecord(record?.catalog);
          if (nextCatalog !== undefined) {
            setCatalog({
              groups: Array.isArray(nextCatalog.groups) ? nextCatalog.groups : [],
              tools: Array.isArray(nextCatalog.tools) ? nextCatalog.tools : [],
            });
          }
          const nextModels = asRecord(record?.models);
          if (nextModels !== undefined) {
            setModels({
              providers: Array.isArray(nextModels.providers) ? nextModels.providers : [],
              selected: asRecord(nextModels.selected),
            });
            /* Keep whatever the user picked; only fall back to the host's
               suggestion when nothing is chosen yet. */
            setChoice((previous) => (previous !== '' ? previous : choiceOf(nextModels.selected)));
          }
          setTranslation(asRecord(record?.translation));
          setStatus('ready');
        }, []);

        /* Load once. A failure is surfaced but leaves the editor usable. */
        React.useEffect(() => {
          let live = true;
          fetch(API_URL, { method: 'GET', headers: { accept: 'application/json' } })
            .then((response) => response.json()
              .then((payload) => ({ ok: response.ok, payload }))
              .catch(() => ({ ok: response.ok, payload: undefined })))
            .then(({ ok, payload }) => {
              if (!live) return;
              if (!ok) {
                setStatus('error');
                setMessage({ tone: 'error', text: t('loadFailed') + errorText(payload, 'HTTP ' + String(ok)) });
                return;
              }
              adopt(payload);
            })
            .catch((cause) => {
              if (!live) return;
              setStatus('error');
              setMessage({ tone: 'error', text: t('loadFailed') + String(cause?.message ?? cause) });
            });
          return () => {
            live = false;
          };
        }, [adopt, t]);

        const save = React.useCallback(() => {
          if (busy) return;
          setBusy(true);
          setMessage(undefined);
          fetch(API_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ text, tools }),
          })
            .then((response) => response.json()
              .then((payload) => ({ ok: response.ok, payload }))
              .catch(() => ({ ok: response.ok, payload: undefined })))
            .then(({ ok, payload }) => {
              if (!ok) {
                setMessage({ tone: 'error', text: t('saveFailed') + errorText(payload, 'HTTP') });
                return;
              }
              adopt(payload);
              setMessage({ tone: 'ok', text: t('saved') });
            })
            .catch((cause) => {
              setMessage({ tone: 'error', text: t('saveFailed') + String(cause?.message ?? cause) });
            })
            .finally(() => {
              setBusy(false);
            });
        }, [adopt, busy, t, text, tools]);

        const restore = React.useCallback(() => {
          setText(defaultText);
          const nextTools = {};
          for (const tool of catalog.tools) nextTools[tool.id] = tool.default === true;
          setTools(nextTools);
          setMessage({ tone: 'ok', text: t('resetFilled') });
        }, [catalog.tools, defaultText, t]);

        const toggle = React.useCallback((id, value) => {
          setTools((previous) => ({ ...previous, [id]: value }));
          setMessage((previous) => (previous?.tone === 'error' ? undefined : previous));
        }, []);

        const setGroup = React.useCallback((ids, value) => {
          setTools((previous) => {
            const next = { ...previous };
            for (const id of ids) next[id] = value;
            return next;
          });
        }, []);

        const setAll = React.useCallback((value) => {
          const next = {};
          for (const tool of catalog.tools) next[tool.id] = value;
          setTools(next);
        }, [catalog.tools]);

        const onKeyDown = React.useCallback((event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            save();
          }
        }, [save]);

        /**
         * Fire one translation/shutdown verb and fold the answer back in.
         *
         * The host owns the run; this only starts it, cancels it, or clears the
         * stored copy. Every answer is a fresh snapshot, so the progress block
         * comes back filled without a second round trip.
         */
        const post = React.useCallback((body, onDone) => {
          setBusy(true);
          setMessage(undefined);
          fetch(API_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(body),
          })
            .then((response) => response.json()
              .then((payload) => ({ ok: response.ok, payload }))
              .catch(() => ({ ok: response.ok, payload: undefined })))
            .then(({ ok, payload }) => {
              if (!ok) {
                setMessage({ tone: 'error', text: t('translationError') + errorText(payload, 'HTTP') });
                return;
              }
              adopt(payload);
              if (onDone !== undefined) onDone();
            })
            .catch((cause) => {
              setMessage({ tone: 'error', text: t('translationError') + String(cause?.message ?? cause) });
            })
            .finally(() => {
              setBusy(false);
            });
        }, [adopt, t]);

        const startTranslation = React.useCallback((mode) => {
          if (choice === '') {
            setMessage({ tone: 'error', text: t('translationNoRoute') });
            return;
          }
          const parts = choice.split('::');
          post({ translate: mode, provider: parts[0], model: parts[1] });
        }, [choice, post, t]);

        /* Poll while a run is in flight: the host reports done/failed/current
           per entry, and there is no push channel for it. */
        const running = asRecord(translation?.job) !== undefined;
        React.useEffect(() => {
          if (!running) return undefined;
          const timer = setInterval(() => {
            fetch(API_URL, { method: 'GET', headers: { accept: 'application/json' } })
              .then((response) => (response.ok ? response.json() : undefined))
              .then((payload) => {
                if (payload !== undefined) adopt(payload);
              })
              .catch(() => {});
          }, 1200);
          return () => clearInterval(timer);
        }, [adopt, running]);

        const ready = status === 'ready';
        const toolsDirty = !sameMap(tools, savedTools);
        const dirty = ready && (text !== saved || toolsDirty);
        const isDefault = ready && defaultText !== '' && saved === defaultText;
        const selected = catalog.tools.filter((tool) => tools[tool.id] === true).length;
        const total = catalog.tools.length;
        const untranslated = catalog.tools.filter((tool) => tool.untranslated === true).length;
        const providers = Array.isArray(models.providers) ? models.providers : [];
        const job = asRecord(translation?.job);
        const last = asRecord(translation?.last);
        const pending = typeof translation?.pending === 'number' ? translation.pending : 0;
        const translatable = typeof translation?.total === 'number' ? translation.total : 0;

        const children = [
          h('h3', { key: 'title', className: 'cpm-title' }, t('heading')),
          h('p', { key: 'intro', className: 'cpm-intro' }, t('intro')),
        ];

        if (status === 'loading') {
          children.push(h('div', { key: 'loading', className: 'cpm-message' }, t('loading')));
        }

        if (status === 'error') {
          children.push(h('div', {
            key: 'load-error',
            className: 'cpm-message',
            'data-tone': 'error',
          }, message?.text ?? t('loadFailed')));
        }

        if (status !== 'error') {
          children.push(h('div', { key: 'editor', className: 'cpm-editor' },
            h('textarea', {
              className: 'cpm-textarea',
              value: text,
              placeholder: t('placeholder'),
              disabled: !ready || busy,
              spellCheck: false,
              onChange: (event) => {
                setText(event.target.value);
                if (message?.tone === 'error') setMessage(undefined);
              },
              onKeyDown,
            }),
            h('div', { className: 'cpm-meta' },
              h('span', undefined, t('characters') + ': ' + String(Array.from(text).length)),
              ready ? h('span', { className: 'cpm-badge' }, isDefault ? t('badgeDefault') : t('badgeCustom')) : null,
              toolsDirty ? h('span', { className: 'cpm-badge', 'data-tone': 'warn' }, t('unsaved')) : null,
              dirty
                ? null
                : (ready ? h('span', { className: 'cpm-badge' }, t('inSync')) : null),
              h('span', { className: 'cpm-shortcut' }, t('shortcut')),
            ),
          ));

          /* ── tool groups ─────────────────────────────────────────────── */
          const toolNodes = [];
          toolNodes.push(h('div', { key: 'tools-head', className: 'cpm-section-head' },
            h('h4', { className: 'cpm-section-title' }, t('toolsHeading')),
            h('span', { className: 'cpm-badge' },
              t('selectedCount') + ' ' + String(selected) + ' ' + t('of') + ' ' + String(total) + ' ' + t('toolCount')),
            h('button', {
              type: 'button',
              className: 'cpm-button',
              disabled: !ready || busy || selected === total,
              onClick: () => setAll(true),
            }, t('selectAll')),
            h('button', {
              type: 'button',
              className: 'cpm-button',
              disabled: !ready || busy || selected === 0,
              onClick: () => setAll(false),
            }, t('selectNone')),
          ));
          toolNodes.push(h('p', { key: 'tools-intro', className: 'cpm-note' }, t('toolsIntro')));

          for (const group of catalog.groups) {
            const groupTools = catalog.tools.filter((tool) => tool.group === group.id);
            if (groupTools.length === 0) continue;
            const groupIds = groupTools.map((tool) => tool.id);
            const groupOn = groupTools.filter((tool) => tools[tool.id] === true).length;
            toolNodes.push(h('div', { key: 'group-' + group.id, className: 'cpm-group' },
              h('div', { className: 'cpm-group-head' },
                h('span', { className: 'cpm-group-name' }, pickLabel(group.label, lang)),
                h('span', { className: 'cpm-group-count' }, String(groupOn) + ' / ' + String(groupTools.length)),
                h('button', {
                  type: 'button',
                  className: 'cpm-group-split',
                  disabled: !ready || busy,
                  onClick: () => setGroup(groupIds, true),
                }, t('selectAll')),
                h('button', {
                  type: 'button',
                  className: 'cpm-group-split',
                  disabled: !ready || busy,
                  onClick: () => setGroup(groupIds, false),
                }, t('selectNone')),
              ),
              groupTools.map((tool) => {
                const on = tools[tool.id] === true;
                return h('label', {
                  key: tool.id,
                  className: 'cpm-tool',
                  'data-off': on ? 'false' : 'true',
                },
                  h('input', {
                    type: 'checkbox',
                    checked: on,
                    disabled: !ready || busy,
                    onChange: (event) => toggle(tool.id, event.target.checked),
                  }),
                  h('span', { className: 'cpm-tool-body' },
                    h('span', { className: 'cpm-tool-label' },
                      pickLabel(tool.label, lang),
                      tool.untranslated === true
                        ? h('span', { className: 'cpm-flag' }, t('translationUntranslated'))
                        : null,
                    ),
                    typeof tool.hint === 'string' && tool.hint !== ''
                      ? h('span', { className: 'cpm-tool-hint' }, tool.hint)
                      : null,
                  ),
                );
              }),
            ));
          }
          toolNodes.push(h('p', { key: 'tools-note', className: 'cpm-note' }, t('toolsNote')));
          children.push(h('div', { key: 'tools' }, toolNodes));

          /* ── translation block ───────────────────────────────────────── */
          const translationNodes = [];
          translationNodes.push(h('div', { key: 'translation-head', className: 'cpm-section-head' },
            h('h4', { className: 'cpm-section-title' }, t('translationHeading')),
            untranslated > 0
              ? h('span', { className: 'cpm-badge', 'data-tone': 'warn' },
                t('translationPending') + ' ' + String(untranslated))
              : null,
          ));
          translationNodes.push(h('p', { key: 'translation-intro', className: 'cpm-note' }, t('translationIntro')));

          if (providers.length === 0) {
            translationNodes.push(h('p', { key: 'translation-nomodels', className: 'cpm-message', 'data-tone': 'error' }, t('translationNoModels')));
          } else {
            const options = [];
            for (const provider of providers) {
              const providerLabel = typeof provider.name === 'string' ? provider.name : String(provider.id);
              for (const model of Array.isArray(provider.models) ? provider.models : []) {
                const value = String(provider.id) + '::' + String(model.id);
                options.push(h('option', { key: value, value }, providerLabel + ' · ' + String(model.name ?? model.id)));
              }
            }
            translationNodes.push(h('div', { key: 'translation-controls', className: 'cpm-translation' },
              h('div', { className: 'cpm-actions' },
                h('span', { className: 'cpm-note' }, t('translationModel')),
                h('select', {
                  className: 'cpm-select',
                  value: choice,
                  disabled: !ready || running || busy,
                  onChange: (event) => setChoice(event.target.value),
                }, options),
              ),
              h('div', { className: 'cpm-actions' },
                h('button', {
                  type: 'button',
                  className: 'cpm-button',
                  'data-variant': 'primary',
                  title: t('translationAllHint'),
                  disabled: !ready || busy || running || translatable === 0,
                  onClick: () => startTranslation('all'),
                }, t('translationAll')),
                h('button', {
                  type: 'button',
                  className: 'cpm-button',
                  title: t('translationMissingHint'),
                  disabled: !ready || busy || running || pending === 0,
                  onClick: () => startTranslation('missing'),
                }, t('translationMissing')),
                running
                  ? h('button', {
                    type: 'button',
                    className: 'cpm-button',
                    disabled: busy,
                    onClick: () => post({ cancelTranslation: true }),
                  }, t('translationCancel'))
                  : null,
                h('button', {
                  type: 'button',
                  className: 'cpm-button',
                  disabled: !ready || busy || running || translatable === 0,
                  onClick: () => post({ clearTranslations: true }, () => setMessage({ tone: 'ok', text: t('translationCleared') })),
                }, t('translationClear')),
              ),
              running
                ? h('div', { className: 'cpm-progress' },
                  h('span', undefined,
                    t('translationProgress') + ' ' + String(job.done ?? 0) + ' / ' + String(job.total ?? 0)),
                  h('div', { className: 'cpm-bar' },
                    h('div', {
                      className: 'cpm-bar-fill',
                      style: { width: String(Math.round((Number(job.done ?? 0) / Math.max(1, Number(job.total ?? 0))) * 100)) + '%' },
                    })),
                  typeof job.current === 'string' && job.current !== ''
                    ? h('span', { className: 'cpm-shortcut' }, job.current)
                    : null,
                  Number(job.failed ?? 0) > 0
                    ? h('span', { className: 'cpm-badge', 'data-tone': 'warn' },
                      t('translationFailed') + ' ' + String(job.failed))
                    : null,
                )
                : (last !== undefined
                  ? h('div', { className: 'cpm-progress' },
                    h('span', undefined,
                      (last.cancelled === true ? t('translationCancel') : t('translationDone'))
                      + ' ' + String(last.done ?? 0) + ' / ' + String(last.total ?? 0)),
                    Number(last.failed ?? 0) > 0
                      ? h('span', { className: 'cpm-badge', 'data-tone': 'warn' },
                        t('translationFailed') + ' ' + String(last.failed))
                      : null,
                  )
                  : (translatable === 0
                    ? h('p', { className: 'cpm-note' }, t('translationNone'))
                    : null)),
            ));
          }
          children.push(h('div', { key: 'translation' }, translationNodes));

          children.push(h('div', { key: 'actions', className: 'cpm-actions' },
            h('button', {
              type: 'button',
              className: 'cpm-button',
              'data-variant': 'primary',
              disabled: !ready || busy || !dirty,
              onClick: save,
            }, busy ? t('saving') : t('save')),
            h('button', {
              type: 'button',
              className: 'cpm-button',
              disabled: !ready || busy || defaultText === '',
              onClick: restore,
            }, t('reset')),
          ));

          if (message !== undefined) {
            children.push(h('div', {
              key: 'message',
              className: 'cpm-message',
              'data-tone': message.tone === 'error' ? 'error' : 'ok',
            }, message.text));
          }

          children.push(h('p', { key: 'note', className: 'cpm-note' }, t('note')));
        }

        return h('div', { className: 'cpm-page' }, children);
      };
    }

    const inject = ['slots', 'locale'];

    /**
     * Register the dictionaries, the page styles, and the settings page itself.
     *
     * @param ctx - client context.
     */
    function apply(ctx) {
      const t = ctx.locale.bind(NS);
      /* Read at render time so a language switch re-renders with the other side
         of every `{zh, en}` label the host sent. */
      const lang = () => (typeof ctx.locale.getLocale().active === 'string'
        ? ctx.locale.getLocale().active
        : 'en');

      ctx.effect(() => {
        const offZh = ctx.locale.register(NS, 'zh', zh);
        const offEn = ctx.locale.register(NS, 'en', en);
        return () => {
          offZh();
          offEn();
        };
      }, 'custom-prompt-mode: dictionaries');

      ctx.effect(() => {
        const tag = document.createElement('style');
        tag.dataset.plugin = 'dsh-custom-prompt-mode';
        tag.dataset.pluginCss = 'custom-prompt-mode';
        tag.textContent = css;
        document.head.appendChild(tag);
        return () => tag.remove();
      }, 'custom-prompt-mode: styles');

      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'custom-prompt-mode',
        order: 22,
        label: () => t('title'),
        locale: NS,
      }, createPage(t, lang)));
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
}

/* One factory per id: the module system rejects a second registration of the
   same id, but an id the graph never asks for is simply left in the table.
   Each registration is guarded on its own so a page that executes this bundle
   twice (a combo batch followed by the one-resource fallback, or an
   invalidation race) keeps whichever registration landed first instead of
   failing the boot audit. */
const loader = window.__ModuleLoader__;
for (const id of [CANONICAL_ID, ALIAS_ID]) {
  try {
    loader.load({ id, factory: defineBundle });
  } catch (error) {
    const duplicate = error instanceof Error
      && error.message.includes('duplicate factory registration');
    if (!duplicate) console.error(`[custom-prompt-mode] could not register "${id}":`, error);
  }
}
