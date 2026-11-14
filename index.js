/**
 * Host half of the **Custom prompt 模式** plugin.
 *
 * Five jobs:
 *
 *  1. Own the user's settings — the system prompt text, the per-tool switches,
 *     and the Chinese translations — read from a small JSON file inside the
 *     profile directory and written by the settings page through the route
 *     below.
 *
 *  2. Expose the prompt text as the `customPromptMode` service so the preset
 *     child can read it on every assembly (`text: () => …`), which is what makes
 *     a prompt edit take effect on the next turn without a restart.
 *
 *  3. **Scan** the live tool registry (`ctx.tools.schemas()`) so the settings
 *     page lists whatever this profile actually mounts — third-party plugins
 *     included — instead of a list baked into this file.
 *
 *  4. Register the `custom-prompt` agent preset: the user's text as the ONLY
 *     system prompt (via the `deployment:persona-prefix` complete section) plus
 *     a gate row that denies every scanned tool the user did not tick.
 *
 *  5. Summarise the English tool descriptions into Chinese on request, through
 *     whatever model route the page picks.
 *
 * Why a gate instead of "just don't mount the plugin": this profile mounts a
 * large tool surface globally (dsh-base and every other bundle), and a preset
 * row only ever *adds* a layer — a scoped registration shadows a global tool but
 * nothing in a preset can remove one. `tools.restrict()` is the one sanctioned
 * subtraction, and it works from a preset child because presets are mounted
 * into their own scope. See `gate.js`.
 *
 * Changing the selection rebuilds the preset definition: `agentPresets.register()`
 * hands back a disposer, and the id must be free before the new rows can go in.
 * Sessions that already joined the mode keep their generation; new sessions see
 * the new selection.
 *
 * The route is fenced the same way `dsh-preset-studio` fences its own: loopback
 * (or a configured trusted authority) Host header plus same-origin browser
 * markers. That is DNS-rebinding / cross-site defense, not authentication.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** `tools` is only needed for the catalogue scan; the rest are hard requirements. */
export const inject = ['webServer', 'agentPresets', 'tools'];

/** Route base; the settings page posts to exactly this path. */
const API_PREFIX = '/custom-prompt-mode/api';

/** The one file this plugin owns. */
const STATE_FILE = 'custom-prompt-mode.json';

/** Cap for one request body — a system prompt is prose, not a payload. */
const MAX_BODY_BYTES = 512 * 1024;

/** Seeded into a fresh profile; also what 「恢复默认」 restores. */
const DEFAULT_PROMPT = [
  'You are a helpful software engineer assistant.',
  '',
  'Requirement clarity gate (mandatory, applies to every user request):',
  'Before doing any work on a request, judge how clear the requirement is.',
  '- If the requirement is too vague to act on, you MUST stop and ask the user to clarify instead of guessing.',
  '- If the requirement is reasonably clear, ask at least 1-2 clarifying questions before you start.',
  '- If the requirement is vague, ask at least 4-8 clarifying questions.',
  'Keep asking until you have enough information to complete the request correctly.',
].join('\n');

/** Preset identity — also the value a session stores once it joins this mode. */
const PRESET_ID = 'custom-prompt';

/** Where the persona half lives inside this package. */
const PERSONA_MODULE = '@local/dsh-custom-prompt-mode/persona';

/** Where the gate half lives inside this package. */
const GATE_MODULE = '@local/dsh-custom-prompt-mode/gate';

/** Reserved PTC transport; `restrict()` refuses to name it. */
const RESERVED_TOOL = 'run_code';

/** Group order / labels for the settings page. */
const GROUP_LABELS = {
  files: { zh: '文件读写', en: 'Files' },
  shell: { zh: '命令执行', en: 'Shell' },
  web: { zh: '联网', en: 'Web' },
  work: { zh: '任务与计划', en: 'Tasks' },
  agents: { zh: '代理与编排', en: 'Agents' },
  other: { zh: '其它', en: 'Other' },
};

/**
 * Chinese copy for the tools this harness ships.
 *
 * This is a *decoration* of the scan, not the list itself: any tool the registry
 * reports but this table does not know still shows up, labelled with its own
 * name and description. That is what makes the page follow the profile — install
 * a plugin that adds tools and they appear here on the next refresh.
 *
 * Copy precedence is curated → translated → raw description, so a translation
 * run never overwrites hand-written text.
 */
