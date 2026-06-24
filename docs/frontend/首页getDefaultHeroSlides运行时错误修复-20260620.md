# 首页 getDefaultHeroSlides 运行时错误修复 - 2026-06-20

message_type: handoff
request_id: REQ-20260620-首页getDefaultHeroSlides运行时错误
from_lane: frontend
to_lane: coordinator
created_at: 2026-06-20T22:59:00+08:00
recorded_in: 当前对话 / docs/worklog.md / docs/frontend/首页getDefaultHeroSlides运行时错误修复-20260620.md

## 根因

- `miniprogram/pages/home/index.js` 的 `data` 初始化调用了 `getDefaultHeroSlides()`。
- 文件内只有 `buildHeroSlides()`，没有定义 `getDefaultHeroSlides()`，导致小程序首页实例化时抛出 `ReferenceError`，首页空白。

## 修复内容

- 新增 `getDefaultHeroSlides()`，复用 `buildHeroSlides(getDefaultHomeModules().hero)` 生成默认轮播图数据。
- 给 `normalizePageConfig(config)` 增加空对象兜底，避免 `getPageConfig` 返回空值时继续触发首页启动错误。
- 未改 UI 风格、未改后端、未改 Web 后台、未部署、未写真实数据库、未触碰独牙 DB 数据。

## 改动文件

- `miniprogram/pages/home/index.js`
- `docs/frontend/首页getDefaultHeroSlides运行时错误修复-20260620.md`
- `docs/worklog.md`

## 验证结果

- `node --check miniprogram/pages/home/index.js`：通过。
- 静态确认：`getDefaultHeroSlides()` 已定义，`data.heroSlides` 和 `data.activeHeroSlide` 的引用可解析。
- 首页 WXML 标签闭合检查：通过。
- `git diff --check -- miniprogram/pages/home docs/frontend/首页getDefaultHeroSlides运行时错误修复-20260620.md docs/worklog.md`：通过，只有既有 LF/CRLF 提示。

## 剩余实机确认点

- 需要用户或 QA 在微信开发者工具重新编译后确认首页不再空白，控制台不再出现 `getDefaultHeroSlides is not defined`。
