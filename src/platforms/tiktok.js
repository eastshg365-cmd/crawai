// TikTok 采集 Content Script
const BASE_URL = 'http://localhost:3000/api';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const parseCount = (str) => {
    if (!str) return 0;
    str = String(str).trim();
    if (str.toLowerCase().includes('m')) return Math.round(parseFloat(str) * 1000000);
    if (str.toLowerCase().includes('k')) return Math.round(parseFloat(str) * 1000);
    return parseInt(str.replace(/[^0-9.]/g, '')) || 0;
};

async function getToken() { return new Promise((r) => chrome.storage.local.get(['token'], (res) => r(res.token || ''))); }
async function apiPost(path, body) {
    const token = await getToken();
    if (!token) throw new Error('Please login first');
    const res = await fetch(BASE_URL + path, { method: 'POST', headers: { 'Content-Type': 'application/json', token }, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.code === 401) throw new Error('Please login first');
    if (data.code !== 1) throw new Error(data.msg || 'Request failed');
    return data;
}

function toast(msg, type = 'info') {
    let el = document.querySelector('.crawai-tk-toast');
    if (!el) { el = document.createElement('div'); el.className = 'crawai-toast crawai-tk-toast'; document.body.appendChild(el); }
    el.textContent = msg; el.className = `crawai-toast crawai-tk-toast ${type}`;
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => el.classList.remove('show'), 3000);
}

function showProgress(title) {
    const mask = document.createElement('div');
    mask.className = 'crawai-progress-mask';
    mask.innerHTML = `<div class="crawai-progress-box"><div class="crawai-progress-title">${title}</div><div class="crawai-progress-msg">Loading...</div><div class="crawai-progress-bar-wrap"><div class="crawai-progress-bar" style="width:0%"></div></div><div class="crawai-progress-count">0 items</div><button class="crawai-btn-cancel">Cancel</button></div>`;
    mask.canceled = false;
    mask.querySelector('.crawai-btn-cancel').onclick = () => { mask.canceled = true; mask.remove(); };
    document.body.appendChild(mask);
    mask.update = (n, total) => { mask.querySelector('.crawai-progress-bar').style.width = (total > 0 ? Math.min(100, Math.round(n / total * 100)) : 0) + '%'; mask.querySelector('.crawai-progress-count').textContent = `${n} items${total ? ' / ' + total : ''}`; };
    return mask;
}

function showTable(title, data) {
    const cols = [{ key: 'desc', label: 'Description' }, { key: 'author', label: 'Author' }, { key: 'likes', label: 'Likes' }, { key: 'url', label: 'Link', link: true }];
    const mask = document.createElement('div'); mask.className = 'crawai-table-mask';
    const thead = cols.map((c) => `<th>${c.label}</th>`).join('');
    const tbody = data.map((row) => '<tr>' + cols.map((c) => c.link ? `<td><a href="${row[c.key] || ''}" target="_blank">View</a></td>` : `<td title="${row[c.key] || ''}">${row[c.key] || ''}</td>`).join('') + '</tr>').join('');
    mask.innerHTML = `<div class="crawai-table-box"><div class="crawai-table-header"><div class="crawai-table-title">${title} (${data.length})</div><div class="crawai-table-actions"><button class="crawai-action-btn primary js-export">Export CSV</button><button class="crawai-action-btn ghost js-close">Close</button></div></div><div class="crawai-table-wrap"><table class="crawai-table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div></div>`;
    mask.querySelector('.js-close').onclick = () => mask.remove();
    mask.querySelector('.js-export').onclick = () => {
        const rows = data.map(r => cols.map(c => `"${String(r[c.key] || '').replace(/"/g, '""')}"`));
        const csv = '\uFEFF' + [cols.map(c => c.label).join(','), ...rows.map(r => r.join(','))].join('\n');
        Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `TikTok_${Date.now()}.csv` }).click();
    };
    mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
}

async function collectVideos() {
    const countStr = prompt('Number of videos to collect (default: 30):', '30');
    if (countStr === null) return;
    const count = parseInt(countStr) || 30;

    try { await apiPost('/ai/func/TK_Video_Collect', {}); } catch (e) { toast(e.message || 'Auth failed, please login', 'error'); return; }

    const progress = showProgress('Collecting TikTok videos...');
    const collected = new Map();

    while (collected.size < count) {
        if (progress.canceled) break;
        $$('[data-e2e="recommend-list-item"], [class*="DivWrapper"], article').forEach((item) => {
            const link = item.querySelector('a[href*="/video/"]');
            if (!link) return;
            const href = link.href.startsWith('http') ? link.href : 'https://www.tiktok.com' + link.href;
            if (collected.has(href)) return;
            const desc = item.querySelector('[data-e2e="video-desc"], [class*="VideoTitle"]')?.textContent?.trim() || '';
            const author = item.querySelector('[data-e2e="search-card-user-unique-id"], [class*="AuthorTitle"]')?.textContent?.trim() || '';
            const likes = parseCount(item.querySelector('[data-e2e="like-count"], [class*="LikeCount"]')?.textContent);
            collected.set(href, { desc, author, likes, url: href });
        });
        progress.update(collected.size, count);
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(2800);
    }

    progress.remove();
    const result = Array.from(collected.values()).slice(0, count);
    if (!result.length) { toast('No videos found', 'warning'); return; }
    toast(`Done! Collected ${result.length} videos`, 'success');
    try { await apiPost('/ai/chrome_video/modify_add', { platform: 'tiktok', data: result }); } catch { }
    showTable('TikTok Videos', result);
}

function createPanel() {
    if (document.getElementById('crawai-tk-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'crawai-tk-panel';
    panel.className = 'crawai-panel';
    panel.innerHTML = `<div class="crawai-panel-header" id="crawai-tk-drag"><span class="title">🌐 TikTok Collector</span><button class="crawai-panel-close" id="crawai-tk-close">×</button></div><div class="crawai-panel-body"><div class="crawai-btn-list"><button class="crawai-btn" id="tk-collect"><span class="crawai-btn-icon">📋</span><div class="crawai-btn-info"><span class="crawai-btn-title">Collect Videos</span><span class="crawai-btn-desc">Collect video list from current page</span></div></button></div></div>`;
    document.body.appendChild(panel);
    let dragging = false, ox = 0, oy = 0;
    panel.querySelector('#crawai-tk-drag').addEventListener('mousedown', (e) => { dragging = true; ox = e.clientX - panel.offsetLeft; oy = e.clientY - panel.offsetTop; panel.style.right = 'auto'; });
    document.addEventListener('mousemove', (e) => { if (!dragging) return; panel.style.left = (e.clientX - ox) + 'px'; panel.style.top = (e.clientY - oy) + 'px'; });
    document.addEventListener('mouseup', () => { dragging = false; });
    panel.querySelector('#crawai-tk-close').onclick = () => panel.remove();
    panel.querySelector('#tk-collect').onclick = collectVideos;
}

setTimeout(createPanel, 1500);
