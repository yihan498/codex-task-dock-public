# 可信字段与计划数据层合同 v1
日期：2026-08-31。来源：用户要求继续，优先真实步骤/业务字段；不改A布局、不接dashboard生产、不安装。

## 本轮可交付范围
1. core业务字段和日期的纯函数校验。
2. 以可信读取边界提供的线程/轮次/消息标识进行匹配的用户字段适配。
3. 官方turn/plan/updated通知的纯数据适配；无步骤id时保留step文本，不编造官方ID。
4. 修复deadline的allOf/additionalProperties矛盾，并用实际验证器验证正反例。
5. 脱敏能力观察与回归；不将适配器测试称为自动同步已上线。

## 来源边界
- extractBusinessFields只负责格式/来源标识完整性检查，本身不证明来源真实。
- 新的extractBoundBusinessFields必须收到可信读取器提供的绑定；userMessage的thread/turn/message逐一一致且kind一致才可投影。没有绑定、错配均空。
- dockManualInput使用用户选择的目标threadId及本地sourceRecordId，source.kind=dockManualInput；不伪造Codex的turn/message编号。
- 人工复制完整正文、示例、指令上下文等不会在本轮被批量解析。仅处理传入的明确标签行；冲突字段、代码块、引用行不提取。
- 持久化或UI尚未接入上述绑定入口。合法标识和kind字符串只提供校验，不等同独立身份认证。

## 日期和计划
- 相对“明天”要求合法带时区消息时间，先转换Asia/Shanghai日历日，再加一天；拒绝无时区、无效月日/时间。
- 日期计数对合法带来源期限按上海当天统计；缺失/无效/无来源不计。
- 空/畸形/未知状态/多个inProgress计划不得产生n/m；无当前步骤不猜当前进度，全completed不代表业务完成。
- 官方通知只有step/status也合法；nextStep保留文本，无官方ID则不填nextStepId。
- 新reducePlanObservations只接观察包：notification + source {kind:appServerSubscription, mode:live, threadId, turnId, receivedAt, localSequence}。
- binding明确当前threadId/turnId；通知turnId必须匹配，若自带threadId也必须一致；没有threadId时由可信订阅绑定提供。
- localSequence是本地采集顺序号，不是官方事件ID。筛选绑定线程/轮次后取最大顺序；完全重复去重，同序号冲突拒绝；最新畸形或无当前步骤不得回退到旧计划。
- receivedAt需要合法时间，观察超过10秒或来自未来/历史/未知来源不产生实时视图。时间新鲜度不能证明跨窗口订阅有效。
- 本轮不新增真实订阅或解析functions.exec代码；当前本线程日志结构计数没有发现直接官方plan事件或update_plan调用。

## 验证
- TDD: 来源缺失/空白、非用户、绑定错配、人工本地来源、字段冲突、引文/代码块。
- 日期: UTC跨日、偏移、月末/年末/闰日、无效日/时区、不同偏移量今日计数。
- 计划: 空/畸形/多active/全完成、官方无id条目、线程/轮次匹配、重复/乱序/新计划撤销、历史/过期拒绝。
- schema: 提取器真实产物含basis通过，非法字段与缺来源拒绝；相对deadline的basis必须带messageTime。
- 本机只找到jsonschema3.2.0 Draft7Validator；对本schema所用$ref/allOf/type/required/additionalProperties/if/then等共同语义执行校验，不声称完整Draft2020-12验证；不用依赖失败当Red。
- 原有回归继续；各工具输出脱敏，真实截图不读取/传输；未测真实步骤保持未测。
