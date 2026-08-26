---
name: 完成前验证
description: 在报告完成之前，先通过 grep 确认变更已生效
type: feedback
scope: global
created: 2026-06-13
updated: 2026-06-13
---

在告诉用户某处代码变更已完成之前，先快速搜索以确认该变更确实落到了预期位置。

**Why:** 用户曾被“已完成”的报告坑过，而那些编辑实际上悄悄失败了；因此未经核实的“完成”会消耗他们的信任。

**How to apply:** 每次编辑后，grep 变更的符号 / 字符串，并在报告中展示匹配到的行；或者运行相关测试并引用结果。

Related: [[code-change-hygiene]]