const TOOL_META = [
  // files
  { name: 'read', group: 'files', zh: '读取文件', en: 'Read', hint: '读取文本文件内容，可按行区间分页查看大文件。' },
  { name: 'write', group: 'files', zh: '写入文件', en: 'Write', hint: '新建文件或用整段内容覆盖已有文件。' },
  { name: 'edit', group: 'files', zh: '精准修改', en: 'Edit', hint: '按旧文本精确匹配、只替换命中的那一段，适合局部改动。' },
  { name: 'read_image', group: 'files', zh: '查看图片', en: 'Read image', hint: '把图片读进来直接看，用于截图、图表、界面核对。', default: true },
  { name: 'glob', group: 'files', zh: '按文件名查找', en: 'Glob', hint: '用通配符列出文件路径，先定位再读。' },
  { name: 'grep', group: 'files', zh: '按内容搜索', en: 'Grep', hint: '用正则搜索文件内容，返回命中行与行号。' },
  { name: 'str_replace_editor', group: 'files', zh: '编辑器式替换', en: 'Str replace editor', hint: '另一个按字符串替换的编辑工具，接口更接近传统编辑器。' },
  // shell
  { name: 'bash', group: 'shell', zh: 'Bash 命令', en: 'Bash', hint: '在 bash 里执行命令，状态跨调用保持。', default: true },
  { name: 'pwsh', group: 'shell', zh: 'PowerShell 命令', en: 'PowerShell', hint: '在 PowerShell 里执行命令，状态跨调用保持。', default: true },
  { name: 'terminal_open', group: 'shell', zh: '打开终端', en: 'Terminal open', hint: '开一个长驻终端会话，供后续读写。' },
  { name: 'terminal_send', group: 'shell', zh: '终端输入', en: 'Terminal send', hint: '向长驻终端发送文本并读取输出。' },
  { name: 'terminal_read', group: 'shell', zh: '终端读取', en: 'Terminal read', hint: '读取长驻终端最近的输出。' },
  { name: 'terminal_signal', group: 'shell', zh: '终端信号', en: 'Terminal signal', hint: '向终端的当前进程发送中断等信号。' },
  { name: 'terminal_list', group: 'shell', zh: '终端列表', en: 'Terminal list', hint: '列出当前有哪些长驻终端。' },
  { name: 'terminal_close', group: 'shell', zh: '关闭终端', en: 'Terminal close', hint: '关闭一个长驻终端并回收进程。' },
  // web
  { name: 'web_search', group: 'web', zh: '联网搜索', en: 'Web search', hint: '上网搜索资料，返回标题、摘要与链接。' },
  { name: 'web_fetch', group: 'web', zh: '抓取网页', en: 'Web fetch', hint: '打开一个网址并把正文取回来。' },
  // work
  { name: 'todo_write', group: 'work', zh: '待办清单', en: 'Todo', hint: '记录并更新多步任务的进度清单。' },
  { name: 'plan', group: 'work', zh: '计划模式', en: 'Plan mode', hint: '进入计划模式，先出方案再动手改。' },
  { name: 'exit_plan_mode', group: 'work', zh: '退出计划模式', en: 'Exit plan mode', hint: '把计划交给用户审阅，批准后才开始实施。' },
  { name: 'create_goal', group: 'work', zh: '创建目标', en: 'Create goal', hint: '建立一个跨多轮持续推进的长期目标。' },
  { name: 'get_goal', group: 'work', zh: '读取目标', en: 'Get goal', hint: '查看当前目标的内容与进度。' },
  { name: 'update_goal', group: 'work', zh: '更新目标', en: 'Update goal', hint: '修改、暂停、恢复或结束当前目标。' },
  { name: 'ask_user_question', group: 'work', zh: '向用户提问', en: 'Ask user', hint: '把需要澄清的问题直接弹给用户选择。' },
  { name: 'present', group: 'work', zh: '交付文件', en: 'Present', hint: '把生成的文件作为成品卡片交给用户。' },
  // agents
  { name: 'subagent', group: 'agents', zh: '子代理', en: 'Subagent', hint: '把一个自包含的任务交给独立上下文的子代理去做。' },
  { name: 'subagent_fork', group: 'agents', zh: '继承上下文的子代理', en: 'Subagent fork', hint: '开一个能看到当前对话的子代理，适合接着做后续分析。' },
  { name: 'list_subagent_models', group: 'agents', zh: '列出子代理模型', en: 'List subagent models', hint: '查询可用的子代理模型与推理档位。' },
  { name: 'send_message', group: 'agents', zh: '给代理发消息', en: 'Send message', hint: '向正在跑或已空闲的子代理追加指令。' },
  { name: 'interrupt_agent', group: 'agents', zh: '中断代理', en: 'Interrupt agent', hint: '要求某个子代理停止手上的工作。' },
  { name: 'list_agents', group: 'agents', zh: '列出代理', en: 'List agents', hint: '列出自己派出去的子代理及其状态。' },
  { name: 'workflow', group: 'agents', zh: '工作流编排', en: 'Workflow', hint: '用脚本把工作扇出到大量子代理并行执行。' },
  { name: 'ralph', group: 'agents', zh: 'Ralph 循环', en: 'Ralph', hint: '用全新子代理一轮轮迭代同一个目标。' },
  // other
  { name: 'job_output', group: 'other', zh: '读取后台任务', en: 'Job output', hint: '读取后台任务的输出，可阻塞等待完成。' },
  { name: 'job_list', group: 'other', zh: '后台任务列表', en: 'Job list', hint: '列出自己启动的后台任务。' },
  { name: 'job_kill', group: 'other', zh: '结束后台任务', en: 'Job kill', hint: '取消一个正在跑的后台任务。' },
  { name: 'schedule_create', group: 'other', zh: '创建提醒', en: 'Schedule create', hint: '在当前会话里建一个定时提醒。' },
  { name: 'schedule_list', group: 'other', zh: '提醒列表', en: 'Schedule list', hint: '列出当前会话的定时提醒。' },
  { name: 'schedule_delete', group: 'other', zh: '删除提醒', en: 'Schedule delete', hint: '删掉一个定时提醒。' },
  { name: 'schedule_update', group: 'other', zh: '修改提醒', en: 'Schedule update', hint: '就地修改一个定时提醒。' },
  { name: 'skill', group: 'other', zh: '加载技能', en: 'Skill', hint: '读取技能库里的完整操作说明再照着做。' },
  { name: 'session_search', group: 'other', zh: '搜索历史会话', en: 'Session search', hint: '在过往会话里按关键词找内容。' },
  { name: 'session_trace', group: 'other', zh: '会话轨迹', en: 'Session trace', hint: '查看某个会话的完整执行轨迹。' },
  { name: 'session_event_read', group: 'other', zh: '读取会话事件', en: 'Session event read', hint: '读取某个会话事件的完整内容。' },
  { name: 'session_event_search', group: 'other', zh: '搜索会话事件', en: 'Session event search', hint: '在会话事件里检索。' },
  { name: 'session_event_trace', group: 'other', zh: '会话事件轨迹', en: 'Session event trace', hint: '查看一条事件的来源链路。' },
  { name: 'cordis_inspect_list', group: 'other', zh: '列出运行时可观测项', en: 'Cordis inspect list', hint: '列出当前可用的运行时查询入口。' },
  { name: 'cordis_inspect_query', group: 'other', zh: '运行时只读查询', en: 'Cordis inspect query', hint: '只读查询服务契约、事件、配置与界面槽位。' },
  { name: 'working_directory', group: 'other', zh: '切换工作目录', en: 'Working directory', hint: '查看或切换当前工作目录。' },
  { name: 'load_workspace_dependencies', group: 'other', zh: '加载工作区依赖', en: 'Workspace dependencies', hint: '把工作区依赖的运行时加载进来。' },
];

