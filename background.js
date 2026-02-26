// background.js - Service Worker
// 负责：side panel 开关 + 接收网站指令 + 调度采集 Tab

// ===== Side Panel =====
chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => { });

chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id }).catch(() => { });
});

// ===== 消息处理 =====
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'OPEN_SIDE_PANEL') {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (tab) chrome.sidePanel.open({ tabId: tab.id }).catch(() => { });
        });
        return;
    }

    if (msg.type === 'EXECUTE_TASK') {
        handleTask(msg.payload, sendResponse);
        return true; // 异步响应
    }
});

// ===== 任务调度 =====
const PLATFORM_URLS = {
    xiaohongshu_search: (keyword) =>
        `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_explore_feed`,
    xiaohongshu_author: (authorId) =>
        `https://www.xiaohongshu.com/user/profile/${authorId}`,
    douyin_search: (keyword) =>
        `https://www.douyin.com/search/${encodeURIComponent(keyword)}`,
};

// 活跃任务 tabId → taskInfo
const activeTasks = new Map();

async function handleTask(payload, sendResponse) {
    const { action, keyword, count = 30, platform = 'xiaohongshu', taskId, authorId } = payload || {};

    let url;
    if (action === 'collect_search') {
        url = PLATFORM_URLS[`${platform}_search`]?.(keyword);
    } else if (action === 'collect_author') {
        url = PLATFORM_URLS[`${platform}_author`]?.(authorId || keyword);
    } else if (action === 'collect_keywords') {
        // 下拉词：在现有 tab 执行，发消息给 content script
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (tab) {
                chrome.tabs.sendMessage(tab.id, {
                    type: 'AUTO_COLLECT_KEYWORDS',
                    keyword,
                    taskId,
                });
            }
        });
        sendResponse({ ok: true, msg: '已发送下拉词采集指令' });
        return;
    }

    if (!url) {
        sendResponse({ ok: false, msg: '不支持的操作类型' });
        return;
    }

    // 创建采集 Tab（后台）
    const tab = await chrome.tabs.create({ url, active: false });

    activeTasks.set(tab.id, { taskId, action, keyword, count, platform });
    sendResponse({ ok: true, tabId: tab.id, msg: '已创建采集任务' });

    // 等 content script 加载后发送任务
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId !== tab.id || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(listener);

        const taskInfo = activeTasks.get(tabId);
        if (!taskInfo) return;

        setTimeout(() => {
            chrome.tabs.sendMessage(tabId, {
                type: 'AUTO_COLLECT',
                ...taskInfo,
            });
        }, 2000); // 等 content script 初始化
    });
}

// 监听 content script 上报任务完成
chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg.type === 'TASK_COMPLETE') {
        const taskInfo = activeTasks.get(sender.tab?.id);
        if (taskInfo) {
            activeTasks.delete(sender.tab.id);
            // 关闭采集 Tab（可选，留着也行）
            setTimeout(() => chrome.tabs.remove(sender.tab.id).catch(() => { }), 1500);
        }
    }
});
