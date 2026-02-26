// 小红书采集 Content Script
// 功能：搜索结果采集 / 账号主页采集 / 视频文案提取 / 视频下载

const BASE_URL = 'https://truessence.cloud/api';

// ===== 工具函数 =====
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const text = (el, sel, fb = '') => {
    const node = sel ? el?.querySelector(sel) : el;
    return node?.textContent?.trim() || fb;
};
const parseCount = (str) => {
    if (!str) return 0;
    str = String(str).replace(/,/g, '').trim();
    if (str.includes('万')) return Math.round(parseFloat(str) * 10000);
    return parseInt(str) || 0;
};

// ===== API =====
async function getToken() {
    return new Promise((r) => chrome.storage.local.get(['token'], (res) => r(res.token || '')));
}

async function apiPost(path, body) {
    const token = await getToken();
    if (!token) throw new Error('请先登录');
    const res = await fetch(BASE_URL + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token, lang: 'zh-cn' },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.code === 401) throw new Error('请先登录');
    if (data.code !== 1) throw new Error(data.msg || '请求失败');
    return data;
}

// ===== Toast =====
function toast(msg, type = 'info', duration = 3000) {
    let el = document.querySelector('.crawai-xhs-toast');
    if (!el) {
        el = document.createElement('div');
        el.className = 'crawai-toast crawai-xhs-toast';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = `crawai-toast crawai-xhs-toast ${type}`;
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => el.classList.remove('show'), duration);
}

// ===== 导出 CSV =====
function exportCSV(data, filename) {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const rows = data.map((r) => headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','));
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
}

// ===== 弹窗 =====
function showProgress(title) {
    const mask = document.createElement('div');
    mask.className = 'crawai-progress-mask';
    mask.innerHTML = `
    <div class="crawai-progress-box">
      <div class="crawai-progress-title">${title}</div>
      <div class="crawai-progress-msg">准备中...</div>
      <div class="crawai-progress-bar-wrap"><div class="crawai-progress-bar" style="width:0%"></div></div>
      <div class="crawai-progress-count">0 条</div>
      <button class="crawai-btn-cancel">取消</button>
    </div>
  `;
    mask.canceled = false;
    mask.querySelector('.crawai-btn-cancel').onclick = () => { mask.canceled = true; mask.remove(); };
    document.body.appendChild(mask);
    mask.update = (n, total, msg) => {
        const pct = total > 0 ? Math.min(100, Math.round((n / total) * 100)) : 0;
        mask.querySelector('.crawai-progress-bar').style.width = pct + '%';
        mask.querySelector('.crawai-progress-count').textContent = `${n} 条${total ? ' / ' + total : ''}`;
        if (msg) mask.querySelector('.crawai-progress-msg').textContent = msg;
    };
    return mask;
}

function showSettings({ title, fields }) {
    return new Promise((resolve, reject) => {
        const mask = document.createElement('div');
        mask.className = 'crawai-modal-mask';
        const formHtml = fields.map((f) => `
      <div class="crawai-form-item">
        <label>${f.label}</label>
        <input type="${f.type || 'number'}" id="xf_${f.key}" value="${f.default ?? ''}" placeholder="${f.placeholder || ''}" min="${f.min ?? ''}" max="${f.max ?? ''}"/>
        ${f.hint ? `<div class="crawai-form-hint">${f.hint}</div>` : ''}
      </div>
    `).join('');
        mask.innerHTML = `
      <div class="crawai-modal">
        <h3>${title}</h3>
        ${formHtml}
        <p class="crawai-form-hint">点击确定后将进行权限验证，验证成功后开始采集</p>
        <div class="crawai-modal-footer">
          <button class="crawai-action-btn ghost js-cancel">取消</button>
          <button class="crawai-action-btn primary js-confirm">确定</button>
        </div>
      </div>
    `;
        mask.querySelector('.js-cancel').onclick = () => { mask.remove(); reject(new Error('用户取消')); };
        mask.querySelector('.js-confirm').onclick = () => {
            const result = {};
            fields.forEach((f) => { result[f.key] = parseFloat(mask.querySelector(`#xf_${f.key}`).value) || 0; });
            mask.remove();
            resolve(result);
        };
        document.body.appendChild(mask);
    });
}