/** Index of `TOOL_META` by tool name. */
const META_BY_NAME = new Map(TOOL_META.map((entry) => [entry.name, entry]));

/** Fresh-profile selection: exactly what 极简模式 leaves visible. */
const DEFAULT_ALLOW = TOOL_META.filter((entry) => entry.default === true).map((entry) => entry.name);

/**
 * Instruction for the translation call.
 *
 * The user asked for a *summary*, not a literal rendering: a tool description is
 * a paragraph of mechanics, while the settings page has one line per row.
 */
const TRANSLATE_SYSTEM = [
  '你是技术文档编辑，负责把英文的工具说明翻译成简体中文。',
  '规则：',
  '1. 只输出译文本身：不要引号、不要书名号、不要「中文：」这类前缀、不要解释。',
  '2. 一句话，说明这个工具能做什么，长度不超过 40 个汉字（这是摘要，不是直译）。',
  '3. 保留工具名、参数名、文件路径等专有名词的原文写法。',
  '4. 描述里如果含多段列表，只提炼其中最核心的能力。',
].join('\n');

/** Shown where neither a curated hint nor a translation exists. */
const EMPTY_HINT = '该工具由当前安装的插件提供。';

/** How many translation calls may run at once. */
const TRANSLATE_CONCURRENCY = 3;

/** One translation call may take a while; this is the per-call cap. */
const TRANSLATE_TIMEOUT_MS = 60000;

/** Long descriptions copied from 极简模式 so the shell rows read the same. */
const BASH_DESCRIPTION = [
  'Run commands in a bash shell',
  '* When invoking this tool, the contents of the "command" parameter does NOT need to be XML-escaped.',
  '* Network access depends on the task environment. Prefer configured mirrors/proxies when they are available.',
  '* State is persistent across command calls and discussions with the user.',
  "* To inspect a particular line range of a file, e.g. lines 10-25, try 'sed -n 10,25p /path/to/the/file'.",
  '* Please avoid commands that may produce a very large amount of output.',
  "* Please run long lived commands in the background, e.g. 'sleep 10 &' or start a server in the background.",
].join('\n');

