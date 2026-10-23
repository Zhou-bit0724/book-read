# 轻小说文库 · 网页版

面向 iPhone Safari 的非官方轻小说阅读器。Node 服务只负责代理官网数据，前端是无需构建的原生 JavaScript PWA。无需注册或登录，打开即可浏览；可以把书籍、章节和插图下载到手机，断网后从主屏幕启动，继续读取本地数据。

## 功能

- 首页：热门、更新、新书与年度精选
- 书籍详情：封面、简介、卷章目录、加入书架
- 阅读器：目录跳转、上下章、阅读进度、沉浸模式、图片查看
- 阅读设置：纸张 / 泛黄 / 夜间 / 黑色主题，宋体 / 黑体 / 楷体，字号与行距
- 书架：网格 / 列表视图、继续阅读、移出书架
- 离线下载：整本下载章节与插图，断网后从本地缓存阅读
- 本地书库：导入自己合法拥有的 TXT / Markdown / EPUB / PDF，支持分章、封面和下载到手机
- 公共领域资源目录：列出 Gutenberg、青空文库、维基文库、DOAB 等合法来源
- 离线书架：查看占用空间、删除单本下载
- 本地搜索：只搜索已经下载到这台设备的书籍
- 本地阅读统计、深浅外观、iOS 安全区适配
- PWA 图标、Manifest、Service Worker 离线应用外壳
- 本地 HTTP/HTTPS 双端口、Windows 登录自启

## 环境要求

- Node.js 20 或更高版本
- 能访问 `https://www.wenku8.net` 的网络
- 手机与运行服务的电脑处于同一局域网
- OpenSSL（仅生成局域网 HTTPS 证书时需要）

## 快速开始

```bash
npm install
npm start
```

默认监听 HTTP `0.0.0.0:8787`；如果存在 `certs/server.crt` 与 `certs/server.key`，会同时监听 HTTPS `0.0.0.0:8443`。启动后终端会打印本机和手机地址：

```text
本机: http://localhost:8787
手机: http://192.168.x.x:8787
HTTPS 本机: https://localhost:8443
HTTPS 手机: https://192.168.x.x:8443
```

开发时可使用：

```bash
npm run dev
```

自定义端口或监听地址：

```powershell
$env:PORT=9000
$env:HOST="0.0.0.0"
npm start
```

## 本地 HTTPS

HTTP 适合快速调试；iPhone 上要注册 Service Worker、下载书籍和离线启动，必须使用 HTTPS。项目内置 HTTPS 监听，不依赖反向代理。

首次使用或局域网 IP 变化后，生成证书：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\make-cert.ps1 -Ip 10.15.31.70
```

`-Ip` 省略时会自动选择一个局域网 IPv4 地址。脚本会生成：

- `certs/ca.key`、`certs/ca.crt`：本地 CA，私钥不要外传
- `certs/server.key`、`certs/server.crt`：服务端证书，SAN 包含 `localhost`、`wenku8.local`、`127.0.0.1` 和指定 IP
- `public/wk8-root-ca.cer`：供 iPhone 下载安装的 CA 证书

已有 `certs/ca.crt` 和 `certs/ca.key` 时会复用 CA，只重新签发服务端证书；因此 IP 变化后重新运行脚本不会让已信任的 iPhone 失效。修改证书后需要重启 Node 服务。

Windows 本机信任（可选；不信任时浏览器会显示证书警告）：

1. 双击 `certs\ca.crt`，选择“安装证书”。
2. 选择“当前用户” → “将所有证书放入下列存储” → “受信任的根证书颁发机构”。
3. 确认安全警告，完成后重启浏览器。

iPhone 安装 CA：

1. 先通过 HTTP 打开 `http://<电脑局域网 IP>:8787/wk8-root-ca.cer`，允许下载描述文件。
2. 打开“设置” → “通用” → “VPN 与设备管理”，安装 `Wenku8 Local CA`。
3. 打开“设置” → “通用” → “关于本机” → “证书信任设置”，为 `Wenku8 Local CA` 打开完全信任。
4. 用 Safari 打开 `https://<电脑局域网 IP>:8443`，确认地址栏无证书警告后再添加到主屏幕。

注意：

