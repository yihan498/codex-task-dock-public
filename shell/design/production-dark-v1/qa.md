# 生产深色紧凑界面 QA

2026-08-31。用户接受reference-style-v2的视觉方向，已通过TDD迁移到生产HTML/CSS，不复制计时、奖励、PVT、KSS或样例计划。

生产契约独立于静态稿，八轴校验通过。production-dark-v1和deadline-label-v1完整Red/Green/Refactor/Verify通过；最终24浏览器用例覆盖分区、未知字段、日期风险、分钟格式与截止已过、原名和精确ID交互、离线/刷新、文字安全及200%。

三张最终Chromium图：output/playwright/production-dark-v1-missing.png、production-dark-v1-bound.png、production-dark-v1-200percent.png（均相对shell）。标题例取用户已提供内容；分类与期限仅合成fixture，图上明确说明非实况。未使用真实任务截图。

主Agent已逐图视觉核对：390×560未知字段图有三项，标题要点可分别扫读；380×500绑定字段图中三项完整可见，框bottom分别250/312.5/401.5，任务区bottom457；320×560、200%下首项完整可见，后续需纵向滚动，无横向溢出。最终日期只到分钟。实际渲染文字最小对比度8.009，page errors 0。未知plan的进度图形数0。

保持色条用途与日期风险语义分离；公司标签不自动推断分区。“今日更新”不是今日到期，分区内优先不等于全局优先。无可信业务完成信息，截止已过不能作为未完成统计。

状态：specified/generated/rendered/browser-checked；视觉方向accepted，生产最终原生效果未accepted。Computer Use初始化和reset重试失败，未绕过取得桌面截图；普通view_image也遇ACL，改经获批只读方式检查合成文件，未控制桌面。原生与完整实时步骤验收仍分开待办。
