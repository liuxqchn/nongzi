# 商品目录站 · 复刻与运维手册

> 这份文档回答五件事：
> 1. 现在这套「农资商品目录」到底是怎么搭起来的（每一步做了什么、踩了什么坑）；
> 2. 换一个行业再搭一套（五金、建材、花木……）要动哪些地方；
> 3. 全部手动操作的话，飞书、Cloudflare、GitHub 上分别点什么、填什么；
> 4. 上线加固（数据边界 / 分享卡片 / 收录 / 监控备份）具体做了什么、怎么验（第 7 节）；
> 5. 为什么不选其它方案（Headless CMS / BaaS / 买成品）的具体对照（第 10 节）。
>
> 线上实例：<https://nongzi.pages.dev> ｜ 仓库：<https://github.com/liuxqchn/nongzi>

---

## 0. 一句话架构

**把飞书多维表格当后台，把 Cloudflare Pages 当前端托管，中间加一层同源代理藏住凭证。**

```text
供应商（手机/电脑）                    你的基础设施                       顾客
┌──────────────────┐        ┌──────────────────────────────┐      ┌──────────────┐
│ 飞书多维表格      │        │ Cloudflare Pages              │      │ 微信扫码      │
│  商品名称 / 分类  │◄──────►│  /api/products  代理读表       │─────►│ H5 页面       │
│  价格 / 用法      │  凭证   │  /api/media     代理图片       │      │ Android 壳    │
│  图片（附件，多张）│        │  /            静态 H5（Vite）  │      └──────────────┘
└──────────────────┘        └──────────────────────────────┘
        ▲                                  ▲
        │ 企业自建应用（App ID/Secret 只存 Cloudflare 环境变量）
        └──────── GitHub 仓库 ── push ──► 自动构建 ──┘
```

四个关键设计决策，后面所有步骤都是为了它们：

| 决策 | 为什么 |
| --- | --- |
| 不用数据库、不写后台管理页 | 供应商只要会编辑表格就能上新商品，手机飞书 App 也能改；改完刷新即生效，不用重新部署 |
| 必须有一层 Pages Function 代理 | 飞书开放平台**不返回 CORS 头**，浏览器直连会被预检挡掉；`app_secret` 也绝不能进前端产物 |
| 图片也走 `/api/media` 代理 | 飞书附件对象里的 `url` / `tmp_url` 需要 `Authorization` 头，`<img src>` 发不出去，直接放会裂图 |
| H5 + WebView 壳，不做原生 | 一套代码同时给扫码用户和 App 用户；APK 只是壳，改页面不用重新发版 |

---

## 1. 这次是怎么做的（时间线 + 每步验收）

按实际推进顺序排，**每一步都有可验证的产物**，复刻时照着走就不会乱。

### 第 1 步：静态 H5 骨架（半天）

- `web/`：Vite + Vue 3 + Tailwind；商品网格、分类标签、拼音模糊搜索、详情抽屉、一键拨号、微信内引导。
- 数据先读 `web/public/products.json`，读不到降级到 `web/src/data/mockProducts.js`。
- 验收：`npm run dev` 能搜到「杀虫」「chong」这类关键词；`npm run test:search` 通过。

> 这一步刻意不接任何外部服务。先把「师傅能不能用」跑通，再谈数据从哪来。

### 第 2 步：接飞书多维表格（1 天，坑最多）

- 建企业自建应用 → 拿 App ID / Secret → 开权限 → **发布版本**（不发布权限不生效）。
- 建多维表格，按 `商品名称 / 品牌 / 分类 / 规格 / 价格 / 图片 / 成分 / 适用作物 / 稀释倍数 / 用法用量 / 注意事项 / 联系电话` 建列。
- 写 `web/functions/api/[[path]].js`：agent 用 `app_id/app_secret` 换 `tenant_access_token`（实例内缓存到过期前 5 分钟），
  按 `page_size=500` 翻页拉全表，返回 `{ items }` 给前端。
- 验收：`curl https://站点/api/products | head` 返回 JSON 且 `items` 非空；页面顶部数据源显示「飞书多维表格」。

踩到的坑（复刻时必看）：

| 现象 | 真实原因 | 处理 |
| --- | --- | --- |
| 浏览器控制台 CORS 报错 | 飞书接口无 CORS 头 | 走同源 `/api/products`，不要在浏览器里直连 |
| 接口返回 `1254302` | 应用不是这张表的协作者 | 表格「...」→ 添加文档协作者 → 选应用 |
| 权限开了仍 403 | 只改了权限没「发布版本」 | 版本管理与发布 → 创建版本 → 发布 |
| 用个人账号打不开表、一直被要求「申请权限」 | 表是**用应用身份建的**（`POST /bitable/v1/apps`），所有者是机器人，没人能批准 | 改成组织内可编辑：`PATCH /open-apis/drive/v1/permissions/{app_token}/public?type=bitable` `{"link_share_entity":"tenant_editable"}`；想真正拥有就「创建副本」后换 token |

