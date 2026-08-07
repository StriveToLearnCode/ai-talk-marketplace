# AI Talk

AI Talk 会把简略或模糊的研发请求补充成可执行任务，让 Codex 在开始工作前明确：

- 具体要实现什么结果
- 哪些内容可以修改、哪些不能动
- 达到什么标准才算完成
- 需要定位哪些页面、文件、组件或业务信息

当用户中途纠正需求或任务需要交接时，AI Talk 只保留真正影响下一步的信息，避免后续执行偏离要求。

## 让 AI 安装

将下面的提示词直接发送给 Codex：

```text
请帮我安装或更新 AI Talk Skill。

GitHub 仓库：
https://github.com/StriveToLearnCode/ai-talk-marketplace

请将仓库根目录的 ai-talk 安装到当前项目，供 Codex 使用。尚未安装时执行安装，已经安装时更新到最新版本。使用复制模式，不要创建指向临时目录的软链接，也不要修改项目业务代码。

完成后请检查 Codex 能否识别 ai-talk，并告诉我是否需要重启以及如何调用。
```

安装或更新完成后，彻底退出并重新打开 Codex。

```text
Skill 名称：ai-talk
调用方式：$ai-talk
```

## 手动安装

在项目根目录执行：

```bash
npx skills add StriveToLearnCode/ai-talk-marketplace \
  --skill ai-talk \
  --agent codex \
  --yes \
  --copy
```

更新已安装的 AI Talk：

```bash
npx skills update ai-talk --project --yes
```

## License

[MIT](LICENSE)
