[English](README.md) | **简体中文**

# dsh-checkpoint-memory

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 用的**策展式、文件式**长期记忆 ——
纯 markdown 笔记，随便什么工具都能打开；一个记忆库被你用的所有宿主共用；索引上限是一次
**真正的拒绝**，而不是一句请求。（记忆库若位于某个项目的 git 仓库内，必须 git-ignore ——
记忆里带着本机独有的细节，见 SKILL.md §1。给记忆库单独开一个*私有仓*则完全可以。）

隶属于 [checkpoint-memory](https://github.com/your-org/checkpoint-memory)。

## 已经有 `AGENTS.md` 常驻块了，为什么还要插件

那个常驻块确实承载了纪律，单论召回也够用了。但有两件事它做不到：

**上限从此是确定性的。** checkpoint-memory 把索引控制在 200 行 / 25 KB 以内，是因为索引每次会话
都要加载，超出的部分会**悄无声息地不再被召回**。dsh 暴露了 `ctx.tools.guard()` —— 一个同步的、
**单调**的否决：守卫一旦返回理由，后面任何监听器都无法把它翻回放行。所以在这里，上限是被
**强制执行**的，不是被请求的。

**协议随插件一起到达。** skill 除了在运行时通过 dsh 的 skill 注册表注册（响应式的
`ctx.inject(['skills'], …)` 子上下文，所以没有注册表的 profile 照样拿到上限，注册表晚一步挂载的
profile 也照样拿得到 skill），还会把**完整版技能安装进 dsh 的技能库**（见下），双保险。

## 插件除了守卫还带了什么

**完整技能会落进 dsh 技能库。** 激活时，插件把整套 checkpoint-memory 技能 —— `SKILL.md`、
`tools/`、`templates/`、dsh 适配器 README、`rules-snippet.md`、`INSTALL.md` —— 安装到
`$DSH_HOME/skills/checkpoint-memory/`（自带一份自包含载荷，在 `skill/` 目录里）。于是 dsh 的文件系统
提供者会在 Web/UI 技能目录里提供**完整协议**，而不是只有运行时那份精简正文。安装是幂等的（`.skill-version`
标记会跳过未变的副本），也从不删除用户自己加的文件；`$DSH_HOME` 不可写时它干净地空转，运行时注册照样兜底。
想关掉用 `config.installSkill: false`。

**常驻规则自动追加到 `$DSH_HOME/AGENTS.md`。** 载荷里的 `rules-snippet.md` 会幂等地追加到全局
`AGENTS.md`：如果片段已存在则不再添加；如果 `AGENTS.md` 尚不存在则自动创建。这样 dsh 每次启动会话
都会加载记忆纪律，无需手动复制。想关掉用 `config.appendRules: false`。

**Web 输入框工具行多一个「同步记忆」按钮。** 插件的前端 half 会向 `conversation.input.right`
槽位注册**一个按钮**。点击后向**当前会话**提交 `/checkpoint-memory`（`session.prompt`）—— host 会把
`/` 开头的一行当作技能命令路由给模型，让模型在**主会话里执行完整的 §0 协议**：§0.1 召回（读
`MEMORY.md`，即"**恢复**"）+ §0.2 策展/写入（扫描本次会话，即"**保存**"）。刻意放在主会话里跑，
是因为模型既能看到本次会话的实时上下文（做策展判断），又能读到记忆索引（做召回），恢复与保存
一次同步**都真实成立**。

## 安装

```sh
# 从包注册表安装
dsh plugin --profile <名字> add dsh-checkpoint-memory

# 从本地目录安装（开发用）
dsh plugin --profile web add link:~/.dsh/skills/checkpoint-memory/adapters/dsh/plugin/
```

装到这里就完了。这个包自带 `dsh.bundle` manifest 指向它自己的 `cordis.patch.yml`，所以那一行
会被自动插进 profile 的插件树里 —— 不需要手改配置。要改默认值，请在你自己 profile 的 patch
层里**按 id 修改那一行已存在的配置**，**不要**再写一个 `- insert:`（insert 永远是追加，你会得到
两行配置，而原来那行的上限依旧在生效）：

```yaml
- id: checkpoint-memory
  config:
    indexName: MEMORY.md
    maxLines: 200
    maxBytes: 25600
```

一次 patch 会**整体替换**目标行的 `config`，所以你想保留的键要逐个列全。

插件会自动把 checkpoint-memory 技能里的规则片段（`rules-snippet.md`）追加到 `$DSH_HOME/AGENTS.md`，无需手动维护。本插件负责强制上限、提供协议；**它不创建记忆库本身**。

## 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `indexName` | `MEMORY.md` | 被当作记忆索引的文件名（不区分大小写；`file_path` 与 `str_replace_editor` 的 `path` 都会检查）。空值或非字符串会回退到默认值。除此之外不检查任何东西。 |
| `maxLines` | `200` | 硬性行数上限。非正数或非有限值回退到默认值。 |
| `maxBytes` | `25600` | 硬性 UTF-8 字节上限（25 KB）。 |
| `indexPath` | 未设置 | 要守护的**那一个**索引的绝对路径。不设它时，守卫只按文件名匹配，于是**别的项目里一个无关的 `MEMORY.md` 也会被拦**；设了它就只有这个确切的文件会被守。比较走的是身份而非拼写（symlink 与 `..` 都会解析；仅在 Windows 上折叠大小写），而且即使文件尚不存在，它的第一次写入照样受守护。 |
| `registerSkill` | `true` | 设为 `false` 则保留上限、但跳过运行时 skill。 |
| `skill` | 内置 | 用你自己的 markdown 替换 skill 正文。 |
| `installSkill` | `true` | 设为 `false` 则保留其它全部功能、但跳过"完整技能写入技能库"。 |
| `appendRules` | `true` | 设为 `false` 则跳过把 `rules-snippet.md` 追加到 `$DSH_HOME/AGENTS.md`。 |
| `dshHome` | `$DSH_HOME` / `~/.dsh` | 完整技能装到哪里 —— 具体是 `$DSH_HOME/skills/checkpoint-memory`。 |

## 守卫到底做了什么

| 调用 | 判决 |
|---|---|
| `write`（或 `str_replace_editor` 的 `create`）且结果在上限内 | 放行 |
| `write`/`create` 会让索引**增长**并越过上限 | **拒绝**，并报出具体数字和该压缩什么 |
| `write`/`create` 让一个已超限的索引**缩小或持平** | 放行 —— 增量压缩（210 → 205 → 198）必须走得通 |
| 带 `old_str`/`new_str` 的 edit：结果可模拟 | 按**结果**判定，增长/缩小规则与整文件写入相同 |
| 无法模拟的部分写入（如 `insert`）落在已超限的索引上 | **拒绝**，并告诉 agent：缩小的整文件写入是放行的 |
| 无法模拟的部分写入落在健康的索引上 | 放行 |
| `read`、`view`，以及任何未知工具 | 放行 —— 哪怕已超限，召回也绝不能被挡住 |
| 对任何其他文件的写入 | 放行 —— 不关守卫的事 |
| 整文件写入时当前索引缺失/读不到 | 视为**空**（与 Python 版守卫一致）—— 上限内的写入放行，而首次就超限的写入被拒 |
| 部分编辑时索引缺失/读不到 | 放行 —— 守卫绝不能因为一个自己读不了的路径而挡住工作 |
| 畸形的执行（没有 arguments、路径/内容不是字符串） | 放行 —— 它压根不像一次写入 |

拒绝规则与 `tools/index_guard.py` **完全一致**：只拒绝那种结果既超过上限、
又比当前文件更大的写入。行数统计忽略结尾换行，所以一个正好卡在上限的索引仍然可写。

## 已知限制

- **从上限之下一跃越过上限的、无法模拟的部分写入，抓不住。** `insert` 这类调用并不携带
  写入后的文本。这种越界会由下一次整文件写入、或 `tools/check.py` 抓到。能保证的是：
  一个**已经超限**的索引不会被继续撑大，而缩小的写入永远放行。
- **工具名单遵循 dsh 文档化的 tool-fs 契约**（`write`/`edit` 用 `file_path`，
  `str_replace_editor` 用 `path`），并且刻意保守：未知工具一律放行。
- dsh 目前是开发者预览版，插件 API 可能变化。本插件刻意只碰 `ctx.tools.guard()` 和一个
  注册 skill 的响应式 `ctx.inject(['skills'], …)` 子上下文，所以要跟着改也很便宜。

## 许可

MIT