### 第 3 步：图片打通（半天，技术要求最高）

- 表格「图片」列设成**附件**类型，一个格子可以放多张。
- 附件对象里的 `url` 需要鉴权 → 在代理里把它**改写成** `/api/media?file=<file_token>`，并删掉 `tmp_url`。
- `/api/media` 做三件事：
  1. 从记录里收集所有 `file_token` 做**白名单**（不能当任意文件下载器）；
  2. 用 `drive/v1/medias/{file_token}/download`，**必须带** `extra={"bitablePerm":{"tableId":"tbl…","rev":0}}`，否则 403；
  3. 返回字节 + `Cache-Control: public, max-age=31536000, immutable`（`file_token` 变了就是另一张图，所以能永久缓存），实例内存再兜一层。
- 前端 `<img loading="lazy" decoding="async">` + 失败回退到分类图标。
- 验收：`curl -I 'https://站点/api/media?file=xxx'` 返回 `200` 且 `content-type: image/*`；手机上滑到才加载。

### 第 4 步：多图 / 轮播（半天）

- 一个格子多张图 → 详情页左右滑轮播（圆点 + 页码 + 缩略图条），点开大图、支持左右切换和 Esc 关闭。
- 「效果图」「案例图」「实拍图」这类额外列会自动并入同一图集，「图片」列排最前。
- 卡片右下角显示张数角标。
- 验收：`screenshots/live-lightbox-check.png` 那种效果；第 3 张打开大图时停在第 3 张（不是回到第 1 张）。

### 第 5 步：Android 壳 + CI（半天）

- `android/`：纯平台 API 的 WebView 壳，无三方依赖，`tel:` 交给系统拨号盘，返回键优先回退网页历史。
- `build-apk.yml`：push 到 `main` 自动编译 APK → 产出 artifact → **自动把 APK 提交回 `web/public/app-release.apk`**，
  触发 Cloudflare 重新构建，于是站点的「下载 App」按钮永远指向最新包。
- 验收：Actions 绿；`https://站点/app-release.apk` 能下载；手机装完能打开且是线上页面。

### 第 6 步：权限收口 + 移交准备（半天）

- 管理入口默认隐藏：`?manage=1` 或 3 秒内连点标题 5 下才出现（`web/src/composables/useAdmin.js`）。
- 表格分享改成「组织内拿到链接即可编辑」，供应商不用申请权限。
- 写清移交清单（见第 8 节）。

### 第 7 步：上线加固（半天，2026-10 补的）

前六步保证「能用」，这一步保证「敢给外人用」。四件事都属于「不出事时看不见、出事时很难查」的类型：数据边界、分享卡片、大图内存、监控与备份。

#### 7.1 内部列不外泄（数据边界）

**问题**：`/api/products` 原本把整行 `fields` 原样发给浏览器。表里哪天加一列「进货价」，顾客按 F12 就能看到。

**做法**：在 `web/functions/_lib/feishu.js` 里做服务端过滤 —— `publicItems()` 按列名黑名单丢字段，`collectMediaTokens()` 从白名单里同样剔除隐藏列的附件（否则图片还能通过 `file_token` 直接拿到）。默认黑名单按关键词匹配（成本/进价/进货/毛利/利润/采购/底价/内部/备注/经手人/供应商/返点）；设了 `FEISHU_HIDDEN_FIELDS` 就**完全按你列的来**，默认那套不再生效。

**验证**：`curl 站点/api/products` 搜不到成本类字段；隐藏列里的附件 `file_token` 请求 `/api/media` 返回 404。

#### 7.2 分享卡片与搜索收录

**问题**：纯 SPA 的商品内容只在 JS 跑完后才出现 —— 微信群抓不到标题和图，搜索引擎也读不到。

**做法**：

