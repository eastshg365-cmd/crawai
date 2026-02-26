// 通用工具函数

export function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

export function formatDate(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// 解析 URL 参数
export function parseUrlParams(url) {
    try {
        const u = new URL(url);
        const params = {};
        for (const [k, v] of u.searchParams) params[k] = v;
        return params;
    } catch {
        return {};
    }
}

// 万/千 转数字（处理"1.2万"这种）
export function parseCount(str) {
    if (!str) return 0;
    str = String(str).replace(/,/g, '').trim();
    if (str.includes('万')) return Math.round(parseFloat(str) * 10000);
    if (str.includes('w') || str.includes('W')) return Math.round(parseFloat(str) * 10000);
    if (str.includes('k') || str.includes('K')) return Math.round(parseFloat(str) * 1000);
    return parseInt(str) || 0;
}

// 安全地从 DOM 中取文本
export function getText(el, selector, fallback = '') {
    if (!el) return fallback;
    const node = selector ? el.querySelector(selector) : el;
    return node ? node.textContent.trim() : fallback;
}

// 滚动到底部
export async function scrollToBottom(delay = 2000) {
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(delay);
}

// 复制文本到剪贴板
export function copyText(text) {
    navigator.clipboard.writeText(text).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    });
}

// 从 URL 提取笔记/视频 ID（小红书用）
export function extractNoteId(url) {
    if (!url) return '';
    const m = url.match(/\/(explore|discovery\/item)\/([^/?]+)/);
    return m ? m[2] : '';
}
