# 安全策略

## 支持范围

| 版本 | 是否接收安全更新 |
| --- | --- |
| 最新 Release | 是 |
| 更早版本 | 否，请先升级 |

## 报告漏洞

**请不要开公开 Issue。** 请任选一种方式：

1. GitHub 私密报告：[Security → Report a vulnerability](https://github.com/xiao-ni-qiu/BoxFlow/security/advisories/new)（推荐，支持加密与协作修复）
2. 私信维护者 [@xiao-ni-qiu](https://github.com/xiao-ni-qiu)

报告里请尽量包含：影响版本、复现步骤、影响面（能否读取/篡改数据、是否需要本地访问），以及你认为可行的修复方向。收到后会在 7 天内确认，修复发布后会在 Release Notes 中致谢（除非你希望匿名）。

## 已知安全设计

BoxFlow 是本地单机应用，没有账号体系与云服务，攻击面主要集中在这几处，设计上已做如下约束：

| 面 | 措施 |
| --- | --- |
| MCP HTTP 服务 | 仅绑定 `127.0.0.1`，不监听局域网；每个请求校验随机生成的 Bearer 令牌；令牌存于 `%APPDATA%\BoxFlow\mcp-connection.json`，可在设置页一键重置 |
| 渲染进程 | 开启 `contextIsolation`，关闭 `nodeIntegration`；只能调用 preload 白名单里的 IPC 通道 |
| 数据库与文件 | 仅主进程可访问；IPC 与 MCP 的入参全部做 schema 校验后才进 service 层 |
| 导入文件 | 解析 `.xlsx` / CSV 时限制字段长度与行数，异常内容按非法数据处理，不执行任何公式 |
| 自动更新 | 当前版本不内置自动更新，避免引入签名与分发链路的额外风险 |

## 不属于安全问题的情形

- 已获得你本机文件系统访问权限的攻击者能读取数据库 —— 这是本地应用的固有前提；
- 你自己把 `mcp-connection.json` 里的令牌贴到公开渠道导致被本机进程调用；
- 使用第三方修改版安装包导致的行为异常。

## 依赖漏洞

依赖安全告警请直接开 Issue 并注明 `security` 标签（不涉及利用细节的可以公开讨论）。本项目通过 `npm audit` 关注传递依赖，升级会在 CHANGELOG 中注明。

### 当前已知告警（v0.1.x）

`npm audit` 共报告 14 条（10 moderate / 4 high），**全部需要跨大版本升级才能消除**，因此在 0.1.x 系列中保留并记录：

| 依赖 | 级别 | 判断 |
| --- | --- | --- |
| `electron` 33.x | high | ASAR 完整性校验可被本地绕过 —— 前提是攻击者已能改写安装目录内文件，与本地应用信任模型一致；已在 `electron-builder.yml` 中显式关闭该校验，属已知取舍。修复需升级至 Electron 35+，列入下个版本 |
| `vite` / `esbuild` / `extract-zip` | high | 仅存在于构建与打包链路（devDependencies），不随成品分发；受影响场景是启动开发服务器或解压不可信压缩包 |
| `zod` 3.23 | high | 校验超大集合时才可能耗尽内存；本项目所有 schema 都在本地进程内、入参规模可控（单条物料/单次批量），暴露面极小。升级 zod 4 属破坏性变更，需要单独回归 |
| `exceljs` → `uuid`、`minimatch`、`app-builder-lib` | moderate | 触发条件为构造恶意 xlsx / 恶意 glob 模式。导入功能只解析本地文件、不执行公式；构建工具链不下发给最终用户 |

处理计划：升级 Electron 到 35+、zod 到 4.x、vite 到 6+ 会在 0.2.0 集中完成，并补充导入解析的边界测试。