const PWSH_DESCRIPTION = [
  'Run commands in a PowerShell shell',
  '* When invoking this tool, the contents of the "command" parameter does NOT need to be XML-escaped.',
  "* You don't have access to the internet via this tool.",
  '* State is persistent across command calls and discussions with the user.',
  '* Use native Windows paths (C:\\...) and $env:NAME variables; this is PowerShell, not bash.',
  '* Please avoid commands that may produce a very large amount of output.',
  "* Please run long lived commands in the background, e.g. 'Start-Job' or start a server with Start-Process.",
].join('\n');

/**
 * Scan the live tool registry.
 *
 * `schemas()` with no scope argument is the GLOBAL view, which is what the page
 * should offer: every tool this profile mounts anywhere. Tools the preset itself
 * adds (the persistent shells) are appended by the caller.
 *
 * @returns `[{ name, description }]`, empty when the service is unavailable.
 */
function scanTools(ctx) {
  try {
    const schemas = ctx.tools.schemas();
    return schemas
      .filter((schema) => schema.name !== RESERVED_TOOL)
      .map((schema) => ({
        name: String(schema.name),
        description: typeof schema.description === 'string' ? schema.description : '',
      }));
  } catch (error) {
    console.error('[custom-prompt-mode] tool scan failed:', error);
    return [];
  }
}

/** Names this plugin itself mounts into the preset, whatever the scan says. */
function mountedToolNames() {
  return ['bash', 'pwsh'];
}

/**
 * Build the catalogue the settings page renders.
 *
 * Scanned tools come first in registry order. Copy precedence per tool: the
 * curated `TOOL_META` entry, then a stored translation, then the tool's own
 * (usually English) description.
 */
function catalogForPage(ctx, translations) {
  const seen = new Set();
  const tools = [];
  const entries = scanTools(ctx);
  const extra = mountedToolNames()
    .filter((name) => !entries.some((entry) => entry.name === name))
    .map((name) => ({ name, description: '' }));
  for (const entry of [...entries, ...extra]) {
    if (seen.has(entry.name)) continue;
    seen.add(entry.name);
    const meta = META_BY_NAME.get(entry.name);
    const translated = typeof translations[entry.name] === 'string' ? translations[entry.name] : '';
    const fallback = entry.description.trim() === '' ? EMPTY_HINT : entry.description;
    tools.push({
      id: entry.name,
      group: meta?.group ?? 'other',
      label: { zh: meta?.zh ?? entry.name, en: meta?.en ?? entry.name },
      hint: meta?.hint ?? (translated === '' ? fallback : translated),
      untranslated: meta === undefined && translated === '',
      default: meta?.default === true,
    });
  }
  return {
    groups: Object.entries(GROUP_LABELS).map(([id, labels]) => ({ id, label: labels })),
    tools,
  };
}

