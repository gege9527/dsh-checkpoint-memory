---
name: runtime-log-path
description: 生产环境运行时日志路径
type: reference
scope: repo
created: 2026-06-13
updated: 2026-06-13
---

生产环境日志文件位置：

- 主机：`prod-web-01`
- 路径：`/var/log/myapp/server.log`
- 轮转：`logrotate` 每日切割，保留 14 天

不要在这里记录凭据；只放路径和访问方式。
