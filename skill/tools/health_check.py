#!/usr/bin/env python3
"""
health_check — 只读健康检查。

用法：
    python3 tools/health_check.py

检查以下内容并报告状态，**不修改任何文件**：

1. 记忆目录是否存在且结构正常
2. 索引是否在上下文中可读范围内

适用于：每次 /checkpoint-memory 结束时自动调用，让模型知道记忆系统是否健全。
"""
import os
import sys
from pathlib import Path


def _check_memory_root():
    """检查记忆目录是否存在且结构正常。"""
    env_root = os.environ.get("CHECKPOINT_MEMORY_ROOT", "").strip()
    if env_root and Path(env_root).exists():
        memory_root = Path(env_root)
    else:
        memory_path = Path.cwd() / "memory"
        if memory_path.exists():
            memory_root = memory_path
        elif os.environ.get("CHECKPOINT_MEMORY_ROOT"):
            memory_root = Path(os.environ["CHECKPOINT_MEMORY_ROOT"])
        else:
            return None

    index = memory_root / "MEMORY.md"
    if not index.exists():
        return {"index": "missing"}

    try:
        raw = index.read_bytes()
        lines = raw.decode("utf-8", "replace").count("\n") + (1 if raw else 0)
        nbytes = len(raw)
        hard, hard_b = 200, 25600
        if lines > hard or nbytes > hard_b:
            return {"index": "over_cap", "lines": lines, "bytes": nbytes, "hard": hard, "hard_bytes": hard_b}
        return {"index": "ok", "lines": lines, "bytes": nbytes}
    except OSError:
        return {"index": "unreadable"}


def main():
    print("=== checkpoint-memory health check ===")

    print("\n--- Memory Store ---")
    mem = _check_memory_root()
    if mem is None:
        print("  No memory store found. Create ./memory/MEMORY.md to enable.")
    elif mem["index"] == "over_cap":
        print(f"  ⚠ OVER CAP: {mem['lines']} lines / {mem['bytes']} bytes")
        print(f"  Hard cap: {mem['hard']} lines / {mem['hard_bytes']} bytes")
        print(f"  Run the compaction procedure (SKILL.md §8) before adding more.")
    elif mem["index"] == "missing":
        print("  ✗ MEMORY.md not found.")
    elif mem["index"] == "unreadable":
        print("  ✗ MEMORY.md unreadable.")
    else:
        print(f"  ✓ OK: {mem['lines']} lines / {mem['bytes']} bytes")


if __name__ == "__main__":
    main()