function showTable({ title, columns, data }) {
    const mask = document.createElement('div');
    mask.className = 'crawai-table-mask';
    const thead = columns.map((c) => `<th>${c.label}</th>`).join('');
    const tbody = data.map((row) =>
        '<tr>' + columns.map((c) => {
            const v = row[c.key] ?? '';
            if (c.link) return `<td><a href="${v}" target="_blank">查看</a></td>`;
            return `<td title="${v}">${v}</td>`;
        }).join('') + '</tr>'
    ).join('');
    mask.innerHTML = `
    <div class="crawai-table-box">
      <div class="crawai-table-header">
        <div class="crawai-table-title">${title}（${data.length} 条）</div>
        <div class="crawai-table-actions">
          <button class="crawai-action-btn primary js-export">导出 CSV</button>
          <button class="crawai-action-btn ghost js-close">关闭</button>
        </div>
      </div>
      <div class="crawai-table-wrap"><table class="crawai-table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>
    </div>
  `;
    mask.querySelector('.js-close').onclick = () => mask.remove();
    mask.querySelector('.js-export').onclick = () => exportCSV(data, `小红书_${title}_${Date.now()}.csv`);
    mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
}

// ===== 权限验证 =====
async function checkPermission(funcName) {
    const data = await apiPost(`/ai/func/${funcName}`, {});
    return data;
}

// ===== 搜索结果采集 =====
async function collectSearch() {
    if (!location.href.includes('xiaohongshu.com/search_result')) {
        toast('请在小红书搜索结果页面使用此功能', 'error');
        return;
    }
    let settings;
    try {
        settings = await showSettings({
            title: '小红书搜索结果采集设置',
            fields: [
                { key: 'count', label: '采集数量', default: 50, min: 1, max: 1000 },
                { key: 'minLikes', label: '最小点赞量', default: 0, min: 0, placeholder: '不限制请填 0', hint: '0 表示不限制' },
            ],
        });
    } catch { return; }

    try { await checkPermission('XHS_Search_Collect'); } catch (e) {
        toast(e.message || '权限验证失败，请先登录', 'error');
        return;
    }

    const { count, minLikes } = settings;
    const progress = showProgress('采集搜索数据中...');
    const collected = new Map();

    while (collected.size < count) {
        if (progress.canceled) break;

        // 抓取当前可见的笔记卡片
        $$('.note-item').forEach((item) => {
            const img = $('img', item);
            const link = $('.cover.ld.mask', item) || $('a', item);
            const diggEl = $('.count', $('.footer', item));
            const nameEl = $('.name', $('.footer', item));

            if (!img || !link) return;
            const href = link.href || '';
            if (collected.has(href)) return;

            const digg = parseCount(text(diggEl));
            if (digg < minLikes) return;

            const noteId = href.match(/\/explore\/([^/?]+)/)?.[1] || '';
            collected.set(href, {
                笔记ID: noteId,
                标题: item.querySelector('a.title')?.innerText?.trim() || '',
                账号名: nameEl?.textContent?.trim() || '未知',
                点赞数: digg,
                封面图片: img.src || '',
                笔记链接: href,
            });
        });

        progress.update(collected.size, count, `已采集 ${collected.size} 条，继续加载...`);

        if (collected.size < count) {
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(2500);
        }
    }

    progress.remove();
    const result = Array.from(collected.values()).slice(0, count);
    if (!result.length) { toast('未采集到任何数据', 'warning'); return; }

    toast(`采集完成，共 ${result.length} 条`, 'success');

    // 上报给服务器
    try {
        await apiPost('/ai/chrome_video/modify_add', { platform: 'xiaohongshu', type: 'search', data: result });
    } catch (e) { console.warn('上报失败:', e); }

    const keyword = new URLSearchParams(location.search).get('keyword') || '';
    showTable({
        title: `小红书搜索「${decodeURIComponent(keyword)}」`,
        columns: [
            { key: '笔记ID', label: '笔记ID' },
            { key: '标题', label: '标题' },
            { key: '账号名', label: '账号名' },
            { key: '点赞数', label: '点赞数' },
            { key: '笔记链接', label: '链接', link: true },
        ],
        data: result,
    });
}

