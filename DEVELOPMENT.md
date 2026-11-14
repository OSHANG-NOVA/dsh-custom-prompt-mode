# 本地开发 / 调试

这份文档记录**维护这个包时才会用到**的操作，普通用户安装请看 README。

## 为什么要用 junction

DSH 的 profile 用 `dsh.profile.bundles` 列出要加载的 bundle，`resolveBundleDir()` 会从
`<profile>/node_modules/<包名>` 去找 `package.json`，并且**要求里面的 `name` 与清单里写的名字一致**。

所以一旦改了 `package.json` 的 `name`（例如从 `@local/dsh-custom-prompt-mode` 改成
`dsh-custom-prompt-mode`），profile 里旧的 `link:` 依赖和旧的目录名就都对不上了，重启后
Loader 会报找不到 bundle。

两条守法：

```powershell
# 1) 手工补一个新名字的 junction（最快，不动 pnpm）
New-Item -ItemType Junction `
  -Path "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-custom-prompt-mode" `
  -Target "C:\Users\Administrator\Documents\new1\dsh-custom-prompt-mode"

# 2) 或者走正规安装（会重写 profile 的 package.json / pnpm-lock.yaml）
#    在 DSH 里调用 plugin_manager:
#    action=install_bundle, target=<本仓库的绝对路径>
```

改完确认一遍：

```powershell
$p = "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-custom-prompt-mode\package.json"
Test-Path $p                                   # 必须 True
(Get-Content $p -Raw | ConvertFrom-Json).name  # 必须等于 profile 清单里的名字
```

> 注意：在中文 Windows 上 `Get-Content | ConvertFrom-Json` 会因为 936 代码页读取失败。
> 用 `[System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)` 代替。

## 改完源码什么时候生效

`cordis-plugin-loader` 通过 Node 内部 ESM 加载器 `import()` 模块，**模块实例按 URL 缓存**，
所以改了 `.js` 源码后不会自动重新求值。本 profile 也没有启用 `dsh-hmr`
（`dsh.profile.bundles` 里没有 hmr 条目），因此只有三条路：

| 场景 | 让新代码生效的方式 |
| --- | --- |
| 改 `client.js`（浏览器半） | 在 DSH 里把 bundle 关掉再打开，或重启 DSH |
| 改 `index.js` / `persona.js` / `gate.js`（宿主半） | 重启 DSH 进程 |
| 只改状态文件 `custom-prompt-mode.json` | 立即生效，无需重启 |

`plugin_manager action=set_bundle target=<名字> enabled=false` 后再 `enabled=true` 通常
就足以让浏览器半重新加载；宿主半改的是模块本身，必须重启。

## 不要用 PowerShell 管道改源文件

这个包的 `index.js` / `client.js` 里有大量中文文案。在中文 Windows 上执行

```powershell
(Get-Content -Raw x.js) -replace 'a','b' | Set-Content x.js
```

会把**全文中文按 936 代码页写坏**，产生不可逆的 `U+FFFD`，并且破坏引号闭合，之后
`node --check` 直接报语法错。只能用编辑器 / `write` 工具 / Node 脚本改这些文件。

CI 里有一条专门拦这个的检查（扫描 `U+FFFD`），提交前也会跑：

```powershell
$repo = (Get-Location).Path
Get-ChildItem -Recurse -File -Include *.js,*.json,*.md,*.yml -Path $repo |
  Where-Object { $_.FullName -notmatch 'node_modules' } |
  ForEach-Object {
    $t = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
    if ($t.Contains([char]0xFFFD)) { "BROKEN: $($_.FullName)" }
  }
```

## 本地自检

```powershell
node --check index.js
node --check persona.js
node --check gate.js
node --check client.js
node -e "JSON.parse(require('node:fs').readFileSync('package.json','utf8'))"
npm pack --dry-run
```

## 直接跟宿主半对话

插件暴露了一个 HTTP 路由，改设置时不必打开浏览器：

```powershell
$api = 'http://127.0.0.1:51903/custom-prompt-mode/api'

# 读当前状态（文本 / 工具开关 / 译文 / 可选模型 / 汉化进度）
Invoke-RestMethod -Uri $api

# 只改提示词
Invoke-RestMethod -Uri $api -Method Post -ContentType 'application/json' `
  -Body (@{ text = 'You are a terse assistant.' } | ConvertTo-Json)

# 只改工具开关（未列出的键保持原值）
Invoke-RestMethod -Uri $api -Method Post -ContentType 'application/json' `
  -Body (@{ tools = @{ bash = $true; pwsh = $false } } | ConvertTo-Json)

# 用指定模型汉化所有还没有中文说明的工具
Invoke-RestMethod -Uri $api -Method Post -ContentType 'application/json' `
  -Body (@{ translate = 'missing'; provider = 'buddy'; model = 'deepseek-v4.1-flash' } | ConvertTo-Json)
```

中文输出在 PowerShell 控制台会显示成乱码，那是控制台代码页的问题，用
`[System.Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())` 读就正常。

## 查预设有没有真的挂起来

```
POST http://127.0.0.1:51903/preset-studio/api
{ "action": "list" }
```

返回 JSON 的顶层键是 `presets`，每个预设的 `rows` 字段每行包含
`entryId` / `moduleName` / `enabled` / `fiberState`。`fiberState: 2` 表示已激活；
`enabled: false` 是平台条件（例如 Windows 上 bash 分支）被正确禁用，不是错误。

## 发布到 npm

```powershell
# 本机 npm_config_registry 指向 npmmirror，发布前必须覆盖，否则推到镜像站
$env:npm_config_registry = 'https://registry.npmjs.org'

cd C:\Users\Administrator\Documents\new1\dsh-custom-prompt-mode
npm publish --registry https://registry.npmjs.org
```

账号开了 2FA，`npm publish` 会克隆一个浏览器确认页；若提示要一次性口令，加 `--otp=六位数`。

### 关于 registry 上的 `0.0.0-stage`

首次发布时 npm 的 staged publishing 会先写一条占位版本 `0.0.0-stage`
（描述 `Temporary package placeholder for staged publishing`），随后真实版本才写入。
`dist-tags.latest` 始终指向真实版本，所以 `npm i dsh-custom-prompt-mode` 拿到的是
正确的那个；占位版本只是版本列表里多出来的一条，不需要清理，也无法删除。

发布后核对：

```powershell
$u = 'https://registry.npmjs.org/dsh-custom-prompt-mode?t=' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$r = Invoke-RestMethod -Uri $u -Headers @{ 'Cache-Control' = 'no-cache' }
$r.'dist-tags'                                  # latest 必须是真实版本
$r.versions.PSObject.Properties.Name            # 版本清单
$r.versions.'1.0.0'.dist.shasum                 # 应与本地 npm pack 的 shasum 一致
```

`registry.npmjs.org` 的读取有缓存，刚发布完可能要等十几秒，`?t=` 参数可以绕过。

