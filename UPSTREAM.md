# 上游来源与修改说明

本插件是基于上游仓库 [tinqiao-oss/engramory](https://github.com/tinqiao-oss/engramory) 的 `adapters/dsh/plugin` 目录修改、重命名后独立发布的 dsh 插件，用于在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 中提供 checkpoint-memory 长期记忆协议。

## 上游来源

- 上游仓库：`https://github.com/tinqiao-oss/engramory`
- 原始插件目录：`adapters/dsh/plugin`
- 原始 npm 包名：`dsh-engramory`
- 原始插件 ID / skill 名：`engramory`
- 许可证：MIT（保留原 `LICENSE` 文件，未作修改）

如果你需要上游 Engramory 的完整协议、其它宿主适配器或 Python 工具链，请直接访问上游仓库。

## 相对上游的主要修改

### 1. 身份与包元数据

- 包名从 `dsh-engramory` 改为 **`dsh-checkpoint-memory`**。
- 插件 bundle ID 与 skill 名称从 `engramory` 改为 **`checkpoint-memory`**。
- 版本重置为 **`0.1.0`**。
- 移除了上游包特有的 `engramory` 关键字、`repository`/`homepage`/`bugs` 字段以及 `publishConfig`。
- `cordis.patch.yml` 中的 `id` / `name` 同步改为 `checkpoint-memory` / `dsh-checkpoint-memory`。

### 2. 自带完整 skill 载荷并自动安装

- 新增 `skill/` 目录，内含自包含的完整 checkpoint-memory 协议：
  - `SKILL.md`
  - `AGENT-SETUP.md`
  - `INSTALL.md`
  - `rules-snippet.md`
  - `templates/`
  - `tools/`
- 新增 `install-skill.js`：插件激活时把 `skill/` 幂等地安装到 `$DSH_HOME/skills/checkpoint-memory/`，并自动把 `rules-snippet.md` 追加到 `$DSH_HOME/AGENTS.md`。
- 安装逻辑是幂等的：
  - 通过 `.skill-version` 标记判断是否已经是最新 payload，避免重复复制。
  - 只覆盖 payload 中存在的文件，不会删除用户自行添加的层叠文件。
  - `$DSH_HOME` 不可写时返回错误而不是抛出崩溃。
- 新增配置项：
  - `installSkill`（默认 `true`）：关闭后跳过完整 skill 写入技能库。
  - `appendRules`（默认 `true`）：关闭后跳过向 `AGENTS.md` 追加规则片段。
  - `dshHome`：指定 `$DSH_HOME` 位置。

### 3. Web 作曲家「同步记忆」按钮

- 新增 `client.js`（浏览器端模块）以及配套测试 `client.test.js`。
- 在 Web Composer 的 `conversation.input.right` 槽位注册一个「同步记忆」按钮。
- 点击后向当前会话发送 `/checkpoint-memory` 技能命令，使模型在**主会话**中同时执行：
  - §0.1 召回（读取 `MEMORY.md`，恢复记忆）
  - §0.2 策展/写入（扫描本次会话，保存值得留存的记忆）
- 按钮状态可见：`同步中…` / `✓` 已发送 / `×` 出错 / `!` 服务不可用。
- 在 `package.json` 中新增 `dsh.client` manifest，导出 `./client`。

### 4. 运行时协议与文案

- `index.js` 的**守卫核心算法与决策表**与上游 Python 版 `tools/index_guard.py` 保持一致：
  - 只拒绝结果超过上限**且**比当前文件更大的写入；
  - 缩小的整文件写入始终放行，支持增量压缩；
  - `read` 与未知工具永不拦截。
- 但把错误消息、内置 skill body、注册名称中所有 `Engramory` 引用替换为 `checkpoint-memory`，使其与当前协议品牌一致。
- 内置 skill body 更新为 checkpoint-memory 规则版本，例如：
  - 强调扁平存储：`MEMORY.md` 加每个 note 一个文件；
  - 严格指针校验，拒绝游离于 `<MEMORY_ROOT>` 外的符号链接、`..`、绝对路径；
  - 最多保留一条活的 `project` note，禁止按日期建系列文件；
  - 明确 archive 触发条件为索引超过 150 行 / 20 KB。
- `index.js` 在 `apply()` 中调用 `installSkill()`；`test.js` 默认关闭 `installSkill`，避免单元测试触碰真实 `$DSH_HOME`。

### 5. 文档与测试

- 重写 `README.md`（删除独立的英文文档 `README.zh-CN.md`，中文内容直接作为主 README）：
  - 删除 Engramory 徽章、dsh-xray 卡片、版本 issue 说明；
  - 增加「上游来源与主要修改」章节，说明基于 `tinqiao-oss/engramory` 的改动；
  - 保留「插件除了守卫还带了什么」章节，说明 skill 安装、`AGENTS.md` 追加、Web 按钮；
  - 更新安装命令与配置表。
- 新增 `install-skill.test.js` 与 `client.test.js`。
- 原 `test.js` 的用例更新为新的插件名与配置默认值，决策表覆盖保持不变。

## 哪些东西没有改

- 守卫的**核心算法、决策表、上限值**（200 行 / 25 KB）与上游 Python 版 `tools/index_guard.py` 及原 `adapters/dsh/plugin` 的算法一致。
- MIT 许可证文本未变更。
