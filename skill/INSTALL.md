# 安装 checkpoint-memory（DSH 版）

checkpoint-memory 是一个记忆**协议**，不是安装脚本。它的纪律主要通过常驻规则生效，模型读取 `SKILL.md` 后就知道所有协议规则。

本安装说明仅面向 **DeepSeek Harness（dsh）** 宿主；其他宿主的操作已被移除。

## 安装模型

### Level 1: Rules-only（零插件）

最简单的安装方式。模型通过规则文件知道协议纪律。

**步骤：**

1. 将 `checkpoint-memory` 目录复制到 dsh 技能库：
   - `$DSH_HOME/skills/checkpoint-memory`

2. 将 [`rules-snippet.md`](rules-snippet.md) 的内容追加到常驻规则文件：
   - `$DSH_HOME/AGENTS.md` 或项目 `AGENTS.md`

3. 在项目中创建 `./memory/` 目录和 `MEMORY.md` 索引。

**效果：** 模型遵循协议纪律。无确定性守卫。

---

### Level 2: Full protocol（dsh 插件实现）

Level 1 + 使用本插件的 `ctx.tools.guard()` 实现确定性索引上限守卫。

**步骤：**

1. 完成 Level 1。

2. 安装并启用 `dsh-checkpoint-memory` 插件（插件会自动把完整技能写入 `$DSH_HOME/skills/checkpoint-memory/`，并把 `rules-snippet.md` 追加到 `$DSH_HOME/AGENTS.md`）。

3. 详细守卫语义见插件根目录的 `README.md`。

**效果：** 确定性守卫 + 自动完整 skill 入库 + 常驻规则自动生效。

---

## 核心设计：语义驱动，不指定实现

插件根目录的 `README.md` 描述 hook 的**语义行为**：
- 什么时候触发
- 应该做什么
- 决策逻辑是什么

参考实现文件（`plugin/`）展示了协议如何映射到 dsh 的 API。模型可以自己实现，也可以直接使用插件。

---

## 验证安装

```bash
python3 tools/doctor.py ./memory
```

应报告 clean（如果记忆目录为空）。

---

## 需要 Python 3.9+

`tools/check.py` 和 `tools/doctor.py` 需要 Python 3.9+。
