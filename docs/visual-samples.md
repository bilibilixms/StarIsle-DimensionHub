# 星屿第一批视觉样板

本次交付用户首页、商品详情与商家工作台三个视觉样板，并补充购物车、个人收藏、订单和商品管理视图。当前用户端与商家端已接入同一个本地模拟服务，实现上架、模拟支付、发货、确认收货的联动。后端没有改动，画师端与漫展方端的独立工程尚未在本批次制作。

## 预览路径

| 页面 | 入口 | 主要交互 |
| --- | --- | --- |
| 用户首页 | 用户 H5 的首页 | 商品搜索、分类、收藏、商品详情、画师及活动场景预览 |
| 商品详情 | 点击首页商品卡片 | 图片预览、标准/礼盒款、数量、收藏、加购、立即模拟购买 |
| 商家工作台 | 商家 H5 的首页 | 经营概览、店铺资料、待办、商品与订单入口 |
| 购物车/个人中心 | 用户底部导航 | 增减数量、移除/选择、模拟结算、订单及收藏恢复、重置 |
| 商品/订单管理 | 商家底部导航 | 新商品、价格库存编辑、上下架、模拟发货、物流详情及完成状态同步 |

启动命令见 [README](../README.md)。先运行 `npm run dev:demo`，两端默认连接 `http://127.0.0.1:8787`；无需启动 Java 后端、MySQL 或 Redis。商品、库存、店铺与订单保存在同一份 JSON 中，服务重启后可恢复。

## 建议演示顺序

1. 启动共享模拟服务和两端预览，确认页面显示「演示联动已连接」。商家端发布新品，用户端前台约 1.5 秒内出现同一商品。
2. 在用户首页收藏手办，进入详情选择礼盒版和数量 2，加入购物车；在「我的」可以修改虚构收货地址。
3. 从购物车确认合计 ¥316，完成「模拟支付」。用户订单生成、商品库存减少 2，商家端自动出现同一个订单编号、规格数量、金额和收货信息。
4. 在商家端打开这笔待发货订单，先提交空单号查看校验，再输入 `SF1234567890` 模拟发货。用户端无需刷新即可看到「待收货」和物流公司、单号。
5. 用户确认收货，两端均显示「已完成」。刷新页面或重启模拟服务后，订单及物流仍保留。
6. 在详情使用立即购买，已有购物车保持原样。商家修改价格或上下架后，用户列表会同步；若确认支付时价格已变，需按新价格重新确认。
7. 用户端可清空本机收藏与购物车；商家端「重置共享演示场景」会清空两端共享订单并恢复初始商品，操作前有明确确认。

收藏、购物车和虚构地址按角色保存在本机，商品与订单共用服务端状态。最初的单端模拟订单不会导入共享订单表，旧本地记录不被删除。初始共享订单为空，需要从用户端实际模拟下单。画师推荐和活动仍为场景预览，完整约稿、报名、核销和退款流程在后续批次实现。身份、支付、物流均为演示内容。

服务断开时展示上次同步记录和重试入口，写入操作不会回退为本地假成功。库存以服务端为准，购物车中同商品的不同规格合并校验数量；模拟支付成功扣库存并增加已售数。订单保留支付时的商品、规格、金额和收货信息快照。请求重试使用持久化操作标识，避免响应丢失后重复创建订单或重复扣库存。重置共享场景后，旧支付操作会被拒绝，需刷新并重新确认。

## 设计和素材

- 用户端以浅紫、星光插画、双列商品和粉色价格为主，商品详情保留大图、明确选项和底部购买操作。
- 商家端以暖橙、经营概览、待办和订单动作建立角色区分，复用四端后续可使用的导航、图标与弹层。
- 所有图标为代码维护的本地 SVG；图片为本次通过内置 `imagegen` 生成的原创素材，不依赖外部图片地址。
- 图片压缩为 JPEG 后，两张素材合计约 414 KB/端。共享源组件由 Vite 在编译时同步到各端，避免小程序跨目录组件路径问题。

