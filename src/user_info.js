// user_info.js: 注入到你的服务器网页，读 cookie 中的 token 存入 chrome.storage
// 在 manifest.json 的 content_scripts 里配置 matches 为你的服务器域名

(function () {
    // 在网页上埋标记，表示插件已安装
    const marker = document.createElement('div');
    marker.id = 'is_install_crawai_ext';
    marker.style.display = 'none';
    document.body && document.body.appendChild(marker);

    function parseCookies(cookieStr) {
        if (!cookieStr) return {};
        const result = {};
        cookieStr.split(';').forEach((part) => {
            const [key, ...val] = part.trim().split('=');
            if (key) result[key.trim()] = val.join('=');
        });
        return result;
    }

    async function syncToken() {
        try {
            const cookies = parseCookies(document.cookie);
            const token = cookies['token'];
            if (token) {
                chrome.storage.local.get(['token'], (res) => {
                    if (res.token !== token) {
                        chrome.storage.local.set({ token });
                    }
                });
            }
            // 2 秒后再次同步
            setTimeout(syncToken, 2000);
        } catch (e) {
            setTimeout(syncToken, 2000);
        }
    }

    // 延迟 1s 开始，等页面 cookie 设置完毕
    setTimeout(syncToken, 1000);
})();
