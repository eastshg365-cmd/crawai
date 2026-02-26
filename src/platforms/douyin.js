// 抖音采集 Content Script
// 功能：视频列表采集 / 账号主页采集 / 文案提取 / 视频文字转写

const BASE_URL = 'https://truessence.cloud/api';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const parseCount = (str) => {
    if (!str) return 0;
    str = String(str).replace(/,/g, '').trim();
    if (str.includes('万')) return Math.round(parseFloat(str) * 10000);
    if (str.includes('亿')) return Math.round(parseFloat(str) * 100000000);
    return parseInt(str) || 0;
};

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

function toast(msg, type = 'info', duration = 3000) {
    let el = document.querySelector('.crawai-dy-toast');
    if (!el) {
        el = document.createElement('div');
        el.className = 'crawai-toast crawai-dy-toast';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = `crawai-toast crawai-dy-toast ${type}`;
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => el.classList.remove('show'), duration);
}

function showProgress(title) {
    const mask = document.createElement('div');
    mask.className = 'crawai-progress-mask';
    mask.innerHTML = `<div class="crawai-progress-box"><div class="crawai-progress-title">${title}</div><div class="crawai-progress-msg">准备中...</div><div class="crawai-progress-bar-wrap"><div class="crawai-progress-bar" style="width:0%"></div></div><div class="crawai-progress-count">0 条</div><button class="crawai-btn-cancel">取消</button></div>`;
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

function showSettings(fields) {
    return new Promise((resolve, reject) => {
        const mask = document.createElement('div');
        mask.className = 'crawai-modal-mask';
        const formHtml = fields.map((f) => `<div class="crawai-form-item"><label>${f.label}</label><input type="number" id="df_${f.key}" value="${f.default ?? ''}" min="${f.min ?? ''}" max="${f.max ?? ''}"/></div>`).join('');
        mask.innerHTML = `<div class="crawai-modal"><h3>抖音采集设置</h3>${formHtml}<p class="crawai-form-hint">点击确定后进行权限验证</p><div class="crawai-modal-footer"><button class="crawai-action-btn ghost js-cancel">取消</button><button class="crawai-action-btn primary js-confirm">确定</button></div></div>`;
        mask.querySelector('.js-cancel').onclick = () => { mask.remove(); reject(new Error('用户取消')); };
        mask.querySelector('.js-confirm').onclick = () => {
            const result = {};
            fields.forEach((f) => { result[f.key] = parseFloat(mask.querySelector(`#df_${f.key}`).value) || 0; });
            mask.remove(); resolve(result);
        };
        document.body.appendChild(mask);
    });
}

function showTable(title, columns, data) {
    const mask = document.createElement('div');
    mask.className = 'crawai-table-mask';
    const thead = columns.map((c) => `<th>${c.label}</th>`).join('');
    const tbody = data.map((row) => '<tr>' + columns.map((c) => {
        const v = row[c.key] ?? '';
        return c.link ? `<td><a href="${v}" target="_blank">查看</a></td>` : `<td title="${v}">${v}</td>`;
    }).join('') + '</tr>').join('');
    mask.innerHTML = `<div class="crawai-table-box"><div class="crawai-table-header"><div class="crawai-table-title">${title}（${data.length} 条）</div><div class="crawai-table-actions"><button class="crawai-action-btn primary js-export">导出 CSV</button><button class="crawai-action-btn ghost js-close">关闭</button></div></div><div class="crawai-table-wrap"><table class="crawai-table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div></div>`;
    mask.querySelector('.js-close').onclick = () => mask.remove();
    mask.querySelector('.js-export').onclick = () => {
        const headers = columns.map((c) => c.label);
        const rows = data.map((r) => columns.map((c) => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`));
        const csv = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `抖音_${Date.now()}.csv` });
        a.click();
    };
    mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
}

// 搜索/列表采集
async function collectList() {
    let settings;
    try { settings = await showSettings([{ key: 'count', label: '采集数量', default: 30, min: 1, max: 500 }]); }
    catch { return; }

    try { await apiPost('/ai/func/DY_List_Collect', {}); } catch (e) {
        toast(e.message || '权限验证失败', 'error'); return;
    }

    const progress = showProgress('采集抖音数据中...');
    const collected = new Map();

    while (collected.size < settings.count) {
        if (progress.canceled) break;

        // 抖音视频卡片选择器（多种情况兼容）
        $$('[data-e2e="feed-active-video"], .video-feed-item, .search-card-container, li[data-e2e]').forEach((item) => {
            const link = $('a', item);
            if (!link?.href || collected.has(link.href)) return;

            const title = item.querySelector('.video-desc, [data-e2e="video-desc"], .search-card-desc')?.textContent?.trim() || '';
            const author = item.querySelector('[data-e2e="search-card-author-nickname"], .author-nickname, .user-info-nickname')?.textContent?.trim() || '';
            const digg = parseCount(item.querySelector('[data-e2e="like-count"], .like-count')?.textContent);
            const cover = item.querySelector('img')?.src || '';

            collected.set(link.href, {
                标题: title,
                作者: author,
                点赞数: digg,
                封面: cover,
                视频链接: link.href,
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
    try { await apiPost('/ai/chrome_video/modify_add', { platform: 'douyin', data: result }); } catch { }

    showTable('抖音视频', [
        { key: '标题', label: '标题' },
        { key: '作者', label: '作者' },
        { key: '点赞数', label: '点赞数' },
        { key: '视频链接', label: '链接', link: true },
    ], result);
}

// 账号主页采集
async function collectAuthor() {
    if (!location.href.includes('douyin.com/user/')) {
        toast('请在抖音用户主页使用此功能', 'error'); return;
    }
    let settings;
    try { settings = await showSettings([{ key: 'count', label: '采集数量', default: 20, min: 1, max: 200 }]); }
    catch { return; }

    try { await apiPost('/ai/func/DY_Author_Collect', {}); } catch (e) {
        toast(e.message || '权限验证失败', 'error'); return;
    }

    const progress = showProgress('采集账号数据中...');
    const collected = new Map();

    while (collected.size < settings.count) {
        if (progress.canceled) break;
        $$('[data-e2e="user-post-item"], .video-card').forEach((item) => {
            const link = $('a', item);
            if (!link?.href || collected.has(link.href)) return;
            const digg = parseCount(item.querySelector('.video-count')?.textContent);
            collected.set(link.href, {
                封面: item.querySelector('img')?.src || '',
                标题: item.querySelector('.video-desc, p')?.textContent?.trim() || '',
                播放数: digg,
                视频链接: link.href,
            });
        });
        progress.update(collected.size, settings.count);
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(2500);
    }

    progress.remove();
    const result = Array.from(collected.values()).slice(0, settings.count);
    toast(`采集完成，共 ${result.length} 条`, 'success');
    showTable('抖音账号视频', [
        { key: '标题', label: '标题' },
        { key: '播放数', label: '播放数' },
        { key: '视频链接', label: '链接', link: true },
    ], result);
}

// 浮动面板
function createPanel() {
    if (document.getElementById('crawai-dy-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'crawai-dy-panel';
    panel.className = 'crawai-panel';
    panel.innerHTML = `
    <div class="crawai-panel-header" id="crawai-dy-drag">
      <span class="title">🎵 抖音助手</span>
      <button class="crawai-panel-close" id="crawai-dy-close">×</button>
    </div>
    <div class="crawai-panel-body">
      <div class="crawai-btn-list">
        <button class="crawai-btn" id="dy-list"><span class="crawai-btn-icon">📋</span><div class="crawai-btn-info"><span class="crawai-btn-title">采集视频列表</span><span class="crawai-btn-desc">采集当前页面视频数据</span></div></button>
        <button class="crawai-btn" id="dy-author"><span class="crawai-btn-icon">👤</span><div class="crawai-btn-info"><span class="crawai-btn-title">采集账号数据</span><span class="crawai-btn-desc">采集用户主页视频</span></div></button>
      </div>
    </div>
  `;
    document.body.appendChild(panel);

    let dragging = false, ox = 0, oy = 0;
    panel.querySelector('#crawai-dy-drag').addEventListener('mousedown', (e) => { dragging = true; ox = e.clientX - panel.offsetLeft; oy = e.clientY - panel.offsetTop; });
    document.addEventListener('mousemove', (e) => { if (!dragging) return; panel.style.left = (e.clientX - ox) + 'px'; panel.style.top = (e.clientY - oy) + 'px'; panel.style.right = 'auto'; });
    document.addEventListener('mouseup', () => { dragging = false; });

    panel.querySelector('#crawai-dy-close').onclick = () => panel.remove();
    panel.querySelector('#dy-list').onclick = collectList;
    panel.querySelector('#dy-author').onclick = collectAuthor;
}

setTimeout(createPanel, 1500);
