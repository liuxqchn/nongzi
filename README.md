# 农资商品目录 · 静态 H5 + Android WebView 壳

面向农资商户的「扫码即用」商品目录：农户扫二维码就能查成分、看适用作物、查稀释倍数与用法用量，并**一键拨打老板电话**。

- **零服务器成本**：前端是纯静态站点，`npm run build` 出来的 `web/dist` 可以直接丢到 Cloudflare Pages / GitHub Pages / 任何静态托管。
- **一仓库两产物**：`web/` 是 H5，`android/` 是套壳 App，GitHub Actions 云端自动编译 APK。
- **数据可换**：默认读 `web/public/products.json`，也支持从飞书多维表格（Bitable）只读拉取，拉不到时自动降级到内置示例数据。

---

## 目录结构

```text
.
├── web/                        # 前端工程（Vite + Vue 3 + Tailwind CSS）
│   ├── public/                 # 静态资源：products.json、config.js、app-release.apk
│   ├── src/
│   │   ├── components/         # 网格 / 详情抽屉 / 搜索 / 分类 / 微信引导 / Toast
│   │   ├── composables/        # useCatalog（数据+筛选）、useWechat、useToast
│   │   ├── data/               # 分类字典、示例数据
│   │   ├── services/           # 数据源：products.json / 飞书 Bitable / Mock
│   │   └── utils/              # 拼音模糊搜索、拨号、分类配色
│   └── vite.config.js
├── android/                    # 极简 Android 壳（Gradle + Java WebView）
│   ├── app/src/main/AndroidManifest.xml
│   ├── app/src/main/java/com/nongzi/app/MainActivity.java
│   └── build.gradle
└── .github/workflows/
    ├── build-apk.yml           # 云端编译 APK + 打包 H5 产物
    └── deploy-pages.yml        # 可选：一键发布到 GitHub Pages
```

---

## 一、本地跑起来

```bash
cd web
npm install
npm run dev        # http://127.0.0.1:5173
```

生产构建与预览：

```bash
cd web
npm run build      # 产物在 web/dist
npm run preview    # 本地预览构建结果
```

搜索逻辑有独立校验脚本：

```bash
cd web
npm run test:search
```

## 二、数据怎么接

### 方式 A：本地 `products.json`（默认）

编辑 `web/public/products.json`，字段如下：

```json
[
  {
    "id": "p-001",
    "name": "吡虫啉 70% 水分散粒剂",
    "brand": "田园生化",
    "category": "杀虫剂",
    "spec": "10g/袋",
    "price": 3.5,
    "unit": "袋",
    "images": [],
    "ingredients": "吡虫啉 70%",
    "crops": ["水稻", "棉花", "蔬菜"],
    "dilution": "稀释 3000～5000 倍",
    "usage": "蚜虫、飞虱发生初期兑水均匀喷雾，每 7～10 天一次。",
    "precautions": "不可与强碱性农药混用，桑蚕期禁用。",
    "tags": ["内吸性", "低毒"],
    "stock": "现货",
    "phone": "13800138000"
  }
]
```

`category` 支持归一化：`杀虫/杀虫类/除虫 → 杀虫剂`，`杀菌/杀菌类/霜霉 → 杀菌剂`，`水溶肥料 → 水溶肥` 等。

### 方式 B：飞书多维表格（Bitable）

编辑 `web/public/config.js`（部署后也能直接改，改完刷新即生效，不用重新打包）：

```js
window.__NONGZI_CONFIG__ = {
  shop: { name: '农资商品目录', subtitle: '扫码看成分 · 查用法 · 一键问价', phone: '13800138000' },
  bitable: {
    enabled: true,
    appToken: 'bascnXXXX',   // 多维表格链接里 app_token= 后面那段
    tableId: 'tblXXXX',      // 表名后面 /tblXXXX 那段
    token: 'u-xxxx',         // user_access_token / tenant_access_token（只读）
  },
  source: 'auto',            // auto | bitable | local
}
```

表头名会按 `商品名称 / 品牌 / 分类 / 规格 / 价格 / 图片 / 成分 / 适用作物 / 稀释倍数 / 用法用量 / 注意事项 / 联系电话` 等同义名自动匹配。

> 注意：token 会暴露在浏览器里，只适合内部只读场景；正式对外建议由后端代理。

页面底部有「数据源」按钮，可以不改正文件直接在浏览器里临时切换数据源。

## 三、H5 里的一键拨号

- H5 侧点击「联系老板」→ `tel:` 链接（微信内置浏览器里会自动复制号码并提示用系统拨号盘）。
- Android 壳里 `WebViewClient.shouldOverrideUrlLoading` 拦截 `tel:`，用 `Intent.ACTION_DIAL` 调起系统拨号盘（用户确认后才真正拨出，不需要 `CALL_PHONE` 权限）。

## 四、Android 壳

```bash
cd android
./gradlew assembleRelease     # 产物：android/app/build/outputs/apk/release/app-release.apk
```

- 加载的线上地址默认是 `https://nongzi.pages.dev`，三种覆盖方式：
  1. `./gradlew assembleRelease -PwebUrl=https://你的域名`
  2. 环境变量 `WEB_URL=https://你的域名`
  3. 直接改 `android/app/build.gradle` 里的默认值
- 硬件返回键优先回退网页历史，栈空时才退出应用。
- 已开启 `INTERNET` 权限、`usesCleartextTraffic` 与 `networkSecurityConfig`，http 站点也能正常打开。
- 正式签名：复制 `android/keystore.properties.example` 为 `android/keystore.properties` 并填好密钥库信息；没有配置时 CI 退回 debug 签名，照样能装。

## 五、上线三步

### 1. 推送到 GitHub

```bash
git init
git add .
git commit -m "feat: init nongzi catalog & app"
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

### 2. 下载自动编译好的 APK

仓库 **Actions** 标签页里跑 `Build Android APK`：

| Artifact | 内容 |
| --- | --- |
| `nongzi-release-apk` | 编译好的 `.apk`，下载后直接安装 |
| `nongzi-web` | H5 静态站点（`web/dist`） |
| `nongzi-site` | H5 站点 + `app-release.apk`，可直接整包上传到静态托管 |

### 3. 部署 H5（两种零成本方式）

**A. Cloudflare Pages（拖拽上传，最快）**

Workers & Pages → Create → Pages → **Direct Upload**，把 `nongzi-site` 里的 `dist` 文件夹拖进去即可；之后每次跑完 Actions 重新上传就能更新。

**B. GitHub Pages（一次配置，自动更新）**

仓库 Settings → Pages → Source 选 **GitHub Actions**，`deploy-pages.yml` 会自动发布，地址是 `https://<用户名>.github.io/<仓库名>/`。

> 部署完把域名填回 `android/app/build.gradle`（或 CI 的 `webUrl` 参数），再跑一次 Actions 就能生成指向新地址的 APK。

### 4. 生成二维码

把线上地址丢进 [草料二维码](https://cli.im/)，打印张贴到门店；农户扫码即可看商品、看用法、打电话。

---

## 常见问题

**页面显示「内置示例数据」？**
说明 `products.json` 和飞书接口都没取到，页面顶部会有红色提示说明原因。

**微信里打开，拨号没反应？**
微信会拦截 `tel:`，此时 H5 会自动复制号码并提示到系统拨号盘粘贴；右上角的「在浏览器打开」引导层可以引导农户跳出微信。

**APK 装到手机上打不开页面？**
检查 `BuildConfig.WEB_URL` 是否可访问（明文 http 需要 `usesCleartextTraffic`，已默认开启）。

---

农药使用请以产品标签为准，严格遵守剂量与安全间隔期。