- `web/functions/p/[id].js`：`/p/<record_id>` 仍然返回那个 SPA，但**服务端**先把 `<!-- og:start -->…<!-- og:end -->` 整块换成商品专属的 `og:` 标签和 canonical，并在 `<!-- jsonld -->` 处注入 `Product` 结构化数据（含价格、品牌）；
- `web/functions/_lib/meta.js`：纯函数负责拼标签（列名同义词、HTML 转义、JSON-LD 转义），方便单测；
- `web/functions/sitemap.xml.js` + `robots.txt.js`：实时生成，商品增删不用重新部署；
- 前端：打开详情时 `history.replaceState` 把地址改成 `/p/<id>`，抽屉右上角 ↗ 一键复制；从分享链接进来时等商品列表加载完自动打开对应商品；
- 封面：`web/scripts/og-card.svg` 是 1200×630 版式源文件，重新生成命令见 7.5。

**验证**：把 `/p/<id>` 发微信有标题和实物图；`view-source` 能看到 og 标签；`/sitemap.xml` 条数 = 商品数 + 1。

#### 7.3 大图不撑爆 Worker 内存

**问题**：旧代码把每张图 `arrayBuffer()` 整张读进 Worker 内存（上限 128MB）再回传，手机原图 5～10MB 时并发很容易顶到上限。

**做法**：`/api/media` 改成按 `content-length` 分流 —— ≤ 2MB 的图读进内存（这样才进得了实例缓存和 Cache API），> 2MB 的直接 `upstream.body` 流式回传，只交给 `cache.put(clone)` 去落缓存。

**验证**：同一张图第二次请求应从 2s 级降到毫秒级；白名单外的 `file_token` 返回 404，带路径穿越的 `file` 参数返回 400。

#### 7.4 监控与备份

**问题**：线上挂了没人知道；表格被误删也没有退路。

**做法**：`scripts/health-check.py` 检查三件事 —— 接口有没有货且每条都有 `record_id`、表格第一张附件图能否真的取到字节（不是 401/404 的错误页）、`robots.txt`/`sitemap.xml` 是否正常；通过后写 `backups/YYYY-MM-DD.json` 并只保留 30 天。`.github/workflows/health.yml` 每天北京时间 09:15 跑它，失败就 Actions 变红 → GitHub 发邮件。

**验证**：

```bash
python3 scripts/health-check.py https://nongzi.pages.dev   # 本地随时可跑
```

#### 7.5 本地怎么改怎么测（重要）

`vite dev` 只跑前端，`/api/*`、`/p/<id>`、`/sitemap.xml` 都进不去；推到 `main` 再等 Cloudflare 构建一分钟一轮，排错太慢。所以仓库里带了一个 Pages 模拟器：

```bash
cd web && npm run build
cd .. && FEISHU_APP_ID=… FEISHU_APP_SECRET=… FEISHU_APP_TOKEN=… FEISHU_TABLE_ID=tbl… \
  node scripts/pages-dev.mjs        # http://127.0.0.1:4411，跑的是 web/functions 里的真代码
```

它会把 Functions 模块直接 import 进来执行，行为跟线上一致（含 `env.ASSETS` 绑定、`waitUntil`、Cache API 缺失时的降级分支）。凭证只从环境变量读，不落盘。

单测（纯函数，不需要网络）：

```bash
cd web && npm test        # test:search + test:meta
```

重新生成分享封面（需要 `rsvg-convert` 和 macOS 自带的 `sips`）：

```bash
rsvg-convert -w 1200 -h 630 web/scripts/og-card.svg -o /tmp/og.png
sips -s format jpeg -s formatOptions 82 /tmp/og.png --out web/public/og-cover.jpg
```

#### 7.6 当时的实测记录

| 项目 | 结果 |
| --- | --- |
| `/api/products` | 200，12 条商品、每条 15 个字段，无成本类字段，图片地址已改写成 `/api/media?file=…`、`tmp_url` 已删 |
| `/p/<id>` | 200，`<title>吡虫啉 70% 水分散粒剂 · 农资商品目录</title>`，og:image 指向该商品首图，JSON-LD 里 name/price/brand 齐全 |
| 不存在的 id | 200 + 店铺默认卡片（不 404，SPA 会自动回目录） |
| `/sitemap.xml` | 13 条 URL（首页 + 12 个商品） |
| `/api/media` | 224KB PNG：首次 2.50s（回源飞书），第二次 2ms（命中实例内存） |
| 安全 | 白名单外 token → 404；`file=../../etc/passwd` → 400 |
| 单测 | `npm test` 全绿（meta 9/9） |
| 构建 | `npm run build` 成功，index.html 2.89 kB / gzip 1.36 kB |

#### 7.7 待办与遗留

- `web/public/app-release.apk` 只有 18KB 且不含签名文件，前端的「下载 App」按钮（>500KB 才显示）因此是隐藏的 —— 需要用 Actions 重新跑一次 Android 构建确认；
- 微信会缓存分享卡片的抓取结果，商品改名后卡片不会立刻变；
- 图片仍无服务端缩略图，靠上传前压缩（建议 500KB 以内）；真要一劳永逸得接图片处理服务。

