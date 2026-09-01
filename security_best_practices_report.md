# Codex Task Dock v1.0.1 安全审查

## 执行摘要

公开发布前识别的三项重要问题均已修复：个人机器配置不再进入资产；远端模型命名改为明确选择加入；命名隔离不再锁死制作者的版本与规则哈希。生产界面未发现不可信数据进入 HTML 解析、动态代码执行或跨窗口消息的路径。本地服务只监听回环地址并要求每次启动随机生成的 Bearer 令牌。

当前无未解决的 Critical、High 或 Medium 代码级发现。仍有一个真实的分发门槛：Windows 二进制未使用商业代码签名证书，已在 README、SECURITY 与 Release 说明中明确披露并提供 SHA-256。

## 已修复发现

### SEC-001

- Severity: High
- Location: `src/reader/config.mjs:21`，`src/reader/main.mjs:10`
- Evidence: v1.0.1 通过受约束目录扫描、真实路径 containment、文件类型与 `codex-cli` 版本格式验证定位本机可执行文件；生产入口不再读取 `local-config.json`。
- Impact: 旧的机器绑定资产包含制作者本机绝对路径，公开后会泄露本机标识且无法在其他电脑直接运行。
- Fix: 删除发布运行时配置依赖；旧 v1.0.0 二进制资产在仓库公开前撤下。
- Mitigation: 非标准安装仅接受用户显式设置的绝对 `codex.exe` 路径，并执行相同验证。
- False positive notes: 本地路径不是账号凭据，但仍属于不应进入公共资产的个人环境数据。

### SEC-002

- Severity: Medium
- Location: `src/reader/config.mjs:13`，`src/reader/main.mjs:20`
- Evidence: 只有 `CODEX_TASK_DOCK_ENABLE_AUTOMATIC_NAMING=1` 才启用远端模型命名；默认走本地关键词提取。
- Impact: 在没有单独告知的情况下，自动命名会把最多2,000字符的必要用户任务文字发送到当前Codex账号使用的OpenAI服务。
- Fix: 改为安全默认关闭并提供明确选择加入说明。
- Mitigation: 继续保留附件/助手输出排除、敏感片段清理、一次性内存令牌转发和每日调用上限。
- False positive notes: 流量发往用户已登录的OpenAI服务而非第三方，但仍应由用户明确选择。

### SEC-003

- Severity: Medium
- Location: `src/reader/isolated-namer.mjs:28`
- Evidence: v1.0.1 从当前用户的 `AGENTS.md` 动态生成文件与包装消息哈希，并在线程启动前后复核；Codex版本只接受严格CLI格式，不再接受制作者固定值。
- Impact: 固定版本、路径和哈希会使其他用户命名失败，也可能在上下文变化后造成错误的安全判断。
- Fix: 动态绑定当前机器上下文并在任何不一致时失败关闭。
- Mitigation: 命名进程仍为只读、无工具、无MCP、无持久历史、无遥测的临时线程。
- False positive notes: 规则变更导致命名暂不可用属于预期的失败关闭，不影响本地状态采集。

## 已验证控制

- DOM/XSS：任务字段通过 `textContent` 和 `createElement` 渲染（例如 `shell/ui/app.mjs:80`、`shell/ui/app.mjs:105`），生产代码未发现 `innerHTML`、`eval`、`document.write` 或字符串事件处理器。
- CSP：Tauri配置使用仅self脚本/样式并禁止object、frame、base与form（`shell/src-tauri/tauri.conf.json:24`）。
- 本地传输：采集与命名门仅监听 `127.0.0.1`（`src/reader/service.mjs:30`、`src/reader/naming-gate.mjs:56`）；采集接口比较随机Bearer令牌（`src/reader/service.mjs:21`）。
- 令牌边界：命名门只转发必要Authorization和少量固定头，不转发Cookie或任意代理头（`src/reader/naming-gate.mjs:37`）。
- 发布卫生：暂存文件扫描覆盖个人路径、真实任务ID、业务名称、常见令牌/私钥格式和50MB以上Git对象；二进制资产另做解压后扫描。

## Low / 外部门槛

### SEC-004

- Severity: Low
- Location: GitHub Release distribution
- Evidence: 当前Windows可执行文件没有Authenticode商业签名。
- Impact: 用户可能看到SmartScreen提示，且不能仅凭发布者签名验证来源。
- Fix: 当前以GitHub HTTPS分发、Release SHA-256和可复现源码审查降低风险。
- Mitigation: 后续取得代码签名证书后再增加Authenticode签名；在此之前不要从镜像站下载。
- False positive notes: 未签名不代表二进制含恶意代码，但确实降低分发来源保证。
