# Codex Task Dock

Codex Task Dock 是一个面向 Windows 的本机只读任务浮窗：从系统托盘呼出，在右下角汇总当前正在运行的 Codex 任务、今天停止的任务、可靠的结构化步骤和下一步。

## 主要能力

- 当前运行任务只进入「当前任务」，停止后自动进入「今日任务」。
- 从用户提供的项目内容生成简短名称，优先包含项目/公司、具体对象和动作。
- 只显示 Codex 提供的结构化步骤；没有可靠进度时省略，不生成百分比。
- 后台约每 5 秒只读更新，浮窗隐藏时仍继续采集。
- 单击托盘图标显示或隐藏；窗口固定在右下角，不显示任务栏图标。
- 点击任务卡可打开原 Codex 任务，不会启动、停止、归档或修改任务。

## 下载与运行

从 GitHub Releases 下载 `Codex-Task-Dock-v1.0.1-windows-x64.zip`，解压后保留整个目录，运行 `Codex Task Dock.exe`。v1.0.1 会在当前 Windows 用户的 Codex 安装目录中自动发现并验证 `codex.exe`，发布包不包含制作者的用户名、绝对路径、账号令牌、任务 ID 或任务名称。

关闭窗口只会隐藏 Dock；如需停止后台采集，请从托盘菜单选择退出。

如果 Codex 安装在非标准位置，可在启动前设置当前进程的环境变量：

```powershell
$env:CODEX_TASK_DOCK_CODEX_EXECUTABLE='D:\path\to\codex.exe'
& '.\Codex Task Dock.exe'
```

该路径必须是绝对路径、文件名必须为 `codex.exe`，且 `--version` 输出必须通过 Codex CLI 格式验证。

## 数据与隐私边界

- 只连接本机已经登录的 Codex 桌面环境；不是云端账号或跨设备同步。
- 默认名称只在本机从用户文字中提取关键词；不会读取附件正文或用助手回复猜测任务。
- 用户未提供的期限、公司、状态或步骤不会补造。
- 本机服务仅监听 `127.0.0.1`，使用临时随机令牌；默认无遥测。

### 可选的模型自动命名

模型自动命名默认关闭。明确同意把必要的用户任务文字发送到当前 Codex 账号所使用的 OpenAI 服务后，可在启动前设置：

```powershell
$env:CODEX_TASK_DOCK_ENABLE_AUTOMATIC_NAMING='1'
& '.\Codex Task Dock.exe'
```

启用后，每次命名最多使用 2,000 个字符；排除附件正文和助手回复，清理网址、邮箱、手机号及明显凭据片段。调用令牌仅在内存中转发，不写入日志或数据库；数据库只保存输入指纹、简短名称、状态和每日调用计数。其他取值均视为未授权。

## 开发与验证

技术栈：Tauri 2、Rust、Node.js、原生 HTML/CSS/JavaScript。

```powershell
npm test
cd shell
node runtime/tests/verify.mjs
```

个人版 v1.0.0 最终交付包曾完成303次检查、0失败。公开版 v1.0.1 另行执行可移植性、隐私默认值、安全扫描、完整源码回归和干净发布包检查；结果见对应 Release 与 [security_best_practices_report.md](security_best_practices_report.md)。测试数量包含重叠覆盖，不代表相同数量的独立需求。

## 已知边界

- 更新采用约 5 秒轮询，不是即时推送。
- 附件-only 新轮次可能暂时沿用较早但可追溯的具体名称。
- 当前发布面向 Windows x64 和本机 Codex 桌面环境。
- 当前公开二进制未使用商业代码签名证书；Windows 可能显示 SmartScreen 提示，请只从本仓库 Release 下载并核对 SHA-256。
- 本项目尚未声明开源许可证；公开可见和可下载不等同于授予再分发或改作权。

详见 [CHANGELOG.md](CHANGELOG.md) 与 [SECURITY.md](SECURITY.md)。
