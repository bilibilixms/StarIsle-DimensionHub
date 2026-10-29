# StarIsle-DimensionHub

星屿｜二次元社区与交易平台，连接用户、画师、漫展方及商家。

采用模块化单体架构：两个独立小程序共用一个 Spring Boot 后端。当前提供开发骨架、真实商品列表接口及依赖环境，交易闭环将逐步实现。

| 模块 | 技术 |
| --- | --- |
| 用户端、商家端 | uni-app + Vue 3 + TypeScript |
| 前端工作区 | npm workspaces，共享接口类型与请求封装 |
| 后端 | Java 21 + Spring Boot 4.1.2 + Maven Wrapper |
| 数据与缓存 | MySQL 8.4 LTS + Redis 8.2 |
| 数据库迁移、接口文档 | Flyway + springdoc OpenAPI |
| 开发依赖 | Docker Desktop + Docker Compose |

```text
apps/user-miniapp/      用户端小程序
apps/merchant-miniapp/  商家端小程序
packages/shared/       共用接口类型和 uni.request 封装
backend/               模块化单体后端
scripts/               环境、构建和启动工具
compose.yaml           MySQL、Redis 开发环境
```

## 本地启动（WSL2 / Linux）

需要 Git、Python 3、curl、tar，以及可正常执行 `docker info` 和 `docker compose version` 的 Docker 环境。Docker Desktop 用户需打开当前发行版的 WSL Integration。

首次配置，在仓库根目录执行：

```bash
# 可选：安装项目内的 Node.js 22.23.4、Temurin JDK 21（Linux x86_64）
bash scripts/bootstrap.sh

# 生成仅保存在本地的随机数据库与 Redis 密码，不覆盖已有 .env
python3 scripts/init-env.py
docker compose up -d --wait
./scripts/npm.sh ci
```

工具安装在忽略提交的 `.tools/`，不会修改系统 Node、Java 或 shell 配置。也可以自行安装上述版本，脚本会使用系统工具。首次执行 Maven Wrapper 会自动下载 Maven；依赖缓存同样在 `.tools/`。

分别打开终端启动后端和需要的小程序：

```bash
# 后端；自动读取根目录 .env
./scripts/mvn.sh spring-boot:run

# 用户端微信小程序，持续构建
./scripts/npm.sh run dev:user

# 商家端微信小程序，持续构建
./scripts/npm.sh run dev:merchant
```

微信开发者工具分别导入 `apps/user-miniapp/dist/dev/mp-weixin` 和 `apps/merchant-miniapp/dist/dev/mp-weixin`。默认使用游客 AppID；正式开发时在各自 `src/manifest.json` 的 `mp-weixin.appid` 填入对应小程序 AppID。游客模式能力有限，微信登录、支付及发布需要真实账号配置。

也可以用 H5 辅助联调：

```bash
./scripts/npm.sh run dev:user:h5       # http://localhost:5173
./scripts/npm.sh run dev:merchant:h5   # http://localhost:5174
```

| 服务 | 本地地址 |
| --- | --- |
| REST API | http://127.0.0.1:8080/api/v1/products |
| 健康检查 | http://127.0.0.1:8080/actuator/health |
| OpenAPI JSON | http://127.0.0.1:8080/v3/api-docs |
| Swagger UI | http://127.0.0.1:8080/swagger-ui/index.html |
| MySQL | 127.0.0.1:13306 |
| Redis | 127.0.0.1:26379 |

数据库与 Redis 密码见本地 `.env`，数据库名和用户名默认均为 `starisle`。初次启动 Flyway 自动建表；没有演示商品时接口返回空列表。Swagger 文档只在本地 `.env` 开启，默认配置关闭。

端口可在根目录 `.env` 修改。小程序 API 地址默认 `http://127.0.0.1:8080`，可复制各应用的 `.env.example` 为 `.env.local` 后修改 `VITE_API_BASE_URL`，修改后重新构建。

真机调试时，`127.0.0.1` 指向手机，需要使用手机可访问的后端地址，并相应设置 `SERVER_ADDRESS`、WSL/Windows 网络与防火墙。微信开发者工具本地调试可临时关闭域名校验；上线必须配置 HTTPS 合法请求域名，商品图片还需配置对应的图片域名。H5 在 `localhost:5173/5174` 联调，其他来源需加入 `CORS_ALLOWED_ORIGINS`。

## 验证和构建

```bash
./scripts/npm.sh run typecheck
CI=true ./scripts/npm.sh run build       # 两个微信小程序
CI=true ./scripts/npm.sh run build:h5    # 两个 H5 预览产物
./scripts/mvn.sh verify                  # 真实 MySQL、Redis 集成测试与后端 JAR
```

前端产物位于各应用 `dist/build/`，后端 JAR 为 `backend/target/starisle-backend-0.0.1-SNAPSHOT.jar`。`CI=true` 跳过 uni-app 编译器的联网更新检查，适用于自动化和受限环境。测试通过 Testcontainers 自动启动临时容器，不读取或改动开发数据库。

GitHub Actions 已配置类型检查、两端构建及后端集成测试；推送后可查看远端结果。

## 当前范围

- 已实现：商品列表及关键词检索、分页校验、上下架与店铺状态过滤、统一响应、CORS、数据库迁移、Redis 健康检查、接口文档。
- 用户端：可查询真实商品，包含加载、空列表和失败重试状态。
- 商家端：起始页与独立构建配置，入驻、商品和订单管理尚未实现。
- 后端已预留账号、店铺、收藏、订单、支付模块；当前仅公开商品列表和健康检查等必要入口，未实现的私有接口不会放行。
- 文件存储、微信登录、收藏、下单、支付尚未接入，不具备上线交易条件。

当前开发方向调整为参考展示图中的用户端、画师端、漫展方端、商家端四个小程序应用端演示，不包含 Web 管理界面和后端服务开发。后续通过本地样例数据及状态操作完善页面与交互，现有后端工程保留。模块边界与数据约定见 [架构说明](docs/architecture.md)。

各端页面、模拟交互、两人分工和验收条件见 [应用端开发规划](docs/development-plan.md)：四个小程序预计 3–4 周。此处为后续开发规划，目前代码仍为上述已实现范围。

停止本项目依赖可运行 `docker compose stop`，数据保存在项目命名卷中。不要将 `.env`、构建缓存或第三方密钥提交到 Git。
