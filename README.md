# 采集助手 Chrome 插件

多平台数据采集 Chrome 扩展，支持小红书、抖音、B站、快手、YouTube、TikTok。

## 支持平台

| 平台 | 功能 |
|---|---|
| 🔴 小红书 | 搜索结果采集 / 账号主页采集 / 视频文案提取 / 视频下载 |
| 🎵 抖音 | 视频列表采集 / 账号主页采集 |
| 📺 B站 | 视频列表采集 |
| ⚡ 快手 | 视频列表采集 |
| ▶️ YouTube | 视频列表采集 |
| 🌐 TikTok | 视频列表采集 |

## 安装方法

1. 打开 Chrome 浏览器 → `chrome://extensions/`
2. 右上角开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本项目根目录 `crawai-extension/`

## 配置服务器

修改各平台脚本顶部的 `BASE_URL`：

```js
// src/platforms/xiaohongshu.js (及其他平台脚本)
const BASE_URL = 'http://localhost:3000/api';  // ← 改为你的服务器地址
```

同时修改 `manifest.json` 中 `user_info.js` 的 matches：
```json
"matches": ["https://your-domain.com/*"]
```

## 服务器端 API 接口

| 路径 | 方法 | 说明 |
|---|---|---|
| `/api/ai/func/:funcName` | POST | 权限验证 |
| `/api/ai/chrome_video/modify_add` | POST | 保存视频数据 |
| `/api/ai/chrome_author/modify_add` | POST | 保存账号数据 |

所有接口统一响应格式：
```json
{ "code": 1, "data": {}, "msg": "ok" }
```

认证：请求 Header 带 `token` 字段。

## Token 获取流程

1. 用户在你的服务器网站上登录
2. 服务器设置 Cookie `token=xxx`
3. 插件的 `user_info.js` 读取 Cookie，存入 `chrome.storage.local`
4. 采集时自动从 storage 取 token 带在请求 Header

## 使用方法

1. 先在服务器网站登录获取 token
2. 打开对应平台网页（如小红书搜索结果页）
3. 页面右侧会出现浮动采集面板
4. 点击对应功能按钮开始采集
5. 采集完成后展示数据表格，可导出 CSV
