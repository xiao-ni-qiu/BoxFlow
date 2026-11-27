# 贡献指南

感谢你愿意花时间改进 BoxFlow。无论是报 Bug、提需求、改文档还是写代码，都是有价值的贡献。

## 开始之前

- 提问、报 Bug、提需求请走 [Issues](https://github.com/xiao-ni-qiu/BoxFlow/issues)，先搜一下有没有重复。
- 安全问题**不要**开公开 Issue，请按 [SECURITY.md](SECURITY.md) 私下报告。
- 想改造型或加功能，建议先开 Issue 说明场景，避免写完发现方向不一致。

## 开发环境

| 依赖 | 版本 |
| --- | --- |
| Node.js | 20 LTS 或更高 |
| npm | 10+ |
| 操作系统 | Windows 10/11 x64（当前仅提供 Windows 构建） |

```bash
git clone https://github.com/xiao-ni-qiu/BoxFlow.git
cd BoxFlow
npm install
npm run dev
```

`npm install` 之后会自动执行 `scripts/setup-native.mjs`，为 Electron 的 ABI 准备 `better-sqlite3` 预编译二进制。如果报错，执行 `npx @electron/rebuild -f -w better-sqlite3`。

数据写在 `%APPDATA%\BoxFlow`，与正式安装版隔离，随便折腾。

## 代码结构约定

改动前先找到正确的层，项目刻意保持分层：

| 目录 | 职责 | 不该做的事 |
| --- | --- | --- |
| `src/main/ipc/` | IPC 路由、参数校验、响应格式化 | 写业务规则、拼 SQL |
| `src/main/mcp/` | MCP 工具定义与校验 | 直接访问数据库 |
| `src/main/modules/*/service.ts` | 业务规则、跨表编排、事务 | 依赖 IPC / HTTP 类型 |
| `src/main/modules/*/repository.ts` | 全部 SQL 与行映射 | 做业务判断 |
| `src/renderer/` | 界面与交互 | 直接访问数据库或文件系统 |
| `src/shared/` | 跨进程共享的类型、常量、契约 | 引入 Node 或 React 依赖 |

几条硬性要求：

- 新增字段要同时改 `shared/types.ts`、`shared/schemas.ts`（校验）、`repository.ts`（读写）、迁移脚本，缺一个就会在某个入口丢数据；
- 数据库结构变更一律新增迁移，不改历史迁移文件；
- 渲染进程只通过 preload 暴露的白名单 API 访问主进程；
- 类型不留 `any`，`npm run typecheck` 必须零错误。

## 提交规范

提交信息用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：

```
feat: 支持按供应商批量导出
fix: 修复筛选下拉框出现双箭头
docs: 补充 MCP stdio 桥配置示例
refactor: 抽出库存变更的公共校验
chore: 升级 electron-builder 到 26.x
```

一个提交只做一件事。格式化、重命名这类噪音改动请单独提交，别混在功能里。

## 分支与 PR

1. 从 `main` 切分支：`feat/xxx`、`fix/xxx`、`docs/xxx`；
2. 本地自测通过后提交 PR，描述里写清**做了什么、为什么、怎么验证**；
3. 涉及界面的改动请附截图或录屏；
4. 涉及数据库的改动请说明迁移是否向后兼容、老数据会怎样。

合并前会检查：

- [ ] `npm run typecheck` 通过
- [ ] `npm run build` 通过
- [ ] 手动跑过改动涉及的界面路径（不只是编译通过）
- [ ] 改了 MCP 工具的话，`npm run test:mcp` 通过（需先启动应用）
- [ ] 没有提交 `node_modules`、`out`、`dist`、数据库文件或本地截图

## 打包验证

```bash
npm run dist
```

产物在 `dist/BoxFlow-<版本号>-x64.exe`。改动涉及打包配置（`electron-builder.yml`）时，请务必装一次安装包再跑一遍主流程——开发模式正常不代表打包后正常（历史上有过 asar 完整性校验导致打包版静默退出的问题）。

> **国内网络打包**：electron-builder 会从 GitHub 下载 Electron 运行时与 NSIS 等构建依赖，直连容易卡在 `Timeout awaiting 'request'`。改用镜像即可：
>
> ```bash
> ELECTRON_MIRROR=https://cdn.npmmirror.com/binaries/electron/ \
> ELECTRON_BUILDER_BINARIES_MIRROR=https://cdn.npmmirror.com/binaries/electron-builder-binaries/ \
> npx electron-builder --win --x64
> ```
>
> 构建依赖下载过一次后会进本机缓存，之后不再联网。

## 文档与截图

README 里的截图来自应用内置的截图模式：

```bash
npm run shot -- --shot-delay=2500
```

图片会写到 `docs/shots/`（已在 `.gitignore` 中）。挑合适的图手动复制到 `docs/images/` 并覆盖同名文件，再提交。

## 行为准则

参与本项目即表示同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。技术分歧可以争，人身攻击不行。

## 许可

向本项目提交代码即表示你同意以 [Apache License 2.0](LICENSE) 授权你的贡献。
