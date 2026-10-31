# StarIsle-DimensionHub

星屿｜次元聚集地。面向用户、画师、漫展方和商家的二次元社区与交易产品。

当前应用采用一个小程序统一入口，选择用户或商家身份后注册、登录；画师和漫展方保留选项，暂未开放。用户首页、商品详情和商家工作台已通过本地模拟服务打通“上架 → 模拟支付 → 发货 → 确认收货”。原有 user-miniapp、merchant-miniapp 两个构建目标保留，均提供同一套完整页面，方便现有开发者工具项目继续预览。

## 快速预览应用端

需要 Node.js 22.23.4 / npm 10。已有项目内工具链时脚本会自动使用 `.tools/node`；工具安装方式见下方。

```bash
./scripts/npm.sh ci

# 三个终端分别执行；无需启动 Java 后端、MySQL 或 Redis
./scripts/npm.sh run dev:demo
CI=true ./scripts/npm.sh run dev:user:h5
CI=true ./scripts/npm.sh run dev:merchant:h5
```

- 用户端：http://localhost:5173
- 商家端：http://localhost:5174
- 商品详情：在用户首页点击商品卡片。

首次打开进入身份选择和注册登录页。手机号只校验 `1` 开头的 11 位数字，密码至少 6 位（最多 128 位），用户校验通过即可注册并登录，不发送短信。商家注册分为填写信息、资质验证两步，可选填店铺名称；资质验证页显示固定演示验证码 `1234`，输入正确后才开通商家身份。同一手机号使用原密码可同时开通用户和商家，已有用户新增商家身份也需完成资质验证，商家日常登录不需要验证码。已有演示账号为 `13800000000 / 123456`，同时拥有用户和商家身份，原有演示商品、订单保留在该账号下。

用户可选择「先逛逛」浏览和搜索商品，收藏、购物车、下单及订单详情需要登录；商家没有游客工作台。个人中心支持切换身份、退出登录。各用户的本机购物车、收藏、地址和待确认支付操作分别保存，订单按账号隔离；新商家拥有自己的空店铺，不能操作其他店铺的商品、订单或重置其数据。账号和会话保存在本地演示服务，密码以带随机盐的摘要保存。这是开发演示账号体系，手机号未验证归属。

商品、库存、店铺、订单及演示账号统一保存在 `.tools/demo/marketplace.json`，服务重启后仍会恢复；前台每 1.5 秒自动同步。用户「我的」可修改虚构收货地址、清空本机收藏和购物车；点击订单卡片查看独立订单详情；商家「我的」可重置本店演示数据。微信授权、短信验证、真实支付及物流尚未接入，「模拟支付」不会扣款。服务断开时页面显示提示，注册、支付和发货不会回退为单端假成功。

视觉样板的操作路径、验证范围和素材说明见 [视觉样板说明](docs/visual-samples.md)。

## 微信小程序预览与构建

```bash
# 先启动共享演示服务，再分别持续构建两个小程序
./scripts/npm.sh run dev:demo
CI=true ./scripts/npm.sh run dev:user
CI=true ./scripts/npm.sh run dev:merchant

# 验证与发布构建
./scripts/npm.sh run typecheck
CI=true ./scripts/npm.sh run build
CI=true ./scripts/npm.sh run build:h5
```

微信开发者工具导入各应用的 `dist/dev/mp-weixin`；正式构建输出在 `dist/build/mp-weixin`，H5 输出在 `dist/build/h5`。各端的 `touristappid` 是占位配置；在开发者工具导入页点击「测试号」，即可使用当前登录账号提供的测试 AppID。使用自己的小程序账号时，可在 `src/manifest.json` 的 `mp-weixin.appid` 配置对应 AppID。

若 Windows 微信开发者工具拒绝 WSL 的 `\\wsl.localhost\\...` 路径，可将编译产物持续同步到 Windows 本地目录：

```bash
python3 scripts/sync-weixin-preview.py \
  --target /mnt/c/Users/<Windows用户名>/WeChatProjects/StarIsle \
  --watch
```

然后导入该 Windows 目录中的 `user-miniapp` 和 `merchant-miniapp`。同步仅处理编译产物，保留开发者工具的私有配置；源配置仍为占位值时，也保留在 Windows 副本中填写的有效 AppID。开发时保持两个小程序的持续构建和同步命令运行；源码仍在本仓库中修改，Windows 目录用于编译预览。