---

## 2. 换一个行业要改什么

代码结构不用动，**改的是「语义」**。按影响面从大到小：

| 顺序 | 文件 | 改什么 | 举例（换到「五金建材」） |
| --- | --- | --- | --- |
| ① | `web/src/data/categories.js` | `CATEGORIES` 数组 + `ALIAS` 同义词表 | `['全部','电动工具','手动工具','紧固件','涂料','其他']`，`ALIAS` 加 `电动→电动工具`、`螺丝→紧固件` |
| ② | `web/src/utils/categoryTheme.js` | 每个分类的图标（lucide 组件）+ 配色 class | `Wrench` / `Hammer` / `PaintBucket`，配色从 leaf 绿换成 stone/slate |
| ③ | `web/src/services/productSource.js` | `DEFAULT_FIELD_MAP`：把表格列名同义词映射到内部字段 | `ingredients → ['材质','规格参数']`，`crops → ['适用场景']`，`dilution → ['包装']` |
| ④ | `web/src/components/ProductDrawer.vue` | 详情页那 5 行标签（有效成分 / 适用作物 / 稀释倍数 / 用法用量 / 注意事项）改成行业话术，图标也跟着换 | 「材质」「适用场景」「包装规格」「使用说明」「注意事项」 |
| ⑤ | `web/public/config.js` | `shop.name` / `subtitle` / `phone` | 「老王五金 · 扫码看货」 |
| ⑥ | `web/index.html` | `<title>`、`description`、`theme-color` | 主题色跟着换 |
| ⑦ | `web/src/data/mockProducts.js` + `web/public/products.json` | 3～8 条示例，用于没接表时的降级 | 换成该行业真实货品 |
| ⑧ | `android/app/src/main/res/values/strings.xml` | `app_name` | 「五金目录」 |
| ⑨ | `android/app/build.gradle` | `namespace` / `applicationId` / 默认 `webUrl` | `com.wangwu.catalog` / `https://wujin.pages.dev` |
| ⑩ | `android/app/src/main/res/drawable/ic_launcher_foreground.xml` | 图标矢量图 | 换成自己的 logo |
| ⑪ | `web/functions/_lib/meta.js` | `SHOP_NAME`：分享卡片/搜索引擎里显示的站点名；默认封面是 `web/public/og-cover.jpg` | 「老王五金」 |

配色集中在 `web/src/style.css` 的 `@theme`（`leaf-*` / `soil-*` 两套色阶），改一次全站跟着变。

**纯配置、不用改代码的部分**：表格里的列、列顺序、商品数量、图片张数、电话。这些以后都由供应商自己维护。

### 这套架构适合什么、不适合什么

| 适合 | 不适合 |
| --- | --- |
| 20～500 个 SKU，手机现场查货、查用法、打电话询价 | 需要下单、支付、库存扣减（要真后端和账号体系） |
| 一个门店/一个供应商维护一份目录 | 多商户入驻、每户一个后台（要租户隔离） |
| 图片 + 文字为主的展示型目录 | 全文检索、复杂筛选、千人千面推荐 |
| 想零服务器成本、零运维 | 需要审计日志、权限分级、数据不可公开 |

> 商品超过 ~2000 条时，前端全量拉取 + 本地筛选会开始变慢，那时应该把筛选搬到 Function 里分页查询。

---

## 3. 飞书侧手动操作（从零到能读表）

### 3.1 建应用

1. 打开 <https://open.feishu.cn/app>（国际版是 <https://open.larksuite.com/app>）→ **创建企业自建应用**，名字随意（例：`商品目录同步`）。
2. 「凭证与基础信息」里记下 **App ID**、**App Secret**（Secret 只显示一次，别贴进聊天/代码）。

### 3.2 开权限

「权限管理」里搜索并开通：

| 权限 | 用途 | 必需 |
| --- | --- | --- |
| 多维表格：查看（`bitable:app:readonly`） | 读记录、读字段 | ✅ |
| 云文档：查看/下载（`drive:drive:readonly`） | 下载「图片」列的附件 | ✅ 有图片就要 |
| 多维表格：编辑（`bitable:app`） | 用脚本改数据、传图 | 仅脚本维护时需要 |
| 记录/字段写权限 | 批量导入商品 | 仅脚本维护时需要 |

> 控制台里权限名称会随版本微调，按「多维表格」「云文档」两个分类勾选**只读**那一项即可；搜不到同名就以控制台实际文案为准，原则是「只给读，不给写」。

