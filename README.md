# dsh-custom-prompt-mode

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

一个 DeepSeek Harness 插件，新增 **Custom prompt 模式**：该模式会话的系统提示词完全由你在设置页里写的文本替换，DSH 内置的 System Prompt 一律不生效；工具也不写死，而是**自动扫描**当前 profile 实际挂载的工具，逐项开关，说明还能用你选的模型自动汉化。

## 安装

两种装法，任选一种：

**从 npm 安装**（推荐，发布后可用）

```
plugin_manager install_bundle  target=dsh-custom-prompt-mode
```

**从源码安装**：把本仓库放到任意目录，然后让 DSH 安装它

```
plugin_manager install_bundle  target=<本仓库的绝对路径>
```

装完重启一次 DSH（ESM 模块按 URL 缓存），新开会话时模式列表里就能选到 **Custom prompt**。

## 它做什么

- 在模式列表里新增一项 `Custom prompt`（`agent preset id = custom-prompt`，`order = 12`）。
- 该模式的作用域里注册 `deployment:persona-prefix` 的 **complete** 段：assembler 会把它还原成**唯一**的提示词段，因此不会有任何 DSH 自带文案残留。
- 同时 `suppressRuntimeContext()`，隐去沙箱 / 审批 / 委派那几段运行时上下文。
- 再把 `working-directory:current` 同名 context 在本作用域内改成 `required: false` + 空文本：它是全仓唯一一个 `required: true` 的 context，不遮蔽就会穿透上面的抑制，把「Current runtime context …」整段带回来。
- 工具**自动扫描**：调用 `ctx.tools.schemas()` 读取运行时注册表的全局视图，装了什么插件就列什么工具，第三方插件带来的工具也会出现在列表里。每一项都能单独开关，也支持全选 / 全不选。默认值与极简模式一致（只开「查看图片」+ PowerShell 持久 + bash 持久）。
- 设置页 `设置 → Custom prompt` 里编辑文本、勾工具、汉化工具说明；提示词保存后**下一轮对话立即生效**。


## 工具组怎么工作

工具列表不是写死的，而是「扫描 + 装饰」两层：

1. `scanTools()` 调 `ctx.tools.schemas()`（不带 scope 参数 = 全局视图），过滤掉保留的 `run_code`，得到 `{name, description}`。
2. `catalogForPage()` 给每个扫描到的工具配上中文说明，优先级：**手写文案表 → 已存译文 → 工具自己的英文 description**。手写表覆盖本 harness 自带的约 50 个工具，剩下的是第三方插件的工具。

页面按 6 个分组渲染：文件读写 / 命令执行 / 联网 / 任务与计划 / 代理与编排 / 其它。未知工具归入「其它」。

几个实现细节：

- **为什么需要「闸门」插件**：本 profile 由 `dsh-base` 等 bundle 在**全局**挂了 18 个工具行，而 preset 只能在自己的作用域里**加层**——同名可以遮蔽，但删不掉全局层的东西。`tools.restrict()` 是唯一的减法手段，且必须从带作用域的 context 调用；preset 子插件正好在自己的作用域里，所以 `gate.js` 在那里 `restrict({ deny })` 掉所有没被勾选的名字。
- `gate.js` 监听 `tools/change`：工具注册表一变（某个插件迟到挂载），它就重算 deny 清单并换掉旧 restriction，不会漏也不会重复。
- 只 deny **刚扫描出来的名字**：`restrict()` 对未知名字会抛错，所以清单必须来自注册表本身，不能凭空写。
- 命令执行的两项持久 shell 由本插件自己挂载（`isolate: { terminals: true }` 组，带 `dsh-terminal` PTY 注册表和平台对应的后端），因为本 profile 没有全局挂载持久 shell。Windows 上 bash 行、其它平台上 PowerShell 行带 `disabled: true`。
- 没有列 `dsh-tool-pwsh` / `dsh-tool-bash`（一次性命令）：它们依赖 `shell` 服务，而该服务由 `dsh-shell` 提供，`dsh-base` 与所有 bundle 都没有挂载它。持久版只依赖 `terminals`，所以可用。
- `compaction` 组永远在，它不是工具：没有它长会话会直接撞上限而不是被摘要。
- 工具开关通过**重建 preset 定义**生效：`agentPresets.register()` 返回 disposer，先卸载旧的再注册新的。已经加入该模式的会话保留自己那一代工具集，新会话拿到新的。

## 工具说明自动汉化

第三方插件带来的工具说明是英文的。设置页的「工具说明汉化」区可以把它们总结成一句中文：

- **使用模型**：下拉列出当前 profile 的所有 provider 与模型（`llm.listProviders()` / `llm.listModels()`），默认选中会话的默认模型。
- **全量汉化**：把所有还没有中文说明的工具都总结一遍。
- **增量汉化**：只补还没有译文的那些，已经译过的跳过。
- **取消**：中止进行中的任务（正在进行的那一条会被 abort，已完成的部分保留）。
- **清空译文**：丢掉所有已存译文，回到英文原文。

