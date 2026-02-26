// user_info.js
// 1. 从网站 Cookie 读取 Supabase token 存入插件 storage
// 2. 监听网站发送的采集指令，转发给 background

(function () {
    // ===== 插件已安装标记 =====
    const marker = document.createElement('div');
    marker.id = 'crawai_ext_installed';
    marker.dataset.version = '1.1.0';
    marker.style.display = 'none';
    document.body && document.body.appendChild(marker);

    // 通知网站插件已就绪
    window.postMessage({ type: 'CRAWAI_READY', version: '1.1.0' }, '*');

    // ===== 从 Cookie 同步 token =====
    function parseCookies() {
        const result = {};
        document.cookie.split(';').forEach((part) => {
            const [k, ...v] = part.trim().split('=');
            if (k) result[k.trim()] = v.join('=');
        });
        return result;
    }

    function syncToken() {
        const cookies = parseCookies();
        // Supabase 的 access_token 通常以 sb-xxx-auth-token 存储，或直接 token
        const token =
            cookies['token'] ||
            cookies['sb-access-token'] ||
            Object.entries(cookies).find(([k]) => k.includes('auth-token'))?.[1];

        if (token) {
            chrome.storage.local.get(['token'], (res) => {
                if (res.token !== token) {
                    chrome.storage.local.set({ token });
                    window.postMessage({ type: 'CRAWAI_TOKEN_SYNCED' }, '*');
                }
            });
        }
        setTimeout(syncToken, 2000);
    }
    setTimeout(syncToken, 500);

    // ===== 监听来自网站的采集指令 =====
    window.addEventListener('message', (event) => {
        // 安全校验：只接受同页面消息
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || !msg.type || !msg.type.startsWith('CRAWAI_')) return;

        switch (msg.type) {
            // 网站发送采集任务
            case 'CRAWAI_TASK': {
                // msg.payload: { action, keyword, count, platform, taskId }
                chrome.runtime.sendMessage(
                    { type: 'EXECUTE_TASK', payload: msg.payload },
                    (response) => {
                        window.postMessage({ type: 'CRAWAI_TASK_ACK', taskId: msg.payload?.taskId, response }, '*');
                    }
                );
                break;
            }
            // 网站查询插件状态
            case 'CRAWAI_PING': {
                chrome.storage.local.get(['token'], (res) => {
                    window.postMessage({
                        type: 'CRAWAI_PONG',
                        hasToken: !!res.token,
                        version: '1.1.0',
                    }, '*');
                });
                break;
            }
            // 网站要求退出登录
            case 'CRAWAI_LOGOUT': {
                chrome.storage.local.remove(['token']);
                break;
            }
        }
    });
})();
