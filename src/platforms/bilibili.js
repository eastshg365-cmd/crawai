// B站采集 Content Script
const BASE_URL = 'https://aopysfqkewxmmunhdioz.supabase.co/functions/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const parseCount = (str) => {
    if (!str) return 0;
    str = String(str).replace(/,/g, '').trim();
    if (str.includes('万')) return Math.round(parseFloat(str) * 10000);
    return parseInt(str) || 0;
};

async function getToken() { return new Promise((r) => chrome.storage.local.get(['token'], (res) => r(res.token || ''))); }
async function apiPost(path, body) {
    const token = await getToken();
    if (!token) throw new Error('请先登录');
    const res = await fetch(BASE_URL + path, { method: 'POST', headers: { 'Content-Type': 'application/json', token }, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.code === 401) throw new Error('请先登录');
    if (data.code !== 1) throw new Error(data.msg || '请求失败');
    return data;
}

function toast(msg, type = 'info') {
    let el = document.querySelector('.crawai-bili-toast');
    if (!el) { el = document.createElement('div'); el.className = 'crawai-toast crawai-bili-toast'; document.body.appendChild(el); }
    el.textContent = msg; el.className = `crawai-toast crawai-bili-toast ${type}`;
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => el.classList.remove('show'), 3000);
}

function showProgress(title) {
    const mask = document.createElement('div');
    mask.className = 'crawai-progress-mask';
    mask.innerHTML = `<div class="crawai-progress-box"><div class="crawai-progress-title">${title}</div><div class="crawai-progress-msg">准备中...</div><div class="crawai-progress-bar-wrap"><div class="crawai-progress-bar" style="width:0%"></div></div><div class="crawai-progress-count">0 条</div><button class="crawai-btn-cancel">取消</button></div>`;
    mask.canceled = false;
    mask.querySelector('.crawai-btn-cancel').onclick = () => { mask.canceled = true; mask.remove(); };
    document.body.appendChild(mask);
    mask.update = (n, total) => { mask.querySelector('.crawai-progress-bar').style.width = (total > 0 ? Math.min(100, Math.round(n / total * 100)) : 0) + '%'; mask.querySelector('.crawai-progress-count').textContent = `${n} 条${total ? ' / ' + total : ''}`; };
    return mask;
}

function showTable(title, data) {
    const cols = [{ key: '标题', label: '标题' }, { key: '作者', label: 'UP主' }, { key: '播放量', label: '播放量' }, { key: '弹幕数', label: '弹幕数' }, { key: '视频链接', label: '链接', link: true }];
    const mask = document.createElement('div'); mask.className = 'crawai-table-mask';
    const thead = cols.map((c) => `<th>${c.label}</th>`).join('');
    const tbody = data.map((row) => '<tr>' + cols.map((c) => c.link ? `<td><a href="${row[c.key] || ''}" target="_blank">查看</a></td>` : `<td title="${row[c.key] || ''}">${row[c.key] || ''}</td>`).join('') + '</tr>').join('');
    mask.innerHTML = `<div class="crawai-table-box"><div class="crawai-table-header"><div class="crawai-table-title">${title}（${data.length} 条）</div><div class="crawai-table-actions"><button class="crawai-action-btn primary js-export">导出 CSV</button><button class="crawai-action-btn ghost js-close">关闭</button></div></div><div class="crawai-table-wrap"><table class="crawai-table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div></div>`;
    mask.querySelector('.js-close').onclick = () => mask.remove();
    mask.querySelector('.js-export').onclick = () => {
        const headers = cols.map(c => c.label);
        const rows = data.map(r => cols.map(c => `"${String(r[c.key] || '').replace(/"/g, '""')}"`));
        const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `B站_${Date.now()}.csv` }).click();
    };
    mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
}

async function collectVideos() {
    const countStr = prompt('采集数量（默认 30）：', '30');
    if (countStr === null) return;
    const count = parseInt(countStr) || 30;

    try { await apiPost('/plugin-auth', { funcName: 'BILI_Video_Collect' }); } catch (e) { toast(e.message || '权限验证失败', 'error'); return; }

    const progress = showProgress('采集 B站 数据中...');
    const collected = new Map();

    while (collected.size < count) {
        if (progress.canceled) break;
        // 兼容搜索结果、推荐、个人主页等多种页面
        $$('.video-card, .bili-video-card, [data-tid], .search-video-card, li.video-item').forEach((item) => {
            const link = item.querySelector('a[href*="video/"]');
            if (!link) return;
            const href = link.href.startsWith('http') ? link.href : 'https:' + link.href;
            if (collected.has(href)) return;
            collected.set(href, {
                标题: (item.querySelector('.title, .bili-video-card__info--tit') || item.querySelector('a'))?.textContent?.trim() || '',
                作者: item.querySelector('.name, .bili-video-card__info--author, .up-name')?.textContent?.trim() || '',
                播放量: parseCount(item.querySelector('.view, .play-icon + span, [data-key="view"]')?.textContent),
                弹幕数: parseCount(item.querySelector('.dm, .danmaku, [data-key="danmaku"]')?.textContent),
                视频链接: href,
            });
        });
        progress.update(collected.size, count);
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(2500);
    }

    progress.remove();
    const result = Array.from(collected.values()).slice(0, count);
    if (!result.length) { toast('未采集到数据', 'warning'); return; }
    toast(`采集完成，共 ${result.length} 条`, 'success');
    try { await apiPost('/plugin-video', { platform: 'bilibili', data: result }); } catch { }
    showTable('B站视频', result);
}

function createPanel() {
    if (document.getElementById('crawai-bili-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'crawai-bili-panel';
    panel.className = 'crawai-panel';
    panel.innerHTML = `<div class="crawai-panel-header" id="crawai-bili-drag"><span class="title">📺 B站助手</span><button class="crawai-panel-close" id="crawai-bili-close">×</button></div><div class="crawai-panel-body"><div class="crawai-btn-list"><button class="crawai-btn" id="bili-collect"><span class="crawai-btn-icon">📋</span><div class="crawai-btn-info"><span class="crawai-btn-title">采集视频数据</span><span class="crawai-btn-desc">采集当前页面视频列表</span></div></button></div></div>`;
    document.body.appendChild(panel);
    let dragging = false, ox = 0, oy = 0;
    panel.querySelector('#crawai-bili-drag').addEventListener('mousedown', (e) => { dragging = true; ox = e.clientX - panel.offsetLeft; oy = e.clientY - panel.offsetTop; panel.style.right = 'auto'; });
    document.addEventListener('mousemove', (e) => { if (!dragging) return; panel.style.left = (e.clientX - ox) + 'px'; panel.style.top = (e.clientY - oy) + 'px'; });
    document.addEventListener('mouseup', () => { dragging = false; });
    panel.querySelector('#crawai-bili-close').onclick = () => panel.remove();
    panel.querySelector('#bili-collect').onclick = collectVideos;
}

setTimeout(createPanel, 1500);