/** Strip the chatter a model tends to wrap a one-line translation in. */
function cleanTranslation(raw) {
  let text = raw.trim();
  text = text.split('\n').map((line) => line.trim()).find((line) => line !== '') ?? '';
  text = text.replace(/^[-*•\d.、\s]+/, '');
  text = text.replace(/^(翻译|译文|中文|摘要)[:：]\s*/, '');
  for (const [open, close] of [['"', '"'], ['“', '”'], ['「', '」'], ['『', '』'], ["'", "'"]]) {
    if (text.length > 1 && text.startsWith(open) && text.endsWith(close)) {
      text = text.slice(open.length, text.length - close.length).trim();
    }
  }
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

/**
 * The LLM service, or undefined when this profile mounts no adapter.
 *
 * Read through `ctx.get()` rather than an `inject` entry: a profile without a
 * model route must still get the settings page, just with the translation
 * buttons reporting that no route is configured.
 */
function llmOf(ctx) {
  try {
    return ctx.get('llm');
  } catch {
    return undefined;
  }
}

/** Providers and their models, for the page's model picker. */
async function modelChoices(ctx) {
  const llm = llmOf(ctx);
  if (llm === undefined || typeof llm.listProviders !== 'function') return [];
  const providers = llm.listProviders();
  const choices = [];
  for (const provider of providers) {
    let models = [];
    try {
      models = await llm.listModels(provider.id);
    } catch (error) {
      console.error(`[custom-prompt-mode] listing models for ${provider.id} failed:`, error);
    }
    choices.push({
      id: provider.id,
      name: provider.name,
      models: models.map((model) => ({ id: model.id, name: model.name })),
    });
  }
  return choices;
}

/** The model the page should preselect: the session default, else the first route. */
function defaultChoice(ctx, choices) {
  try {
    const settings = ctx.get('agentDefaultModel');
    const selected = settings?.currentSelection?.();
    if (selected !== undefined) {
      const provider = choices.find((entry) => entry.id === selected.provider);
      if (provider !== undefined && provider.models.some((model) => model.id === selected.model)) {
        return { provider: selected.provider, model: selected.model };
      }
    }
  } catch {
    /* a missing service is not an error here */
  }
  const provider = choices.find((entry) => entry.models.length > 0);
  if (provider === undefined) return undefined;
  return { provider: provider.id, model: provider.models[0].id };
}

/**
 * Ask one model to summarise one tool description in Chinese.
 *
 * `llm.stream()` is the only entry point: it yields typed chunks, and the
 * visible answer is the concatenation of `text-delta`.
 */
async function translateDescription(ctx, provider, model, entry, signal) {
  const llm = llmOf(ctx);
  if (llm === undefined || typeof llm.stream !== 'function') {
    throw new Error('no LLM route is configured in this profile');
  }
  const request = {
    provider,
    model,
    system: TRANSLATE_SYSTEM,
    messages: [{
      role: 'user',
      content: [{ type: 'text', text: `工具名：${entry.name}\n原始说明：\n${entry.description}` }],
    }],
    signal,
  };
  let text = '';
  for await (const chunk of llm.stream(request)) {
    if (chunk.type === 'text-delta') text += chunk.text;
  }
  return cleanTranslation(text);
}

/**
 * Pick the tools a translation run should touch.
 *
 * `all` re-translates every tool that has no hand-written Chinese copy;
 * `missing` only fills the ones with no stored translation yet. Tools the
 * curated table knows are never sent — their copy is better than a summary.
 */
function translationTargets(ctx, translations, mode) {
  const targets = [];
  for (const entry of scanTools(ctx)) {
    if (META_BY_NAME.has(entry.name)) continue;
    if (entry.description.trim() === '') continue;
    const stored = translations[entry.name];
    const hasStored = typeof stored === 'string' && stored.trim() !== '';
    if (mode === 'missing' && hasStored) continue;
    targets.push(entry);
  }
  return targets;
}

/**
 * Build the preset's child rows from a tool selection.
 *
 * The persona row is always first; the compaction group is a harness feature
 * rather than a tool, so it is always present. The gate then subtracts every
 * globally mounted tool that is not selected. Shell backends are mounted here
 * because this profile does not expose a persistent shell globally.
 *
 * @param allow - selected tool names.
 * @returns the row list handed to `agentPresets.register()`.
 */
function buildPresetPlugins(allow) {
  const windows = process.platform === 'win32';
  const selected = new Set(allow);
  const plugins = [
    { id: 'custom-prompt-persona', name: PERSONA_MODULE },
    { id: 'custom-prompt-gate', name: GATE_MODULE, config: { allow: [...selected] } },
  ];

  /*
   * One isolated group carries the terminal registry, the platform's shell
   * backend, and the persistent shells that are actually selected.
   * `isolate.terminals` keeps this mode's terminals separate from every other
   * preset's.
   */
  const shellRows = [];
  if (selected.has('pwsh')) {
    shellRows.push({
      id: 'persistent-pwsh',
      name: '@deepseek-ai/dsh-tool-pwsh-persistent',
      disabled: !windows,
      config: { timeoutMs: 300000, description: PWSH_DESCRIPTION },
    });
  }
  if (selected.has('bash')) {
    shellRows.push({
      id: 'persistent-bash',
      name: '@deepseek-ai/dsh-tool-bash-persistent',
      disabled: windows,
      config: { timeoutMs: 300000, description: BASH_DESCRIPTION },
    });
  }
  if (shellRows.length > 0) {
    plugins.push({
      id: 'persistent-shell',
      name: 'cordis:group',
      group: true,
      isolate: { terminals: true },
      config: [
        { id: 'pty', name: '@deepseek-ai/dsh-terminal' },
        {
          id: 'terminal-bash',
          name: '@deepseek-ai/dsh-terminal-bash',
          disabled: windows,
          config: { timeoutMs: 300000 },
        },
        {
          id: 'terminal-pwsh',
          name: '@deepseek-ai/dsh-terminal-bash',
          disabled: !windows,
          config: { shellDialect: 'pwsh', timeoutMs: 300000 },
        },
        ...shellRows,
      ],
    });
  }

  /* Context compaction is not a tool: without it a long session would die
     rather than summarise, so it stays regardless of the selection. */
  plugins.push({
    id: 'compaction',
    name: 'cordis:group',
    group: true,
    isolate: { compaction: true },
    config: [
      { id: 'compaction-basic', name: '@deepseek-ai/dsh-compaction-basic' },
      { id: 'command-compact', name: '@deepseek-ai/dsh-command-compact' },
    ],
  });

  return plugins;
}

/** Resolve the profile directory, preferring the live service over the environment. */
function profileDir(ctx) {
  const profile = ctx.get('profileContext');
  if (profile !== undefined && typeof profile.dir === 'string' && profile.dir !== '') return profile.dir;
  if (process.env.DSH_PROFILE_DIR) return process.env.DSH_PROFILE_DIR;
  const home = process.env.DSH_HOME || join(homedir(), '.dsh');
  return join(home, 'profiles', process.env.DSH_PROFILE || 'web');
}

/**
 * Coerce a stored selection into `Record<string, boolean>`.
 *
 * Unknown names are KEPT: a tool that failed to register this boot (a broken
 * plugin, a missing backend) must not silently lose the user's choice — it comes
 * back as soon as the tool reappears.
 */
function normalizeTools(value) {
  if (value === null || typeof value !== 'object') return Object.fromEntries(DEFAULT_ALLOW.map((n) => [n, true]));
  const result = {};
  for (const [key, switchValue] of Object.entries(value)) {
    if (typeof switchValue === 'boolean') result[key] = switchValue;
  }
  return result;
}

/** Keep only `name -> string` pairs, so a hand-edited file cannot poison the page. */
function normalizeTranslations(value) {
  const result = {};
  if (value === null || typeof value !== 'object') return result;
  for (const [key, translated] of Object.entries(value)) {
    if (typeof translated === 'string' && translated.trim() !== '') result[key] = translated;
  }
  return result;
}

/** Read the stored settings, or `undefined` when the file is absent or unusable. */
function readStoredSettings(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed !== null && typeof parsed === 'object') return parsed;
  } catch {
    /* a missing or half-written file is simply "nothing stored yet" */
  }
  return undefined;
}

