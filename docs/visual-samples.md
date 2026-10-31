# 星屿第一批视觉样板

本次交付用户首页、商品详情与商家工作台三个视觉样板，并补充验证主要动作所需的购物车、个人收藏、订单和商品管理视图。后端没有改动，画师端与漫展方端的独立工程尚未在本批次制作。

## 预览路径

| 页面 | 入口 | 主要交互 |
| --- | --- | --- |
| 用户首页 | 用户 H5 的首页 | 商品搜索、分类、收藏、商品详情、画师及活动场景预览 |
| 商品详情 | 点击首页商品卡片 | 图片预览、标准/礼盒款、数量、收藏、加购、立即模拟购买 |
| 商家工作台 | 商家 H5 的首页 | 经营概览、店铺资料、待办、商品与订单入口 |
| 购物车/个人中心 | 用户底部导航 | 增减数量、移除/选择、模拟结算、订单及收藏恢复、重置 |
| 商品/订单管理 | 商家底部导航 | 新商品、价格库存编辑、上下架、模拟发货与退款、物流详情 |

启动命令见 [README](../README.md)。首页原有的 API 请求已替换为独立本地演示数据，两个应用无需后端即可预览。

## 建议演示顺序

1. 在用户首页收藏手办，再进入商品详情，选择礼盒版和数量 2，加入购物车。
2. 从购物车查看合计 ¥316，完成明确标注的模拟支付，再到个人中心查看订单；刷新后订单仍在。
3. 在商品详情使用立即购买，生成独立模拟订单，已有购物车保持原样。
4. 打开商家工作台的待发货订单，先提交空单号查看校验，再输入 `SF1234567890` 完成模拟发货；待收货列表中可查物流。
5. 在商家商品页编辑价格和库存，进行下架或上架；刷新后修改仍保留。
6. 在「我的」重置数据，重新演示初始场景。

各端的本地存储互相独立。商家侧订单为预置样例，并非用户侧模拟支付后自动生成的跨端记录。画师推荐可演示关注切换，活动仅展示说明；完整约稿、报名和核销流程在后续批次实现。样板中的身份、交易、物流和统计均为演示内容。

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

本批次本地验证结果：TypeScript 检查通过，用户端和商家端的微信小程序及 H5 构建通过，6 项 Playwright 浏览器回归全部通过。预览合图位于 `.tools/previews/visual-samples.png`，单页截图与完整长截图位于同一目录。

浏览器回归覆盖：收藏恢复、礼盒价格和数量计算、购物车结算、独立立即购买不改动购物车、搜索空结果、无效商品、物流校验及发货恢复、价格库存编辑及上下架恢复。三个样板检查 375/390/430px 宽度，截图保存到 `.tools/previews/`。

微信小程序与 H5 均需构建通过。当前没有使用微信开发者工具或 iOS/Android 真机完成验收；原生小程序的图标、弹层、安全区和设备行为仍需在相应环境复核。浏览器检查仅代表 H5 验证范围。