| 素材 | 用户端保存位置 | 商家端保存位置 |
| --- | --- | --- |
| 星屿插画 | `apps/user-miniapp/src/static/demo/star-island.jpg` | `apps/merchant-miniapp/src/static/demo/star-island.jpg` |
| 手办商品图 | `apps/user-miniapp/src/static/demo/star-fairy.jpg` | `apps/merchant-miniapp/src/static/demo/star-fairy.jpg` |

两张素材通过内置工具生成，未使用 API/CLI 图像生成。原图本地保留在忽略提交的 `.tools/imagegen/`；仓库消费压缩后的 JPEG。替换原图时运行 `npm run assets:demo`，需要先在该目录准备 `hero.png` 与 `figurine.png`。

### 插画生成提示词

> Use case: illustration-story. Asset type: wide hero artwork for an anime merchandise miniapp, landscape 2:1. Original beautiful anime illustration of an adult lavender-haired star traveler wearing a modest elegant lilac dress with a small fluffy white cat, on a magical floating island amid pastel purple sky, stars, ribbons, crescent moons and pale blossoms. Character and cat on RIGHT HALF. LEFT HALF is softly detailed low-contrast lavender sky with ample negative space for app text overlaid in code. Palette lavender, periwinkle, pearl white, small peach accents. Professional detailed key visual, luminous gentle light. Full bleed, no UI, no frame, NO lettering, text, watermark or logos. Provide the saved local image file path.

### 手办生成提示词

> Use case: product-mockup. Asset type: square merchandise product photograph for an anime collectibles shopping app. A beautifully crafted original chibi fantasy figurine of an adult pink-haired star fairy, pastel pink and ivory layered modest dress with tiny star charms, long twin tails, a delicate star wand, standing on a translucent lavender crescent-shaped display base. Premium painted resin collectible with glossy eyes, fine sculpted hair and pearlescent trim. Product centered, entire figurine visible. Soft lilac studio backdrop with subtle blurred flowers and soft light, boutique anime collectible product photography, exceptional fine detail, charming and tasteful. NO text, logos, watermark, packaging or UI. Provide the saved local image file path.

## 验证范围

本批次本地验证结果：TypeScript 检查通过，用户端和商家端的微信小程序及 H5 构建通过，6 项服务集成测试与 10 项 Playwright 浏览器回归全部通过。预览合图位于 `.tools/previews/visual-samples.png`，单页截图与完整长截图位于同一目录。

浏览器回归覆盖：收藏恢复、礼盒价格和数量、购物车结算、立即购买保留购物车、搜索空结果、无效商品、发货校验、商品编辑持久化，以及两个同时打开的应用完成发布、虚构收货信息编辑、支付、发货、收货全流程，确认规格弹层、支付确认与商家收货信息一致。另覆盖支付响应丢失后刷新重试、断线恢复，以及确认支付时商品改价。服务集成测试覆盖库存并发、购物车整体校验、重复请求、重启持久化和重置场景。三个样板检查 375/390/430px 宽度，截图保存到 `.tools/previews/`。

2026-10-31 已将两端导入 Windows 微信开发者工具 2.02.2609240，使用工具提供的测试号完成模拟器首页显示检查，并完成一笔原生模拟器中的实际联动操作：用户模拟支付、商家填写虚构物流单号发货、用户查看物流并确认收货，两端显示同一订单已完成。导入时发现 WXSS 编译器不接受减少动效规则中的通配选择器，已将该规则限定为 H5 使用，微信原生样式编译检查通过。模拟器截图保存为 `.tools/previews/user-wechat.png`、`product-wechat.png` 和 `merchant-wechat.png`；本次联动验收截图为 `.tools/previews/user-linked-wechat.png` 与 `.tools/previews/merchant-linked-wechat.png`。

微信小程序与 H5 均需构建通过。尚未完成 iOS/Android 真机验收；完整交易交互、不同设备的安全区和设备行为仍需继续复核。浏览器检查仅代表 H5 验证范围。
