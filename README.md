# dsh-checkpoint-memory

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 用的长期记忆插件。

它会为你的 `MEMORY.md` 索引文件加上硬性上限（默认 200 行 / 25 KB），拒绝会让索引继续变大的写入，同时把 [checkpoint-memory](https://github.com/your-org/checkpoint-memory) 协议注入 dsh，并在 Web 作曲家显示一个「同步记忆」按钮。

> 本插件基于上游仓库 [tinqiao-oss/engramory](https://github.com/tinqiao-oss/engramory) 的 `adapters/dsh/plugin` 目录修改、重命名而来。完整修改清单见 [UPSTREAM.md](UPSTREAM.md)。

## 功能

- **硬性上限守护**：超过 `maxLines` / `maxBytes` 的**增长型**写入会被拒绝；缩小的写入始终放行，方便压缩整理。
- **完整 skill 安装**：激活时把 `skill/` 里的协议文件安装到 `$DSH_HOME/skills/checkpoint-memory/`，幂等、不删除用户自己的文件。
- **规则自动注入**：把规则片段追加到 `$DSH_HOME/AGENTS.md`，每次启动自动生效。
- **Web 同步按钮**：在 Web 作曲家输入框工具行增加「同步记忆」按钮，一键执行 `/checkpoint-memory`。

## 安装

```sh
dsh plugin --profile <名字> add dsh-checkpoint-memory
```

开发时可以用本地目录：

```sh
dsh plugin --profile web add link:/path/to/dsh-checkpoint-memory
```

安装后插件会通过自带的 `cordis.patch.yml` 自动挂载到 profile，无需手工改配置。

## 配置

要覆盖默认值，在你的 profile patch 层里**按 id 修改已有行**（不要再写一次 `- insert:`，否则会插入重复行）：

```yaml
- id: checkpoint-memory
  config:
    indexName: MEMORY.md
    maxLines: 200
    maxBytes: 25600
    # indexPath: /absolute/path/to/your/MEMORY.md
```

一次 patch 会整体替换目标行的 `config`，所以你想保留的键要逐个列全。

| 字段 | 默认值 | 说明 |
|---|---|---|
| `indexName` | `MEMORY.md` | 要守护的索引文件名。 |
| `maxLines` | `200` | 行数上限。 |
| `maxBytes` | `25600` | UTF-8 字节上限（25 KB）。 |
| `indexPath` | 未设置 | 指定唯一绝对路径后只守护该文件；未指定时按文件名匹配。 |
| `registerSkill` | `true` | 是否运行时注册 `/checkpoint-memory` skill。 |
| `installSkill` | `true` | 是否把完整 skill 安装到 `$DSH_HOME/skills/`。 |
| `appendRules` | `true` | 是否追加规则片段到 `$DSH_HOME/AGENTS.md`。 |
| `dshHome` | `$DSH_HOME` / `~/.dsh` | dsh 配置根目录。 |
| `skill` | 内置 | 用自定义 markdown 替换运行时 skill 正文。 |

## 使用

1. 准备一个 checkpoint-memory 记忆库（参考 `skill/AGENT-SETUP.md`）。
2. 在 dsh 会话中输入 `/checkpoint-memory`，模型会执行召回 + 策展写入。
3. 在 Web 作曲家中点击「同步记忆」按钮，效果相同。

> 插件本身不创建记忆库，只负责上限守护与协议注入。

## 开发

- Node.js >= 18，纯 ESM，零运行时依赖。
- 运行测试：

```sh
node --test
```

## 许可

MIT
