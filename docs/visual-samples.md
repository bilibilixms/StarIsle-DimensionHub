# 星屿第一批视觉样板

本次交付统一身份入口、用户首页、商品详情与商家工作台，并补充购物车、个人收藏、订单和商品管理视图。当前在同一小程序内选择身份，使用本地演示账号注册登录，完成上架、模拟支付、发货、确认收货的联动。Java 后端没有改动，画师和漫展方身份暂未开放。

## 预览路径

| 页面            | 入口                                   | 主要交互                                                                                                         |
| --------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 身份选择及登录  | 首次打开、切换身份或退出登录后         | 用户和商家注册登录，手机号基本格式校验，密码至少 6 位，用户可游客浏览；画师和漫展方只展示暂未开放                |
| 用户首页        | 用户 H5 的首页                         | 商品与店铺搜索、分类、收藏、商品详情、画师及活动场景预览                                                         |
| 店铺详情        | 首页店铺搜索结果、商品详情「进店逛逛」 | 店铺名称与介绍、本店上架商品、库存预警、商品购买入口及返回搜索                                                   |
| 商品详情        | 点击首页商品卡片                       | 图片预览、标准/礼盒款、数量、收藏、加购、立即模拟购买                                                            |
| 订单详情        | 点击「我的订单」中的订单卡片           | 独立查看订单状态、原商品与金额、下单时地址、物流、完成时间；点击商品图片区进入当前商品购买页；待收货时可确认收货 |
| 商家工作台      | 选择商家身份后登录                     | 经营概览、店铺资料、待办、商品与订单入口；仅显示本店数据                                                         |
| 购物车/个人中心 | 用户底部导航                           | 增减数量、移除/选择、模拟结算、订单及收藏恢复、重置                                                              |
| 商品/订单管理   | 商家底部导航                           | 新商品、价格库存编辑、上下架、模拟发货、物流详情及完成状态同步                                                   |

启动命令见 [README](../README.md)。先运行 `npm run dev:demo`，两端默认连接 `http://127.0.0.1:8787`；无需启动 Java 后端、MySQL 或 Redis。商品、库存、店铺与订单保存在同一份 JSON 中，服务重启后可恢复。

## 建议演示顺序

可在首页搜索商家店铺名称，点击「相关店铺」进入独立店铺页，查看该店介绍和上架商品；搜索店铺名也会列出该店的上架商品。商品详情的「进店逛逛」进入同一店铺。店铺信息、库存和商品上下架会自动同步，未上架商品不出现在店内列表。搜索支持忽略两端空格和英文字母大小写；从店铺返回时保留原搜索词。游客可以浏览，购买和收藏需要登录。

1. 启动共享模拟服务和预览，使用演示账号 `13800000000 / 123456` 登录。两个构建目标都支持完整页面；用两个独立浏览器会话分别登录用户和商家，确认「演示联动已连接」。商家发布新品，用户前台约 1.5 秒内出现同一商品。
2. 在用户首页收藏手办，进入详情选择礼盒版和数量 2，加入购物车；在「我的」可以修改虚构收货地址。
3. 从购物车确认合计 ¥316，完成「模拟支付」。用户订单生成、商品库存减少 2，商家端自动出现同一个订单编号、规格数量、金额和收货信息。
4. 在商家端打开这笔待发货订单，先提交空单号查看校验，再输入 `SF1234567890` 模拟发货。用户端无需刷新即可看到「待收货」和物流公司、单号。
5. 用户确认收货，两端均显示「已完成」。点击已完成订单进入订单详情，查看原交易记录；详情中的商品图片和名称区域可点击进入对应商品购买页，返回后继续查看原订单。收藏的商品仍进入商品购买详情。刷新页面或重启模拟服务后，订单及物流仍保留。
6. 在详情使用立即购买，已有购物车保持原样。商家修改价格或上下架后，用户列表会同步；若确认支付时价格已变，需按新价格重新确认。
7. 商家将同一商品的库存调为 1，用户首页、详情和规格弹层应显示「库存紧张，仅剩 1 件」；数量加号不可继续增加。已有超量购物车会提示库存不足并阻止结算。库存归零后显示「已售罄」，补货后恢复购买。
8. 用户可清空本机收藏与购物车；商家「重置本店演示数据」仅清理本店商品和订单，初始演示店铺会恢复样例商品，其他店铺保留，操作前有明确确认。
9. 商家打开商品编辑后，用户买走一件；商家只改价格并保存，库存应保留销售后的数量。若同时主动修改库存，则拦截过期表单，提示重新打开编辑确认；重新打开时显示最新库存。
10. 从已完成订单进入已下架商品，页面仍可返回原订单。支付响应丢失后，即使商品下架、页面重新加载，也保留「确认支付结果」入口；已成功订单恢复原结果，未成功订单显示下架提示并停止重试。