- 未安装并信任 CA 时，Safari 会提示证书不受信任；不要通过忽略警告的方式长期使用。
- 如果删除了 `certs/ca.crt` 或 `certs/ca.key` 导致 CA 重新生成，iPhone 需要重新安装并信任新 CA。
- 不要把 `certs/` 或服务端口暴露到公网；该项目没有内置访问密码或多用户隔离。

## 在 iPhone 上使用

1. 确认 iPhone 与电脑连接同一 Wi-Fi。
2. 推荐先按上一节安装 CA，然后在 Safari 打开 `https://<电脑局域网 IP>:8443`；仅在线使用也可以打开 `http://<电脑局域网 IP>:8787`。
3. 点击分享按钮，选择“添加到主屏幕”。
4. 从主屏幕启动后，在书籍详情页点“下载到手机”，等待章节和插图下载完成。

下载内容保存在浏览器的 Cache Storage 中，不会出现在“照片”或“文件”应用里。断网后从主屏幕打开应用，首页会进入离线模式，显示已下载书籍；阅读器会优先使用本地章节和插图。

注意：

- 局域网 HTTP 不属于安全上下文，Service Worker 不会注册，因此不能离线下载；HTTPS 下才有完整能力。
- 首次启动 Windows 防火墙可能询问是否允许 Node.js 访问网络，请仅勾选专用网络，并允许 8787/8443。
- iOS 可能在存储空间紧张时清理网站数据；重要内容请保留足够空间，并避免清除 Safari 网站数据。
- 不要在公网直接暴露本服务。

## 离线下载说明

- 下载入口在书籍详情页。下载按整本进行，包含书籍信息、全部章节和章节中的插图。
- 下载过程中会显示章节/插图进度；单张插图失败不会中断整本下载，完成后会提示失败数量。
- 图床较慢时插图可能需要数十秒，下载会等待并重试；网络不佳时建议在 Wi-Fi 下操作。
- 下载书籍使用独立的 `wk8-offline-book-<id>` 缓存，不受普通浏览缓存 160 条上限影响。
- 下载成功后才写入 `localStorage['wk8.downloads.v1']`；如果章节下载失败，会删除该书未完成的缓存。
- 删除下载可在“离线书架”或书籍详情页操作；书架收藏、阅读进度和搜索历史不会被删除。
- 本地搜索覆盖官网已下载书籍与已下载本地书的书名、作者和分类。

## 本地书库

把文件放进项目根目录的 `library/`，在「本地」页点击刷新即可导入。子目录会递归扫描。

支持：

- `.txt`（自动识别 UTF-8 / UTF-16 / GB18030）
- `.md` / `.markdown`（支持 `# 标题` 分章）
- `.epub`（读取 OPF 书脊、目录标题和封面）
- `.pdf`（只在系统 PDF 查看器中打开，不进入网页离线缓存）

TXT/Markdown 会按「第一章」「Chapter 1」等标题分章；没有标题时按长度分段。文件名可用 `书名 - 作者.txt` 的格式，导入后会用作书名和作者。

本地文件只在本机使用：

- `library/` 已被 `.gitignore` 忽略，不会提交到仓库。
- 服务端不会把文件上传到公网；网页只在同源请求中读取。
- 手机端仍需在书籍详情页点击「下载到手机」，才能断网阅读。
- 只放你合法拥有的文件，或公共领域/开放许可内容。不要导入或分发盗版小说、漫画、扫描书。

`resources/catalog.json` 列出了可合法获取内容的来源与许可提示；`resources/samples/` 提供了一个公共领域示例。示例会出现在本地书库的「公共领域示例」分类中。

```bash
npm run library
```

该命令会扫描并打印导入结果，适合在启动前检查文件错误。

## Windows 自启

项目提供 `scripts/start.js` 和 `scripts/start-hidden.vbs`。启动脚本会先检查 `http://127.0.0.1:8787/api/health`，已在运行时不重复启动；否则以隐藏窗口启动 Node。

安装到当前用户登录自启：

```powershell
$startup = [Environment]::GetFolderPath('Startup')
Copy-Item scripts\start-hidden.vbs (Join-Path $startup 'Wenku8 Web Reader.vbs') -Force
```

手动测试：

```powershell
wscript scripts\start-hidden.vbs
```