### 3.3 发布版本（最容易忘）

「版本管理与发布」→ 创建版本（版本号随便，如 `1.0.0`）→ 申请发布 → 管理员通过。
**权限只有发布后才生效**，改完权限不发布，接口照旧 403。

### 3.4 建多维表格

在飞书云文档里新建「多维表格」，按下表建列（列名可以微调，前端有同义词兜底，但**列名改了要同步改 `DEFAULT_FIELD_MAP`**）：

| 列名 | 字段类型 | 说明 |
| --- | --- | --- |
| 商品名称 | 文本 | 必填，卡片标题 |
| 品牌 | 文本 | 卡片副标题 |
| 分类 | 单选 | 选项要和 `categories.js` 里的标准分类一致 |
| 规格 | 文本 | 例：`10g/袋` |
| 价格 | 数字 | 留空显示「价格面议」 |
| 单位 | 文本 | 例：`袋`、`瓶` |
| **图片** | **附件** | 一个格子可放多张，顺序 = 轮播顺序 |
| 成分 | 文本 | 详情页第一行 |
| 适用作物 | 多选 / 文本 | 顿号或逗号分隔都认 |
| 稀释倍数 | 文本 | 例：`稀释 3000～5000 倍` |
| 用法用量 | 多行文本 | |
| 注意事项 | 多行文本 | |
| 联系电话 | 电话 / 文本 | 留空则用 `config.js` 里的店铺电话 |
| 库存 | 文本 | 例：`现货`、`少量` |

### 3.5 拿 `app_token` 和 `table_id`

打开表格，地址形如：

```text
https://xxx.feishu.cn/base/CYA9bQEXYajKegslTsgcCruKn7b?table=tbl0p5f2F3ygTuX3&view=vew...
                              └────── FEISHU_APP_TOKEN ──────┘        └─ FEISHU_TABLE_ID ─┘
```

### 3.6 把应用加成协作者（不做就 `1254302`）

表格右上角「···」→ **添加文档协作者** → 搜索应用名（可能要在「应用」标签里找）→ 给**可编辑**或**可阅读**。

### 3.7 让人能编辑（关键，别跳过）

如果表是**用应用身份建的**，所有者是机器人，个人账号点开会被要求「向 <表名> 申请权限」，而且没人能批准。两种解法：

- 改成组织内可编辑（推荐，一次就好）：

  ```bash
  PATCH https://open.feishu.cn/open-apis/drive/v1/permissions/{app_token}/public?type=bitable
  Authorization: Bearer <tenant_access_token>
  {"link_share_entity":"tenant_editable","external_access":false}
  ```

- 或者让拥有者「创建副本」，副本归个人所有，然后把 Cloudflare 的 `FEISHU_APP_TOKEN` / `FEISHU_TABLE_ID` 换成副本的，再把应用加为副本协作者。

### 3.8 图片上传规范

- 先把照片压到 **500KB 以内**（手机流量友好），长边 1600px 足够。
- 顺序建议：包装/本体 → 标签细节 → 使用效果 → 案例现场。
- 换图片 = 新的 `file_token`，旧缓存自动失效，不用手动清缓存。

---

## 4. Cloudflare 侧手动操作

### 4.1 新建 Pages 项目

两种方式，**推荐第一种**：

**A. 连 GitHub（push 即上线）**

1. 控制台 → Workers & Pages → 创建 → Pages → **连接到 Git** → 授权 GitHub（只勾选这一个仓库，权限最小化）。
2. 填构建配置：

   | 项 | 值 |
   | --- | --- |
   | 生产分支 | `main` |
   | 框架预设 | `None`（或 Vite） |
   | 根目录 | `web` |
   | 构建命令 | `npm run build` |
   | 构建输出目录 | `dist` |
   | 环境变量 | `NODE_VERSION = 22` |

3. 保存并部署，得到 `https://<项目名>.pages.dev`。

**B. 直接上传（没有仓库时）**

本地 `cd web && npm run build`，把 `web/dist` 整个拖进「直接上传」。缺点：每次改代码都要手动传，Functions 也要一起带上。

### 4.2 环境变量（一定要加密）

项目 → 设置 → **变量和密钥** → 生产环境（如需预览环境再复制一份）：