收藏、购物车、虚构地址和待确认支付按账号及身份保存在本机，订单按账号隔离，商家数据按店铺隔离。旧共享演示记录归属于内置演示账号。新用户没有其他用户的订单，新商家从空店铺开始。商家注册先填写信息，再输入资质验证页明示的固定验证码 `1234`，用于模拟资质及文件手续审核；服务端拒绝空验证码或错误验证码。同号用户新增商家身份也需验证，通过后仍为同一账号；已有商家登录及普通用户注册无需此验证码。演示账号和会话会持久保存，退出登录后旧令牌失效；手机号只校验格式、不验证归属。画师推荐和活动仍为场景预览，完整约稿、报名、核销和退款流程在后续批次实现。身份、支付、物流均为演示内容。

同步共享状态时会清理已不存在商品对应的本机购物车和收藏记录，防止共享场景重置后留下不可见条目阻塞结算。仍在共享列表中的下架商品保留在购物车中，提示已下架并支持移除。

服务断开时展示上次同步记录和重试入口，写入操作不会回退为本地假成功。库存以服务端为准，购物车中同商品的不同规格合并校验数量；模拟支付成功扣库存并增加已售数。用户端在剩余 1–5 件时显示库存紧张提示，0 件时禁用新购买；商品页在同步减库存时收紧数量，购物车按已选规格合计校验，并在支付确认前重新同步。若商家在确认弹窗打开后继续减库存，服务端仍会拒绝超量订单，并返回最新库存刷新页面。订单保留支付时的商品、规格、金额和收货信息快照。订单详情按订单编号读取这份记录，商品改名、改价或下架不会改变原订单展示。新订单同时保存店铺名称；已有订单缺少店铺名称字段时兼容显示当前店铺名。请求重试使用持久化操作标识，避免响应丢失后重复创建订单或重复扣库存。重置共享场景后，旧支付操作会被拒绝，需刷新并重新确认。

## 设计和素材

- 用户端以浅紫、星光插画、双列商品和粉色价格为主，商品详情保留大图、明确选项和底部购买操作。
- 商家端以暖橙、经营概览、待办和订单动作建立角色区分，复用四端后续可使用的导航、图标与弹层。
- 所有图标为代码维护的本地 SVG；图片为本次通过内置 `imagegen` 生成的原创素材，不依赖外部图片地址。
- 图片压缩为 JPEG 后，两张素材合计约 414 KB/端。共享源组件由 Vite 在编译时同步到各端，避免小程序跨目录组件路径问题。

| 素材       | 用户端保存位置                                      | 商家端保存位置                                          |
| ---------- | --------------------------------------------------- | ------------------------------------------------------- |
| 星屿插画   | `apps/user-miniapp/src/static/demo/star-island.jpg` | `apps/merchant-miniapp/src/static/demo/star-island.jpg` |
| 手办商品图 | `apps/user-miniapp/src/static/demo/star-fairy.jpg`  | `apps/merchant-miniapp/src/static/demo/star-fairy.jpg`  |

两张素材通过内置工具生成，未使用 API/CLI 图像生成。原图本地保留在忽略提交的 `.tools/imagegen/`；仓库消费压缩后的 JPEG。替换原图时运行 `npm run assets:demo`，需要先在该目录准备 `hero.png` 与 `figurine.png`。

### 插画生成提示词