// ===== 账号主页采集 =====
async function collectAuthor() {
    if (!location.href.match(/xiaohongshu\.com\/user\/profile/)) {
        toast('请在小红书用户主页使用此功能', 'error');
        return;
    }
    let settings;
    try {
        settings = await showSettings({
            title: '小红书账号数据采集',
            fields: [{ key: 'count', label: '采集数量', default: 30, min: 1, max: 500 }],
        });
    } catch { return; }

    try { await checkPermission('XHS_Author_Collect'); } catch (e) {
        toast(e.message || '权限验证失败', 'error'); return;
    }

    const progress = showProgress('采集账号数据中...');
    const collected = new Map();

    const authorName = text($('.user-name, .nickname, [class*="nickname"]')) || '未知用户';

    while (collected.size < settings.count) {
        if (progress.canceled) break;

        $$('.note-item, [class*="note-item"], .feed-container .note').forEach((item) => {
            const link = $('a', item);
            if (!link?.href || collected.has(link.href)) return;
            const img = $('img', item);
            const digg = parseCount(text(item, '.count'));
            const noteId = link.href.match(/\/explore\/([^/?]+)/)?.[1] || '';
            collected.set(link.href, {
                笔记ID: noteId,
                标题: item.querySelector('.title')?.innerText?.trim() || '',
                点赞数: digg,
                封面图片: img?.src || '',
                笔记链接: link.href,
            });
        });

        progress.update(collected.size, settings.count, `已采集 ${collected.size} 条`);
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(2500);
    }

    progress.remove();
    const result = Array.from(collected.values()).slice(0, settings.count);
    if (!result.length) { toast('未采集到数据', 'warning'); return; }

    toast(`采集完成，共 ${result.length} 条`, 'success');

    try {
        await apiPost('/ai/chrome_author/modify_add', { platform: 'xiaohongshu', author: authorName, data: result });
    } catch (e) { console.warn('上报失败:', e); }

    showTable({
        title: `${authorName} 的笔记`,
        columns: [
            { key: '笔记ID', label: '笔记ID' },
            { key: '标题', label: '标题' },
            { key: '点赞数', label: '点赞数' },
            { key: '笔记链接', label: '链接', link: true },
        ],
        data: result,
    });
}