/** Write the settings atomically: a reader never sees a truncated document. */
function writeStoredSettings(path, text, tools, translations) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(
    temporary,
    `${JSON.stringify({ text, tools, translations, updatedAt: new Date().toISOString() }, undefined, 2)}\n`,
    'utf8',
  );
  renameSync(temporary, path);
}

// ── route helpers ─────────────────────────────────────────────────────────

/** Normalized URL of a Host-header authority, or undefined when unparsable. */
function parseAuthority(authority) {
  try {
    return new URL(`http://${authority}`);
  } catch {
    return undefined;
  }
}

/** Whether a hostname names the local loopback authority. */
function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  const parts = hostname.split('.');
  return parts.length === 4 && parts[0] === '127'
    && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/** Canonical authority form: hostname, or hostname:port when a port was written. */
function canonicalAuthority(entry, entryUrl) {
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port;
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`;
}

/** Whether the request authority matches a trustedHosts entry (exact or port-less). */
function isTrustedAuthority(hostUrl, trustedHosts) {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry);
    if (entryUrl === undefined) return false;
    return entryUrl.port === '' || canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host;
  });
}

/** Loopback (or configured authority) Host header plus same-origin browser markers. */
function isTrustedApiRequest(req, trustedHosts) {
  const host = typeof req.headers.host === 'string' ? req.headers.host : undefined;
  if (host === undefined) return false;
  const hostUrl = parseAuthority(host);
  if (hostUrl === undefined) return false;
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}

/** Sentinel: the request body exceeded MAX_BODY_BYTES. */
const PAYLOAD_TOO_LARGE = Symbol('payload-too-large');

/** Read a JSON request body, capped at MAX_BODY_BYTES. */
function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES && !aborted) {
        aborted = true;
        req.destroy();
        resolve(PAYLOAD_TOO_LARGE);
        return;
      }
      if (!aborted) chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => {
      if (!aborted) resolve(null);
    });
  });
}

/** Write a JSON response. */
function writeJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

// ── plugin ────────────────────────────────────────────────────────────────

/**
 * Mount the settings store, the preset, and the settings-page route.
 *
 * @param ctx - host context (webServer, agentPresets, tools, optionally llm).
 */
export function apply(ctx) {
  const storagePath = join(profileDir(ctx), STATE_FILE);
  const stored = readStoredSettings(storagePath);
  const state = {
    text: typeof stored?.text === 'string' ? stored.text : DEFAULT_PROMPT,
    tools: normalizeTools(stored?.tools),
    translations: normalizeTranslations(stored?.translations),
  };

  /** Persist the whole document; every mutation goes through here. */
  const persist = () => writeStoredSettings(storagePath, state.text, state.tools, state.translations);

  /**
   * The translation run in flight, if any.
   *
   * One run at a time, on purpose: the page disables both buttons while this is
   * set, and a second press would otherwise race the same entries.
   */
  let job;

  /** The last finished run, so the page can report what just happened. */
  let lastResult;

  /** Selected tool names, in catalogue order. */
  const selection = () => {
    const names = Object.entries(state.tools).filter(([, on]) => on).map(([name]) => name);
    return names.length === 0 ? [] : names;
  };

  /* The one live reference the preset child reads on every assembly. */
  ctx.provide('customPromptMode', {
    get text() {
      return state.text;
    },
    get defaultText() {
      return DEFAULT_PROMPT;
    },
    get storagePath() {
      return storagePath;
    },
  });

  /*
   * The preset is registered through a dispatcher so a tool change can swap the
   * definition: register() hands back a disposer, and the id must be free before
   * the new list can be registered under it.
   */
  let disposePreset;
  let registration = Promise.resolve();
  let unmounted = false;

  const mountPreset = (tools) => {
    registration = registration.then(async () => {
      if (unmounted) return;
      if (disposePreset !== undefined) {
        const previous = disposePreset;
        disposePreset = undefined;
        await previous().catch(() => {});
      }
      if (unmounted) return;
      try {
        disposePreset = await ctx.agentPresets.register({
          id: PRESET_ID,
          name: 'Custom prompt',
          description: '系统提示词完全由插件配置的文本替换，工具由设置页里勾选的清单决定。',
          order: 12,
          plugins: buildPresetPlugins(Object.entries(tools).filter(([, on]) => on).map(([name]) => name)),
        });
      } catch (error) {
        console.error('[custom-prompt-mode] preset registration failed:', error);
      }
    });
    return registration;
  };

  ctx.effect(() => {
    void mountPreset(state.tools);
    return () => {
      unmounted = true;
      const pending = disposePreset;
      disposePreset = undefined;
      if (pending !== undefined) void pending().catch(() => {});
      if (job !== undefined) {
        job.cancelled = true;
        job.controller.abort();
      }
    };
  }, 'custom-prompt-mode: preset');

  /**
   * Summarise a batch of tool descriptions into Chinese.
   *
   * Calls run a few at a time rather than strictly one by one: a profile with
   * forty third-party tools would otherwise sit there for minutes. Each finished
   * entry is persisted immediately, so a crash or a reload keeps the work done
   * so far and 「增量汉化」 can pick up exactly where it stopped.
   */
  const startTranslation = (mode, provider, model) => {
    if (job !== undefined) return job;
    const targets = translationTargets(ctx, state.translations, mode);
    const run = {
      mode,
      provider,
      model,
      total: targets.length,
      done: 0,
      failed: 0,
      current: '',
      errors: [],
      startedAt: new Date().toISOString(),
      finishedAt: undefined,
      cancelled: false,
      controller: new AbortController(),
    };
    job = run;

    const finish = () => {
      run.finishedAt = new Date().toISOString();
      run.current = '';
      lastResult = {
        mode: run.mode,
        provider: run.provider,
        model: run.model,
        total: run.total,
        done: run.done,
        failed: run.failed,
        errors: run.errors.slice(0, 3),
        finishedAt: run.finishedAt,
        cancelled: run.cancelled,
      };
      job = undefined;
    };

    if (targets.length === 0) {
      finish();
      return run;
    }

    void (async () => {
      let cursor = 0;
      const worker = async () => {
        for (;;) {
          if (run.cancelled) return;
          const index = cursor;
          cursor += 1;
          if (index >= targets.length) return;
          const entry = targets[index];
          run.current = entry.name;
          try {
            const timeout = AbortSignal.timeout(TRANSLATE_TIMEOUT_MS);
            const signal = AbortSignal.any([run.controller.signal, timeout]);
            const translated = await translateDescription(ctx, provider, model, entry, signal);
            if (translated === '') throw new Error('the model returned no text');
            state.translations[entry.name] = translated;
            persist();
          } catch (error) {
            run.failed += 1;
            run.errors.push(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
            console.error(`[custom-prompt-mode] translation failed for ${entry.name}:`, error);
          } finally {
            run.done += 1;
          }
        }
      };
      const workers = Array.from(
        { length: Math.min(TRANSLATE_CONCURRENCY, targets.length) },
        () => worker(),
      );
      try {
        await Promise.all(workers);
      } finally {
        finish();
      }
    })();

    return run;
  };

  /** The public face of the job, without the AbortController. */
  const jobSnapshot = () => (job === undefined ? undefined : {
    mode: job.mode,
    provider: job.provider,
    model: job.model,
    total: job.total,
    done: job.done,
    failed: job.failed,
    current: job.current,
    errors: job.errors.slice(0, 10),
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  });

  /**
   * Cached provider/model catalogue for the page's picker.
   *
   * `listModels()` hits each adapter, so this is refreshed at most once every
   * few seconds instead of on every poll of the page.
   */
  let choicesCache;
  const CHOICES_TTL_MS = 30000;
  const choices = async () => {
    const now = Date.now();
    if (choicesCache === undefined || now - choicesCache.at > CHOICES_TTL_MS) {
      choicesCache = { at: now, value: await modelChoices(ctx) };
    }
    return choicesCache.value;
  };

  /** The body of every successful read/write. */
  const snapshot = async () => {
    const catalogue = await choices();
    return {
      ok: true,
      text: state.text,
      defaultText: DEFAULT_PROMPT,
      isDefault: state.text === DEFAULT_PROMPT,
      tools: state.tools,
      defaultTools: Object.fromEntries(DEFAULT_ALLOW.map((name) => [name, true])),
      catalog: catalogForPage(ctx, state.translations),
      selected: selection(),
      translations: state.translations,
      models: { providers: catalogue, selected: defaultChoice(ctx, catalogue) },
      translation: {
        job: jobSnapshot(),
        last: lastResult,
        pending: translationTargets(ctx, state.translations, 'missing').length,
        total: translationTargets(ctx, state.translations, 'all').length,
      },
    };
  };

  /* The settings page's read/write route. */
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: async (req, res) => {
      const webRuntime = ctx.get('webRuntime');
      const trustedHosts = Array.isArray(webRuntime?.trustedHosts) ? webRuntime.trustedHosts : [];
      if (!isTrustedApiRequest(req, trustedHosts)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } });
        return;
      }

      const pathname = String(req.url ?? '/').split('?')[0];

      try {
        if (req.method === 'GET' || req.method === 'HEAD') {
          writeJson(res, 200, await snapshot());
          return;
        }

        if (req.method !== 'POST') {
          writeJson(res, 405, { ok: false, error: { code: 'method', message: 'only GET and POST are accepted' } });
          return;
        }

        const body = await readJsonBody(req);
        if (body === PAYLOAD_TOO_LARGE) {
          writeJson(res, 413, { ok: false, error: { code: 'too-large', message: 'the request body is too large' } });
          return;
        }
        if (body === null || typeof body !== 'object') {
          writeJson(res, 400, { ok: false, error: { code: 'bad-body', message: 'a JSON object body is required' } });
          return;
        }

        if (body.reset === true) {
          state.text = DEFAULT_PROMPT;
          state.tools = Object.fromEntries(DEFAULT_ALLOW.map((name) => [name, true]));
          persist();
          await mountPreset(state.tools);
          writeJson(res, 200, await snapshot());
          return;
        }

        /*
         * Translation actions. They are separate verbs on the same route because
         * the page's save button and 「开始汉化」 are different gestures: one writes
         * what the user typed, the other spends model calls.
         */
        if (body.translate !== undefined) {
          if (body.translate !== 'all' && body.translate !== 'missing') {
            writeJson(res, 400, {
              ok: false,
              error: { code: 'bad-body', message: '"translate" must be "all" or "missing"' },
            });
            return;
          }
          if (typeof body.provider !== 'string' || body.provider === ''
            || typeof body.model !== 'string' || body.model === '') {
            writeJson(res, 400, {
              ok: false,
              error: { code: 'bad-body', message: '"provider" and "model" are required' },
            });
            return;
          }
          if (job !== undefined) {
            writeJson(res, 409, {
              ok: false,
              error: { code: 'busy', message: 'a translation run is already in progress' },
            });
            return;
          }
          startTranslation(body.translate, body.provider, body.model);
          writeJson(res, 200, await snapshot());
          return;
        }

        if (body.cancelTranslation === true) {
          if (job !== undefined) {
            job.cancelled = true;
            job.controller.abort();
          }
          writeJson(res, 200, await snapshot());
          return;
        }

        if (body.clearTranslations === true) {
          state.translations = {};
          persist();
          writeJson(res, 200, await snapshot());
          return;
        }

        const wantsText = body.text !== undefined;
        const wantsTools = body.tools !== undefined;
        if (!wantsText && !wantsTools) {
          writeJson(res, 400, {
            ok: false,
            error: { code: 'bad-body', message: 'either "text" or "tools" must be present' },
          });
          return;
        }
        if (wantsText && typeof body.text !== 'string') {
          writeJson(res, 400, { ok: false, error: { code: 'bad-body', message: '"text" must be a string' } });
          return;
        }
        if (wantsTools && (body.tools === null || typeof body.tools !== 'object')) {
          writeJson(res, 400, { ok: false, error: { code: 'bad-body', message: '"tools" must be an object' } });
          return;
        }

        const nextTools = wantsTools ? normalizeTools(body.tools) : state.tools;
        const toolsChanged = JSON.stringify(nextTools) !== JSON.stringify(state.tools);

        if (wantsText) state.text = body.text;
        state.tools = nextTools;
        persist();
        if (toolsChanged) await mountPreset(state.tools);
        writeJson(res, 200, await snapshot());
      } catch (error) {
        console.error(`[custom-prompt-mode] ${pathname} failed:`, error);
        writeJson(res, 500, { ok: false, error: { code: 'internal', message: 'internal error' } });
      }
    },
  }), 'custom-prompt-mode: settings route');
}