`CI=true` 用于跳过 uni-app 编译器的联网更新检查。两端默认连接 `http://127.0.0.1:8787`。在微信开发者工具的本地设置中关闭合法域名、TLS 与 HTTPS 证书校验后编译；此配置仅用于本地模拟器。WSL 启动服务后可用 Windows PowerShell 的 `Invoke-RestMethod http://127.0.0.1:8787/health` 检查 localhost 转发。需要变更地址时，在两个应用的 `.env.local` 中设置相同的 `VITE_DEMO_API_BASE_URL`，然后重新构建。当前服务仅监听本机，不提供手机真机网络访问。

## 浏览器交互回归

首次准备浏览器：

```bash
./scripts/npm.sh exec -- playwright install --with-deps chromium
```

构建 H5 后执行：

```bash
./scripts/npm.sh run test:demo
CI=true ./scripts/npm.sh run build:h5
./scripts/npm.sh run test:e2e
```

Playwright 自动启动并关闭使用隔离测试数据的模拟服务（8787）和本地静态服务器（4173、4174），验证主要交互并保存截图到 `.tools/previews/`，报告在 `.tools/playwright-report/`。运行浏览器测试前先停止日常使用的 8787 服务；测试数据位于 `.tools/test-demo/marketplace.json`，不会读取日常演示数据。依赖已在系统或项目内可用时直接执行测试即可；若浏览器安装到自定义目录，运行时同时设置 `PLAYWRIGHT_BROWSERS_PATH`。

GitHub Actions 包含类型检查、模拟服务测试、两端构建和浏览器回归；原有后端集成测试继续保留。

## 工程结构

```text
apps/user-miniapp/      统一小程序入口，包含用户页面及商家工作台
apps/merchant-miniapp/  兼容原商家预览项目的完整构建目标
packages/ui/           共用图标、导航、弹层和主题
packages/shared/       接口类型、原有请求封装、本地演示数据及状态操作
backend/               已有 Java 21 + Spring Boot 4.1.2 后端骨架
scripts/               本地联动模拟服务、环境、构建和素材工具
compose.yaml           已有 MySQL 8.4 / Redis 8.2 开发环境
```

小程序编译要求 Vue 组件位于应用源目录内。`scripts/prepare-miniapp.mjs` 在 Vite 配置加载时同步共享组件、用户页面组件和商家工作台到各目标忽略提交的 `src/generated/`。用户页面组件维护于 `apps/user-miniapp/src/components`，商家工作台维护于 `apps/merchant-miniapp/src/components/MerchantWorkspace.vue`；共享组件维护于 `packages/ui/src`，改动后重启构建以更新两个预览目标。

样板使用 uni-app + Vue 3 + TypeScript，工作区由 npm workspaces 管理。UI 素材位于各应用 `src/static/`；实际组件和交互使用代码实现。

## 工具链及已有后端

Linux x86_64 / WSL2 可选安装项目内 Node.js 22.23.4 与 Temurin JDK 21：

```bash
bash scripts/bootstrap.sh
```

工具缓存位于忽略提交的 `.tools/`，不会修改系统 shell 配置。应用端演示无需启动下列后端服务；需要查看已有接口时再执行：

```bash
python3 scripts/init-env.py
docker compose up -d --wait
./scripts/mvn.sh spring-boot:run
```

后端商品接口为 `http://127.0.0.1:8080/api/v1/products`，健康检查为 `/actuator/health`，本地开启的 Swagger UI 为 `/swagger-ui/index.html`。MySQL、Redis 默认端口分别为 13306、26379，本地随机密码保存在 `.env`。后端验证命令为 `./scripts/mvn.sh verify`，通过 Testcontainers 使用隔离数据库。

Docker Desktop 用户需启用当前发行版的 WSL Integration。停止本项目依赖使用 `docker compose stop`；不要提交 `.env`、第三方密钥或工具缓存。

## 开发规划

当前调整为一个小程序内的用户、商家、画师、漫展方四种身份，先开放用户和商家。当前不开发 Web 管理界面，登录与交易使用本地演示服务，后续再接入真实身份验证和正式业务服务。

具体页面、两人分工和验收条件见 [应用端开发规划](docs/development-plan.md)。已有后端与长期模块约定见 [架构说明](docs/architecture.md)。
