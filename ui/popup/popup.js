// Popup 逻辑：检查登录状态，渲染登录/退出按钮

const SERVER_URL = 'https://truessence.cloud';

async function getToken() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['token'], (res) => resolve(res.token || null));
    });
}

function renderFooter(isLoggedIn) {
    const footer = document.getElementById('footer');
    if (isLoggedIn) {
        footer.innerHTML = `
      <div style="display:flex;align-items:center;padding:4px 0;font-size:12px;color:#22c55e;">
        <span class="status-dot online"></span> 已登录，可开始采集
      </div>
      <a class="btn btn-primary" href="${SERVER_URL}/web/" target="_blank">🏠 官网首页</a>
      <button class="btn btn-danger" id="logoutBtn">退出登录</button>
    `;
        document.getElementById('logoutBtn').addEventListener('click', () => {
            chrome.storage.local.remove(['token'], () => renderFooter(false));
        });
    } else {
        footer.innerHTML = `
      <div class="login-hint">
        <span class="status-dot offline"></span> 未登录，请前往官网登录
      </div>
      <a class="btn btn-primary" href="${SERVER_URL}/web/" target="_blank">🔐 去登录</a>
      <button class="btn btn-ghost" id="openSidePanel">打开侧边栏</button>
    `;
        document.getElementById('openSidePanel').addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
            window.close();
        });
    }
}

// 监听 storage 变化实时更新
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'token' in changes) {
        renderFooter(!!changes.token.newValue);
    }
});

// 初始化
getToken().then((token) => renderFooter(!!token));
