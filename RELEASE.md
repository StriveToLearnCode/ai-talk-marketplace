# 发布检查

`plugins/ai-talk` 是插件唯一源码。发布前先由主源码生成 public marketplace 镜像，再执行一致性校验：

```bash
node scripts/sync-public-marketplace.mjs --write
node scripts/sync-public-marketplace.mjs
```

校验覆盖根目录 `README.md`、`USAGE.md` 和完整的 `plugins/ai-talk`；public marketplace 自有的 marketplace manifest、许可证和 `.gitignore` 不参与同步。
