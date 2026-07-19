# 发布检查

`plugins/ai-talk` 是插件唯一源码。发布前先由主源码生成 public marketplace 镜像，再执行一致性校验：

```bash
node scripts/sync-public-marketplace.mjs --write
node scripts/sync-public-marketplace.mjs
```

校验覆盖根目录 `README.md`、`USAGE.md` 和完整的 `plugins/ai-talk`；public marketplace 自有的 marketplace manifest、许可证和 `.gitignore` 不参与同步。

插件内容变化后不得复用旧版本。先用 plugin-creator 的 `update_plugin_cachebuster.py` 替换 `+codex.*` 后缀，再同步镜像并从实际 marketplace 重装。最后同时检查 `codex plugin list` 的版本和 `~/.codex/plugins/cache/<marketplace>/ai-talk/<version>` 的文件内容，确认安装缓存与 `plugins/ai-talk` 一致。