| 变量名 | 值 | 加密 |
| --- | --- | --- |
| `FEISHU_APP_ID` | 应用 App ID | 建议 |
| `FEISHU_APP_SECRET` | 应用 App Secret | **必须** |
| `FEISHU_APP_TOKEN` | 表格链接 `/base/` 后那段 | 建议 |
| `FEISHU_TABLE_ID` | 链接 `?table=` 后那段 | 否 |
| `FEISHU_DOMAIN` | 可选，Lark 国际版填 `https://open.larksuite.com` | 否 |
| `FEISHU_CACHE_TTL` | 可选，记录缓存秒数，默认 `30` | 否 |
| `FEISHU_REV` | 可选，附件下载 `extra.bitablePerm.rev`，一般留空（按 `0`） | 否 |
| `FEISHU_HIDDEN_FIELDS` | 可选，逗号分隔的不对外列名；**填了就完全按它来**，内置黑名单失效 | 否 |

> **改完变量必须重新部署一次**（Deployments → 最新那条 → Retry deployment，或推一个空提交），旧部署读不到新值。

### 4.3 Functions 怎么放

- 目录固定：`web/functions/api/[[path]].js` → 路由 `/api/*`；函数里再按 `products` / `media` 分发。
- 因为根目录设成了 `web`，Cloudflare 会自动找到 `web/functions`，不需要额外配置。
- 本地验证（可选，需要 wrangler）：

  ```bash
  cd web && npm run build
  npx wrangler pages dev dist --compatibility-date=2024-09-23 \
    --binding FEISHU_APP_ID=xxx --binding FEISHU_APP_SECRET=xxx \
    --binding FEISHU_APP_TOKEN=xxx --binding FEISHU_TABLE_ID=tblxxx
  ```

### 4.4 缓存策略（已内置，改代码时别破坏）

| 路由 | 头 | 原因 |
| --- | --- | --- |
| `/api/products` | `Cache-Control: no-store` | 表格改了要尽快看到（30 秒实例缓存 + `?fresh=1` 强刷） |
| `/api/media?file=` | `public, max-age=31536000, immutable` | `file_token` 是内容寻址的，换图即换 token |

### 4.5 自定义域名

项目 → 自定义域 → 添加（如 `huo.wangwu.com`）→ 按提示在域名商加 CNAME → 等证书签发（通常几分钟）。
换域名后记得同步：`android/app/build.gradle` 的默认 `webUrl` 或仓库变量 `WEB_URL`，再跑一次 APK 构建。

### 4.6 免费额度大致够用

Pages 免费版：每月约 500 次构建、无限静态请求；Functions 每天约 10 万次请求。图片走边缘缓存后，实际打到飞书的请求远小于访问量。
（具体数字以 Cloudflare 官网当前策略为准。）

---

## 5. GitHub 侧手动操作

### 5.1 建仓库并推送

```bash
git init
git add .
git commit -m "feat: init catalog"
git branch -M main
git remote add origin git@github.com:<账号>/<仓库>.git
git push -u origin main
```

### 5.2 Actions 权限（不设会失败）

仓库 → Settings → Actions → General → **Workflow permissions** 选 **Read and write permissions**。
`build-apk.yml` 里 `publish-apk` 这个 job 需要往仓库提交新 APK，没这个权限会 403。

### 5.3 仓库变量（Variables，不是 Secrets）

Settings → Secrets and variables → Actions → **Variables**：

| 名称 | 值 | 作用 |
| --- | --- | --- |
| `WEB_URL` | `https://你的域名` | APK 里写死的加载地址 |
| `USE_CN_MIRROR` | `1` | 国内构建慢时走阿里云 Gradle 镜像 |

也可以不设，在 Actions 里手动 Run workflow 时填 `webUrl`。

### 5.4 正式签名（想长期给同一批用户升级才需要）

当前配置：仓库里没有 `android/keystore.properties` 时，CI 用 **debug 签名**产出 APK。能装、能用，但**换一台机器构建出来的签名不同，覆盖安装会失败**（要先卸载）。

要固定签名：

1. 本地生成：`keytool -genkey -v -keystore release.jks -alias app -keyalg RSA -keysize 2048 -validity 10000`
2. 把 `release.jks` 转 base64，存成仓库 Secret `KEYSTORE_BASE64`；密码存 `KEYSTORE_PASSWORD` / `KEY_ALIAS` / `KEY_PASSWORD`。
3. 在 `build-apk.yml` 的构建前加一步还原 `android/keystore.properties` 和 `.jks`。

（这一步会改 workflow，属于可选增强；`.jks` 和 `keystore.properties` 已在 `.gitignore` 里，别提交。）

### 5.5 GitHub Pages 备用站

Settings → Pages → Source 选 **GitHub Actions**。`deploy-pages.yml` 会自动发布到 `https://<账号>.github.io/<仓库>/`。
注意它挂在子路径下，workflow 已通过 `VITE_BASE_PATH=/<仓库名>/` 处理；**自建站如果也部署到子路径，要自己加这个变量**，否则白屏（资源 404）。