日志和 PID 位于 `%LOCALAPPDATA%\Wenku8Web\server.log`、`%LOCALAPPDATA%\Wenku8Web\server.pid`。取消自启只需删除启动文件夹中的 `Wenku8 Web Reader.vbs`：

```powershell
Remove-Item (Join-Path ([Environment]::GetFolderPath('Startup')) 'Wenku8 Web Reader.vbs')
```

VBS 中写入了当前机器的 Node 路径；如果更换 Node 安装位置，请同步修改 `scripts/start-hidden.vbs`。自启发生在用户登录 Windows 后，不是开机前。

## 无登录设计

本应用不调用文库登录接口，也不需要账号。服务端只转发公开页面、书籍、章节和图片请求；搜索、排行榜和分类等需要登录的接口已从界面和 API 中移除。

如果官网限制匿名访问或完全停止服务，本应用也无法获取新内容；已经下载到手机的书仍可离线阅读。

## API

所有接口均无需登录，同源访问。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/home` | 首页栏目与年度精选 |
| GET | `/api/sugoi?year=2026` | 年度精选 |
| GET | `/api/book/:id` | 书籍详情与目录 |
| GET | `/api/chapter/:bookId/:chapterId` | 章节正文 |
| GET | `/api/image?src=` | 官网图片代理，仅允许 wenku8.com / wenku8.net / 777743.xyz |
| GET | `/api/library` | 本地书库索引 |
| POST | `/api/library/refresh` | 重新扫描 `library/` 与 `resources/samples/` |
| GET | `/api/library/:id` | 本地书籍详情与目录 |
| GET | `/api/library/:id/chapter/:chapterId` | 本地章节正文 |
| GET | `/api/library/:id/cover` | 本地封面 |
| GET | `/api/library/:id/file` | 原始文件（支持 Range，主要用于 PDF） |

官网书籍的离线下载没有服务端接口；浏览器直接读取上述响应并写入本地 Cache Storage。本地书库下载同样由浏览器写入独立的 Cache Storage。

## 目录结构

```text
wenku8-web/
├─ server.js               HTTP/HTTPS 服务、API 与静态文件
├─ lib/
│  ├─ http.js              上游 HTTPS 请求、GBK 解码、Cookie
│  ├─ library.js           本地 TXT/Markdown/EPUB/PDF 扫描与解析
│  ├─ parse.js             官网 HTML 解析
│  └─ site.js              站点抓取、缓存与图片代理
├─ library/                自己的本地书籍（内容被 .gitignore 忽略）
├─ resources/
│  ├─ catalog.json         公共领域/开放获取来源与许可提示
│  └─ samples/             可提交的公共领域示例
├─ certs/                  本地 CA 与服务端证书（已被 .gitignore 忽略）
├─ scripts/
│  ├─ import-library.js    扫描本地书库并打印结果
│  ├─ start.js             健康检查 + 后台启动
│  └─ start-hidden.vbs     Windows 登录自启入口
├─ public/
│  ├─ index.html
│  ├─ styles.css
│  ├─ manifest.webmanifest
│  ├─ sw.js
│  ├─ wk8-root-ca.cer      iPhone 用 CA 证书
│  ├─ icons/
│  └─ js/
│     ├─ core.js           工具、存储、API、格式化
│     ├─ library.js        本地书库索引、下载和缓存读取
│     ├─ offline.js        离线下载、缓存读取、本地搜索
│     ├─ ui.js             通用组件、弹层、提示
│     ├─ pages.js          首页、本地书库、书架、搜索、书页等
│     ├─ reader.js         阅读器与阅读设置
│     └─ main.js           路由与事件绑定
├─ tools/                  证书/图标生成、冒烟测试
└─ package.json
```

## 缓存策略

- 服务端首页缓存 10 分钟，年度精选 24 小时，书籍 30 分钟，章节 12 小时。
- 官网冷请求可能耗时数十秒；同一条目再次访问会命中内存缓存。
- 前端静态资源使用 ETag 校验；Service Worker 用 `wk8-shell-v12` 缓存应用外壳。
- 普通访问过的首页、年度精选、官网书籍、章节和图片会写入 `wk8-content-v1`，最多保留 160 条；离线时优先读缓存，联网时后台更新。
- 本地书库接口不写入普通内容缓存，避免文件更新后读到旧章节；已下载副本单独存放。
- 已下载官网书籍使用独立的 `wk8-offline-book-<id>` 缓存，已下载本地书籍使用 `wk8-library-book-<id>`；Service Worker 会优先匹配这些缓存，并在升级时保留它们。
- 修改前端静态资源后，请同步修改 `public/sw.js` 的 `CACHE`；如果接口结构变化，同时修改 `CONTENT_CACHE` 版本。

## 常见问题

**首页一直加载或报“官网暂时无法获取”**

官网响应慢、限流或临时不可用。查看服务端日志，稍后重试；成功抓取一次后会进入缓存。

**书籍页没有“下载到手机”或提示需要刷新**

离线下载需要 HTTPS 和已激活的 Service Worker。确认用 `https://<IP>:8443` 打开，并在页面加载后刷新一次再试。

