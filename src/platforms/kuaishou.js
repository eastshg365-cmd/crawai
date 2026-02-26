// 快手采集 Content Script
const BASE_URL = 'https://truessence.cloud/api';
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
    let el = document.querySelector('.crawai-ks-toast');
    if (!el) { el = document.createElement('div'); el.className = 'crawai-toast crawai-ks-toast'; document.body.appendChild(el); }
    el.textContent = msg; el.className = `crawai-toast crawai-ks-toast ${type}`;
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
    const cols = [{ key: '标题', label: '标题' }, { key: '作者', label: '作者' }, { key: '点赞数', label: '点赞数' }, { key: '视频链接', label: '链接', link: true }];
    const mask = document.createElement('div'); mask.className = 'crawai-table-mask';
    const thead = cols.map((c) => `<th>${c.label}</th>`).join('');
    const tbody = data.map((row) => '<tr>' + cols.map((c) => c.link ? `<td><a href="${row[c.key] || ''}" target="_blank">查看</a></td>` : `<td title="${row[c.key] || ''}">${row[c.key] || ''}</td>`).join('') + '</tr>').join('');
    mask.innerHTML = `<div class="crawai-table-box"><div class="crawai-table-header"><div class="crawai-table-title">${title}（${data.length} 条）</div><div class="crawai-table-actions"><button class="crawai-action-btn primary js-export">导出 CSV</button><button class="crawai-action-btn ghost js-close">关闭</button></div></div><div class="crawai-table-wrap"><table class="crawai-table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div></div>`;
    mask.querySelector('.js-close').onclick = () => mask.remove();
    mask.querySelector('.js-export').onclick = () => {
        const rows = data.map(r => cols.map(c => `"${String(r[c.key] || '').replace(/"/g, '""')}"`));
        const csv = '\uFEFF' + [cols.map(c => c.label).join(','), ...rows.map(r => r.join(','))].join('\n');
        Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `快手_${Date.now()}.csv` }).click();
    };
    mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
}

async function collectVideos() {
    const countStr = prompt('采集数量（默认 30）：', '30');
    if (countStr === null) return;
    const count = parseInt(countStr) || 30;

    try { await apiPost('/ai/func/KS_Video_Collect', {}); } catch (e) { toast(e.message || '权限验证失败', 'error'); return; }

    const progress = showProgress('采集快手数据中...');
    const collected = new Map();

    while (collected.size < count) {
        if (progress.canceled) break;
        $$('.video-card, [class*="videoCard"], .feed-item, [class*="feed-card"]').forEach((item) => {
            const link = item.querySelector('a');
            if (!link?.href || collected.has(link.href)) return;
            const href = link.href.startsWith('http') ? link.href : 'https://www.kuaishou.com' + link.href;
            collected.set(href, {
                标题: item.querySelector('[class*="caption"], [class*="title"], p')?.textContent?.trim() || '',
                作者: item.querySelector('[class*="nickname"], [class*="author"]')?.textContent?.trim() || '',
                点赞数: parseCount(item.querySelector('[class*="like"], [class*="digg"]')?.textContent),
                封面: item.querySelector('img')?.src || '',
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
    try { await apiPost('/ai/chrome_video/modify_add', { platform: 'kuaishou', data: result }); } catch { }
    showTable('快手视频', result);
}

function createPanel() {
    if (document.getElementById('crawai-ks-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'crawai-ks-panel';
    panel.className = 'crawai-panel';
    panel.innerHTML = `<div class="crawai-panel-header" id="crawai-ks-drag"><span class="title">⚡ 快手助手</span><button class="crawai-panel-close" id="crawai-ks-close">×</button></div><div class="crawai-panel-body"><div class="crawai-btn-list"><button class="crawai-btn" id="ks-collect"><span class="crawai-btn-icon">📋</span><div class="crawai-btn-info"><span class="crawai-btn-title">采集视频数据</span><span class="crawai-btn-desc">采集当前页面视频列表</span></div></button></div></div>`;
    document.body.appendChild(panel);
    let dragging = false, ox = 0, oy = 0;
    panel.querySelector('#crawai-ks-drag').addEventListener('mousedown', (e) => { dragging = true; ox = e.clientX - panel.offsetLeft; oy = e.clientY - panel.offsetTop; panel.style.right = 'auto'; });
    document.addEventListener('mousemove', (e) => { if (!dragging) return; panel.style.left = (e.clientX - ox) + 'px'; panel.style.top = (e.clientY - oy) + 'px'; });
    document.addEventListener('mouseup', () => { dragging = false; });
    panel.querySelector('#crawai-ks-close').onclick = () => panel.remove();
    panel.querySelector('#ks-collect').onclick = collectVideos;
}

setTimeout(createPanel, 1500);
