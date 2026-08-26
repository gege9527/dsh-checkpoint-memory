---
name: api-gateway-v2-status
description: API 网关 v2 迁移已上线 —— 作为 2.0 发布
type: project
scope: repo
created: 2026-01-15
updated: 2026-01-15
---

API 网关 v2 迁移已于 2026-01-15 完成全量 rollout，并作为 release 2.0 发布。原 2.0 路线图中的需求级速率限制项被推迟到 2.1。

**Why:** 这次推迟是一次刻意的范围决策，而代码和 git 历史都没有记录“为什么”2.0 里没有速率限制 —— 没有这条说明，就可能有人重新争论它，或把它当 bug 提交。

**How to apply:** 当再次提到速率限制时，要知道它是被刻意推迟出 2.0 的，而不是被遗忘了。具体现在该以哪个版本为目标，去问项目的版本工具 —— 本笔记故意不携带那个数字，因为它是当前状态，写在这里会腐烂（SKILL.md §2）。

Related: [[deploy-runbook]] · [[release-versioning]]