### 5.6 发布一个 Release（可选）

给供应商一个固定下载地址：Releases → Draft a new release → 附上 `app-release.apk`。
比 `/app-release.apk` 这种「每次覆盖」的地址更适合长期分发。

---

## 6. 新项目 30 分钟清单

按顺序打勾，顺序不能乱（后面的依赖前面的）：

- [ ] **飞书**：建企业自建应用 → 记 App ID/Secret
- [ ] **飞书**：开 `bitable:app:readonly` + `drive:drive:readonly` → **发布版本**
- [ ] **飞书**：建多维表格（照 3.4 的列）→ 填 3～5 条真实商品 → 传图
- [ ] **飞书**：把应用加为文档协作者 → 设「组织内可编辑」→ 记 `app_token` / `table_id`
- [ ] **GitHub**：建空仓库 → 本地改品牌/分类/字段 → push
- [ ] **GitHub**：Settings → Actions → Read and write；Variables 加 `WEB_URL`
- [ ] **Cloudflare**：Pages → 连接 Git → 根目录 `web` / `npm run build` / `dist` / `NODE_VERSION=22`
- [ ] **Cloudflare**：加 4 个加密变量 → 重新部署
- [ ] **验收**：`curl https://站点/api/products` 有 `items`；页面显示「飞书多维表格」
- [ ] **验收**：卡片有图、详情页轮播能滑、点开大图正常
- [ ] **Android**：改 `applicationId` / `app_name` / 图标 / 默认 `webUrl` → push
- [ ] **Android**：下载 Actions 里的 APK 装机验证
- [ ] **加固**：`curl 站点/api/products` 确认没有成本类字段；打开 `/p/<id>` 看 `view-source` 里的 og 标签
- [ ] **监控**：Actions → Daily health check → Run workflow 跑一次；确认 `backups/` 里有当天快照
- [ ] **收尾**：`?manage=1` 确认管理入口能开能关；生成二维码贴到店里

---

## 7. 排错对照表

| 现象 | 先查这里 | 处理 |
| --- | --- | --- |
| 页面顶部显示「内置示例数据」 | 浏览器 Network 看 `/api/products` | 503 是变量没配全（返回体会写明缺哪个）；502 是飞书侧报错，看 `msg` |
| `1254302` | 应用不在表格协作者里 | 表格「...」→ 添加文档协作者 → 选应用 |
| `99991663` / token 相关错误 | App ID 与 Secret 是否配对、是否是国际版 | 国际版要设 `FEISHU_DOMAIN=https://open.larksuite.com` |
| 接口一直 403 | 权限没发布 | 版本管理与发布 → 新建版本 → 发布 |
| 图片全裂 | `/api/media` 返回什么 | 403/404 检查 `FEISHU_REV`、`tableId`；502 看返回里的 `detail` |
| 图片能开但很慢 | 是否原图直传 | 上传前压到 500KB 内 |
| 表格改了线上没变 | 30 秒实例缓存 | 点「重新加载商品」（带 `?fresh=1`）或等半分钟 |
| 部署成功但页面 404 | 输出目录填错 | 根目录 `web` + 输出 `dist`，不能填 `web/dist` |
| 构建报 Node/rollup 错 | 构建镜像 Node 版本浮动 | 环境变量 `NODE_VERSION=22` |
| GitHub Pages 白屏 | 资源路径 | 确认 `VITE_BASE_PATH=/<仓库名>/` |
| APK 里还是旧地址 | 构建时没有 `WEB_URL` | 设仓库变量或 Run workflow 填 `webUrl` 后重跑 |
| APK 覆盖安装失败 | 签名不一致 | 固定签名（5.4），或先卸载旧版 |
| 表格打不开、被要求申请权限 | 表所有者是机器人 | 看 3.7 |
| 担心「成本价」被顾客看到 | 列名是否命中黑名单 | 默认已挡；用 `curl 站点/api/products` 自查，或 `FEISHU_HIDDEN_FIELDS` 精确指定 |
| 链接发微信只有一行网址 | 是否用的是 `/p/<id>` 链接 | 打开商品详情后从地址栏复制，或点抽屉右上角 ↗；首页链接只有默认封面 |
| 分享卡片还是旧商品名 | 卡片由服务端抓取并缓存 | 微信有 CDN 缓存，改名后等一会儿或换个查询参数 |
| 微信里点电话没反应 | 微信拦截 `tel:` | 已内置：自动复制号码 + 引导「在浏览器打开」 |

