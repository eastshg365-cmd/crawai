// Service Worker - 处理 sidepanel 开关和消息路由

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => { });

chrome.action.onClicked.addListener(async (tab) => {
    const win = await chrome.windows.getCurrent();
    chrome.sidePanel.open({ windowId: win.id });
});

// 消息中转：content script → background → 其他
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'OPEN_SIDE_PANEL') {
        chrome.windows.getCurrent().then((win) => {
            chrome.sidePanel.open({ windowId: win.id });
        });
        sendResponse({ ok: true });
    }
    return true;
});