**下载完成但断网打不开**

确认是从主屏幕或同一个 HTTPS 地址打开，不要改用 HTTP；也确认没有清除 Safari 网站数据。iOS 可能在空间不足时清理缓存。

**手机打不开 `http://<IP>:8787` 或 `https://<IP>:8443`**

确认同一 Wi-Fi、IP 未变化、Node 仍在运行，并允许 Windows 防火墙的专用网络访问。HTTPS 还需要在手机上安装并信任 `wk8-root-ca.cer`。

**HTTPS 提示证书不受信任**

先在 Windows/iPhone 上安装并信任 `certs/ca.crt`；iPhone 还要在“证书信任设置”中开启完全信任。局域网 IP 变化后，用新 IP 重新运行 `tools\make-cert.ps1` 并重启服务。

**旧页面没有更新**

iOS 可能保留旧 Service Worker 缓存。关闭并从主屏幕删除应用后重新添加，或在 Safari 网站数据中清除该站点数据。修改前端资源后也应提升 `public/sw.js` 的 `CACHE` 版本。

**本地书库为空或文件没有导入**

确认文件位于项目根目录的 `library/` 下，扩展名为 `.txt`、`.md`、`.markdown`、`.epub` 或 `.pdf`，单文件不超过 80 MB。点击「本地」页右上角刷新，或运行 `npm run library` 查看具体错误。PDF 只会在系统查看器中打开，不提供网页分章阅读。

**本地书下载后断网打不开**

本地书也需要在详情页点击「下载到手机」。下载完成后，阅读器会从 `wk8-library-book-<id>` 缓存读取；如果只把文件放进 `library/` 而没有下载，手机断网后无法访问电脑上的源文件。

**插图加载慢或失败**

官网插图由第三方图床提供，可能出现限速或暂时不可用。阅读器会隐藏加载失败的图片，不影响文字阅读；下载时会跳过失败插图，删除该书下载后可重新尝试。

**Windows 自启没有生效**

检查 Startup 文件夹中是否有 `Wenku8 Web Reader.vbs`，以及 `%LOCALAPPDATA%\Wenku8Web\server.log` 是否有报错。VBS 中的 Node 路径必须有效；也可以运行 `wscript scripts\start-hidden.vbs` 手动测试。

## 免责声明

本项目为非官方个人学习项目，与轻小说文库及任何出版社、作者无关。服务端不存储小说正文，内容实时取自官网；下载内容仅保存在用户自己的设备上，用于个人离线阅读。版权归原作者、出版社与官网所有，请勿公开传播、抓取或用于商业用途。本地书库只处理用户自己提供或合法获取的文件，项目不附带受版权保护的书籍、漫画或扫描件。官网随时可能关闭或变更接口，本项目不保证持续可用，亦不提供任何担保。

## 开发提示

- 前端无打包步骤，直接修改 `public/` 下文件。
- 修改后至少执行：

```bash
node --check server.js
node --check lib/http.js
node --check lib/library.js
node --check lib/site.js
node --check public/sw.js
node --check public/js/core.js
node --check public/js/library.js
node --check public/js/offline.js
node --check public/js/ui.js
node --check public/js/pages.js
node --check public/js/reader.js
node --check public/js/main.js
node --check scripts/start.js
```

- 后端冒烟测试（会真实访问官网）：

```bash
node tools/smoke.js
```

- 重新生成图标需要 Python 3 与 Pillow：

```bash
python tools/make-icons.py
```