---

## 8. 移交与日常运维

### 三种移交方案

| 方案 | 要动什么 | 供应商干什么 | 适用 |
| --- | --- | --- | --- |
| A 只给表格 | 零改动，把表格链接发给他（同组织可编辑） | 在你的表里改商品 | 数据留在你名下 |
| B 表格 + 应用归他 | Cloudflare 换 `FEISHU_APP_ID/SECRET/APP_TOKEN/TABLE_ID` → 重新部署 | 在自己的飞书里改 | 真正的数据移交 |
| C 全量移交 | 再加 GitHub 仓库转移、Cloudflare 项目转移、签名密钥 | 全自己管 | 彻底脱手 |

**推荐 B**：他拿到的是「一份自己的表格 + 一个只读应用」，网站仍然由你维护，代码一行不用改。

### 分工

- **供应商**：加商品、改价、换图、改用法、填电话。不需要懂任何技术。
- **你**：域名、Cloudflare、GitHub、APK、密钥轮换、表格结构变更。

### 移交时容易踩的坑

1. App Secret 只放 Cloudflare 加密变量，不进代码、不进文档、不进聊天记录。
2. 表头文字别改；要改就同步改 `web/src/services/productSource.js` 的 `DEFAULT_FIELD_MAP`。列顺序、增删非必需列都不影响。
3. 换权限 / 换应用后，**发布版本 + 重新部署**两件事都要做。
4. 表必须有应用这个协作者，否则 `1254302`。
5. 供应商用 Lark 国际版，`FEISHU_DOMAIN` 要改成 `https://open.larksuite.com`。
6. 轮换 Secret 时先加新版本再删旧版本，别让线上中断。

---

## 9. 如果要做「第二套、第三套」

三条演进路径，按投入从小到大：

1. **模板化配置**：把品牌/分类/字段/配色全挪进 `config.js` 或 `brand.json`，一套代码建多个 Pages 项目，只换构建时的环境变量。适合同一个人维护多个行业的目录。
2. **一张表多站点**：同一张多维表格加「站点」列，每个站点用不同视图过滤，Function 读视图而不是整表。适合一个供应商开多家分店。
3. **多租户**：Function 按请求的 `Host` 去查租户配置（D1 里存租户 → app_token/table_id），一个 Worker 服务 N 个站点。适合做成产品对外卖。

现在这套代码已经把这些位置留好了：数据源读的是 `config.js` + 环境变量，展示层全靠 `categories.js` / `categoryTheme.js` / `DEFAULT_FIELD_MAP` 三个字典，改字典不改组件。

---

## 10. 为什么不换别的方案（选型对照）

每次想「换个更专业的做法」之前，先看这张表：

| 方案 | 谁维护数据 | 成本 | 得到 | 失去 |
| --- | --- | --- | --- | --- |
| **现状（飞书表 + Cloudflare Pages）** | 供应商改表格 | 0 | 已验证可用，手机就能改 | 不能交易；前端全量筛选 |
| **现状 + 第 7 步加固** ← 这本手册的做法 | 同上 | 0（半天） | 数据边界、分享卡片、收录、监控、备份 | 仍不能交易 |
| 换 Headless CMS（Sanity / Directus / Strapi） | 供应商学新后台 | 中（月费 + 账号） | 强类型字段、草稿审核、图片自动变体 | 「打开表格就能改」这个优势很难被超越；多一套账号和账单 |
| 加 BaaS（Supabase 等）自建后台 | 自建后台 | 中高（开发量） | 订单、库存、会员 | 维护面从 1 个变 3 个 |
| 买成品（有赞 / 微店 / Shopify） | 平台后台 | 年费 + 抽成 | 支付、客服、营销全套 | 模板同质、定制难、数据不在自己手里 |

**判断标准**：

- 只要目标是「展示 + 询价」，现状就是性价比最高的形态，换 CMS 只是把「表格」换成「更像后台的表格」，编辑体验不会更好；
- 真正需要换方案的信号只有一个 —— **要交易**（下单、支付、库存扣减），那时才轮到 Supabase / 有赞，而且应该重做后端，而不是在 Pages Function 上堆；
- 商品超过 ~2000 条时，前端全量拉取 + 本地筛选会开始变慢，那时要把筛选搬到 Function（分页查询），这是重构、不是换平台。

**两个与技术无关但决定生死的前提**（中国大陆落地）：

1. `*.pages.dev` 在国内访问不稳定，正式上线得挂**已备案的自定义域名**；
2. 微信分享卡片要好看、要支付、要做小程序，都需要**已认证的主体**（个体户或公司）。