实现要点：

- 一次调用一条工具说明，用 `llm.stream({ provider, model, system, messages, signal })` 收集 `text-delta`。`system` 里明确要求「一句话摘要、≤40 汉字、保留专有名词、不要直译」。
- 并发 3 路，每条有 60 秒超时（`AbortSignal.any([取消信号, AbortSignal.timeout(60000)])`）。
- **每完成一条就落盘一次**，所以中途关页面、崩进程都不会丢掉已完成的部分，增量汉化能接着来。
- 手写中文文案的工具不参与汉化：它们的中文比总结更准。扫描到的工具里凡是 `META_BY_NAME` 命中的都跳过。
- 没有模型路由的 profile 照常可用，只是汉化区显示「没有可用的模型路由」。
- 译文统一清洗：取首个非空行、剥掉「中文：」这类前缀和成对引号、超过 60 字截断。

## 为什么提示词改动不用重启

`persona.js` 注册的段 `text` 是一个函数：

```js
text: () => prompt.text
```

`SystemPrompt.assemble()` 每次装配都会重新调用它（`dsh-system-prompt/lib/index.js:388`），因此宿主内存里的文本一变，下一轮装配就换了。

`interpolate: false` 是必需的：默认会解析 `{{…}}`，用户散文里出现的花括号会让渲染抛错。

## 设置存在哪

`<profile 目录>/custom-prompt-mode.json`：

```json
{
  "text": "你的系统提示词……",
  "tools": { "read_image": true, "bash": true, "pwsh": true, "edit": false },
  "translations": { "ppt_themes": "列出 dsh-ppt 内置的视觉主题……" },
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

`tools` 里未出现的开关按「关闭」处理，未知名字会被保留（某个插件本次没起来时，你的选择不会丢）。profile 目录的解析顺序：`profileContext.dir` → `DSH_PROFILE_DIR` → `$DSH_HOME/profiles/$DSH_PROFILE`（缺省 `~/.dsh/profiles/web`）。写入走临时文件 + `rename`，读方永远看不到写一半的文件。

## HTTP 路由

浏览器半只跟一个路由打交道：

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| `GET` / `HEAD` | `/custom-prompt-mode/api` | 返回 `{ ok, text, defaultText, isDefault, tools, defaultTools, catalog, selected, translations, models, translation }` |
| `POST` | `/custom-prompt-mode/api` | 见下表 |

POST 的 body 动作：

| body | 行为 |
| --- | --- |
| `{ text?, tools? }` | 至少给一个；保存并返回新快照。`tools` 变了会重建 preset |
| `{ reset: true }` | 文本与工具一起恢复默认（不动译文） |
| `{ translate: "all" \| "missing", provider, model }` | 启动一轮汉化；已有任务在跑时返回 409 `busy` |
| `{ cancelTranslation: true }` | 取消进行中的汉化 |
| `{ clearTranslations: true }` | 清空所有译文 |

`catalog` 是宿主下发的工具清单（`{ groups, tools: [{ id, group, label, hint, untranslated, default }] }`），`models` 是模型下拉的数据（`{ providers: [{ id, name, models }], selected }`），`translation` 是汉化进度（`{ job, last, pending, total }`）。其它方法 405，超大 body 413，坏 body 400，内部错误 500。

路由带与 `dsh-preset-studio` 相同的围栏：Host 必须是 loopback 或配置过的受信地址，`sec-fetch-site: cross-site` 直接拒，`Origin` 必须同源。这是防 DNS rebinding / CSRF 的，不是身份认证。

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.js` | 宿主半：工具扫描、`customPromptMode` 服务、预设注册与重建、汉化、设置页路由 |
| `persona.js` | 预设子插件：complete 提示词段 + 关闭运行时上下文 |
| `gate.js` | 预设子插件：`tools.restrict()` 挡掉没勾选的全局工具，并跟随 `tools/change` 重算 |
| `client.js` | 浏览器半：`settings.section` 设置页（提示词 + 工具勾选 + 汉化面板） |
| `cordis.patch.yml` | 插入根行 `custom-prompt-mode` |
| `locale/*.json` | 插件标题与描述 |
| `DEVELOPMENT.md` | 维护者文档：junction、重载、编码陷阱、本地自检 |

## 注意

- 这是**全局**插件：装一次，所有会话的模式列表里都能选到 Custom prompt。
- 若某个会话已经开始对话，DSH 不允许再切换模式（`agent-preset/locked`），新建会话即可。
- 改了源码要重启 DSH 进程才生效：本 profile 没启用模块热更（`dsh-base` 的 `hmr` 行 `root: []`），ESM 模块按 URL 缓存。细节见 [DEVELOPMENT.md](DEVELOPMENT.md)。

## License

[MIT](LICENSE)