> Use case: illustration-story. Asset type: wide hero artwork for an anime merchandise miniapp, landscape 2:1. Original beautiful anime illustration of an adult lavender-haired star traveler wearing a modest elegant lilac dress with a small fluffy white cat, on a magical floating island amid pastel purple sky, stars, ribbons, crescent moons and pale blossoms. Character and cat on RIGHT HALF. LEFT HALF is softly detailed low-contrast lavender sky with ample negative space for app text overlaid in code. Palette lavender, periwinkle, pearl white, small peach accents. Professional detailed key visual, luminous gentle light. Full bleed, no UI, no frame, NO lettering, text, watermark or logos. Provide the saved local image file path.

### 手办生成提示词

> Use case: product-mockup. Asset type: square merchandise product photograph for an anime collectibles shopping app. A beautifully crafted original chibi fantasy figurine of an adult pink-haired star fairy, pastel pink and ivory layered modest dress with tiny star charms, long twin tails, a delicate star wand, standing on a translucent lavender crescent-shaped display base. Premium painted resin collectible with glossy eyes, fine sculpted hair and pearlescent trim. Product centered, entire figurine visible. Soft lilac studio backdrop with subtle blurred flowers and soft light, boutique anime collectible product photography, exceptional fine detail, charming and tasteful. NO text, logos, watermark, packaging or UI. Provide the saved local image file path.

## 验证范围

本批次本地验证结果：TypeScript 检查通过，用户端和商家端的微信小程序及 H5 构建通过，7 项服务集成测试与 20 项 Playwright 浏览器用例均通过（订单详情、库存专项与原有流程分组验证）。预览合图位于 `.tools/previews/visual-samples.png`，单页截图与完整长截图位于同一目录。

订单详情专项覆盖已完成订单点击后进入独立交易记录页、商品和店铺变更后的原始信息保留、收货地址快照、刷新返回、发货与确认收货，以及不存在或被重置的订单。已完成订单通过商品区域进入当前商品购买页，返回后保留原订单状态和金额；收藏卡片仍进入商品详情。浏览器回归覆盖：收藏恢复、礼盒价格和数量、购物车结算、立即购买保留购物车、搜索空结果、无效商品、发货校验、商品编辑持久化，以及两个同时打开的应用完成发布、虚构收货信息编辑、支付、发货、收货全流程，确认规格弹层、支付确认与商家收货信息一致。另覆盖支付响应丢失后刷新重试、断线恢复，以及确认支付时商品改价。库存专项另覆盖 1 件库存的商品跳转、减库存后的数量收紧、售罄及补货、跨规格超量购物车，以及最后一件支付响应丢失后的结果确认。服务集成测试覆盖库存并发、购物车整体校验、重复请求、重启持久化和重置场景。三个样板检查 375/390/430px 宽度，截图保存到 `.tools/previews/`。

2026-10-31 已将两端导入 Windows 微信开发者工具 2.02.2609240，使用工具提供的测试号完成模拟器首页显示检查，并完成一笔原生模拟器中的实际联动操作：用户模拟支付、商家填写虚构物流单号发货、用户查看物流并确认收货，两端显示同一订单已完成。导入时发现 WXSS 编译器不接受减少动效规则中的通配选择器，已将该规则限定为 H5 使用，微信原生样式编译检查通过。模拟器截图保存为 `.tools/previews/user-wechat.png`、`product-wechat.png` 和 `merchant-wechat.png`；本次联动验收截图为 `.tools/previews/user-linked-wechat.png` 与 `.tools/previews/merchant-linked-wechat.png`。

库存修复已在微信模拟器复核：使用本机库存为 1 的测试商品，商品页显示低库存预警，数量加号不可继续增加；检查过程未提交订单，保留原有测试数据。截图为 `.tools/previews/stock-warning-wechat.png`。

用户订单详情已在微信模拟器复核：点击现有已完成订单后进入 `pages/order/detail`，状态、订单编号和实付金额对应原订单；H5 完整截图位于 `.tools/previews/order-detail-completed.png`。

微信小程序与 H5 均需构建通过。尚未完成 iOS/Android 真机验收；完整交易交互、不同设备的安全区和设备行为仍需继续复核。浏览器检查仅代表 H5 验证范围。