// ===== 视频文案提取 =====
async function extractText() {
    if (!location.href.includes('/explore/')) {
        toast('请在小红书笔记页面使用此功能', 'error');
        return;
    }

    const noteContainer = $('#noteContainer, .note-content, .interaction-container, article');
    if (!noteContainer) { toast('请刷新页面后重试', 'error'); return; }

    const title = text(noteContainer, '.title, .note-title, h1');
    const author = text(noteContainer, '.username, .author .name, .nickname');
    const content = (() => {
        const descEl = noteContainer.querySelector('.note-text, #detail-desc .desc, .content');
        if (!descEl) return '';
        const parts = [];
        const walk = (node) => {
            if (node.nodeType === 3) parts.push(node.textContent.trim());
            else if (!node.classList.contains('tag')) node.childNodes.forEach(walk);
        };
        walk(descEl);
        return parts.join('');
    })();

    const tags = $$('.tag', noteContainer).map((t) => t.textContent.trim().replace(/^#/, ''));
    const digg = parseCount(text($('.like-wrapper .count')));
    const collect = parseCount(text($('.collect-wrapper .count')));
    const comments = parseCount(text($('.chat-wrapper .count')));

    const output = [
        `📝 标题：${title}`,
        `👤 作者：${author}`,
        `📝 正文：${content}`,
        `🏷️  标签：${tags.join(' #')}`,
        `❤️  点赞：${digg} | ⭐收藏：${collect} | 💬评论：${comments}`,
        `🔗 链接：${location.href}`,
    ].join('\n');

    // 复制到剪贴板
    navigator.clipboard.writeText(output).then(
        () => toast('文案已复制到剪贴板 ✓', 'success'),
        () => toast('文案提取成功（剪贴板权限拒绝）', 'info')
    );

    // 显示弹窗
    const mask = document.createElement('div');
    mask.className = 'crawai-modal-mask';
    mask.innerHTML = `
    <div class="crawai-modal" style="max-height:80vh;overflow-y:auto;">
      <h3>📝 视频文案</h3>
      <textarea style="width:100%;height:200px;background:#1a1a2e;border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#e0e0e0;padding:10px;font-size:12px;resize:vertical;">${output}</textarea>
      <div class="crawai-modal-footer">
        <button class="crawai-action-btn primary js-copy">复制全部</button>
        <button class="crawai-action-btn ghost js-close">关闭</button>
      </div>
    </div>
  `;
    mask.querySelector('.js-copy').onclick = () => {
        navigator.clipboard.writeText(output);
        toast('已复制', 'success');
    };
    mask.querySelector('.js-close').onclick = () => mask.remove();
    document.body.appendChild(mask);
}

// ===== 视频下载 =====
async function downloadVideo() {
    // 查找视频 URL
    const videoEl = $('video');
    const videoUrl = videoEl?.src || videoEl?.querySelector('source')?.src;

    if (!videoUrl) {
        toast('未找到可下载的视频，请确认当前页面是视频笔记', 'warning');
        return;
    }

    toast('开始下载视频...', 'info');
    try {
        const res = await fetch(videoUrl);
        if (!res.ok) throw new Error('下载失败');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `xiaohongshu_${Date.now()}.mp4`;
        a.click();
        toast('视频下载完成 ✓', 'success');
    } catch {
        // 降级：直接打开
        window.open(videoUrl, '_blank');
        toast('已在新标签页打开视频', 'info');
    }
}

// ===== 悬浮面板 =====
function createPanel() {
    if (document.getElementById('crawai-xhs-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'crawai-xhs-panel';
    panel.className = 'crawai-panel';
    panel.innerHTML = `
    <div class="crawai-panel-header" id="crawai-xhs-drag">
      <span class="title">📖 小红书助手</span>
      <button class="crawai-panel-close" id="crawai-xhs-close">×</button>
    </div>
    <div class="crawai-panel-body">
      <div class="crawai-btn-list">
        <button class="crawai-btn" id="xhs-search">
          <span class="crawai-btn-icon">🔍</span>
          <div class="crawai-btn-info">
            <span class="crawai-btn-title">采集搜索数据</span>
            <span class="crawai-btn-desc">采集搜索结果页的笔记数据</span>
          </div>
        </button>
        <button class="crawai-btn" id="xhs-author">
          <span class="crawai-btn-icon">👤</span>
          <div class="crawai-btn-info">
            <span class="crawai-btn-title">采集账号数据</span>
            <span class="crawai-btn-desc">采集用户主页的笔记数据</span>
          </div>
        </button>
        <button class="crawai-btn" id="xhs-text">
          <span class="crawai-btn-icon">📝</span>
          <div class="crawai-btn-info">
            <span class="crawai-btn-title">获取视频文案</span>
            <span class="crawai-btn-desc">提取笔记正文和标签内容</span>
          </div>
        </button>
        <button class="crawai-btn" id="xhs-download">
          <span class="crawai-btn-icon">⬇️</span>
          <div class="crawai-btn-info">
            <span class="crawai-btn-title">下载视频</span>
            <span class="crawai-btn-desc">下载当前笔记视频到本地</span>
          </div>
        </button>
      </div>
    </div>
  `;

    document.body.appendChild(panel);

    // 拖拽
    let dragging = false, ox = 0, oy = 0;
    panel.querySelector('#crawai-xhs-drag').addEventListener('mousedown', (e) => {
        dragging = true;
        ox = e.clientX - panel.offsetLeft;
        oy = e.clientY - panel.offsetTop;
    });
    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        panel.style.left = (e.clientX - ox) + 'px';
        panel.style.top = (e.clientY - oy) + 'px';
        panel.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => { dragging = false; });

    panel.querySelector('#crawai-xhs-close').onclick = () => panel.remove();
    panel.querySelector('#xhs-search').onclick = () => collectSearch();
    panel.querySelector('#xhs-author').onclick = () => collectAuthor();
    panel.querySelector('#xhs-text').onclick = () => extractText();
    panel.querySelector('#xhs-download').onclick = () => downloadVideo();
}

// 监听来自 background/popup 的消息
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SHOW_PANEL') createPanel();
});

// 自动显示面板
setTimeout(createPanel, 1500);
