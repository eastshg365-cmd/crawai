// 通用 UI 组件：Toast、进度弹窗、数据表格弹窗、设置弹窗

// ===== Toast =====
let _toastEl = null;
let _toastTimer = null;

export function toast(msg, type = 'info', duration = 3000) {
    if (!_toastEl) {
        _toastEl = document.createElement('div');
        _toastEl.className = 'crawai-toast';
        document.body.appendChild(_toastEl);
    }
    _toastEl.textContent = msg;
    _toastEl.className = `crawai-toast ${type}`;
    requestAnimationFrame(() => _toastEl.classList.add('show'));

    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
        _toastEl.classList.remove('show');
    }, duration);
}

export const msg = {
    success: (text) => toast(text, 'success'),
    error: (text) => toast(text, 'error'),
    info: (text) => toast(text, 'info'),
    warning: (text) => toast(text, 'warning'),
};

// ===== 进度弹窗 =====
export class ProgressDialog {
    constructor({ title = '正在采集', cancelable = true } = {}) {
        this.canceled = false;
        this._mask = document.createElement('div');
        this._mask.className = 'crawai-progress-mask';
        this._mask.innerHTML = `
      <div class="crawai-progress-box">
        <div class="crawai-progress-title">${title}</div>
        <div class="crawai-progress-msg">准备中...</div>
        <div class="crawai-progress-bar-wrap">
          <div class="crawai-progress-bar" style="width:0%"></div>
        </div>
        <div class="crawai-progress-count">0 条</div>
        ${cancelable ? '<button class="crawai-btn-cancel">取消</button>' : ''}
      </div>
    `;
        if (cancelable) {
            this._mask.querySelector('.crawai-btn-cancel').addEventListener('click', () => {
                this.canceled = true;
                this.unmount();
            });
        }
        document.body.appendChild(this._mask);
    }

    update(count, total, message) {
        const pct = total > 0 ? Math.min(100, Math.round((count / total) * 100)) : 0;
        this._mask.querySelector('.crawai-progress-bar').style.width = pct + '%';
        this._mask.querySelector('.crawai-progress-count').textContent = `${count} 条${total ? ' / ' + total : ''}`;
        if (message) this._mask.querySelector('.crawai-progress-msg').textContent = message;
    }

    unmount() {
        this._mask.remove();
    }
}

// ===== 数据表格弹窗 =====
export function showTableDialog({ title, columns, data, onExport }) {
    const mask = document.createElement('div');
    mask.className = 'crawai-table-mask';

    const thead = columns.map((c) => `<th>${c.label}</th>`).join('');
    const tbody = data
        .map(
            (row) =>
                '<tr>' +
                columns
                    .map((c) => {
                        const val = row[c.key] ?? '';
                        if (c.link) return `<td><a href="${val}" target="_blank" title="${val}">查看</a></td>`;
                        if (c.img) return `<td><img src="${val}" style="height:40px;border-radius:4px;" /></td>`;
                        return `<td title="${val}">${val}</td>`;
                    })
                    .join('') +
                '</tr>'
        )
        .join('');

    mask.innerHTML = `
    <div class="crawai-table-box">
      <div class="crawai-table-header">
        <div class="crawai-table-title">${title} (${data.length} 条)</div>
        <div class="crawai-table-actions">
          <button class="crawai-action-btn primary js-export">导出 Excel</button>
          <button class="crawai-action-btn ghost js-close">关闭</button>
        </div>
      </div>
      <div class="crawai-table-wrap">
        <table class="crawai-table">
          <thead><tr>${thead}</tr></thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>
    </div>
  `;

    mask.querySelector('.js-close').addEventListener('click', () => mask.remove());
    mask.querySelector('.js-export').addEventListener('click', () => {
        onExport && onExport(data);
    });
    mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });

    document.body.appendChild(mask);
}

// ===== 采集数量设置弹窗 =====
export function showSettingsDialog({ title, fields }) {
    return new Promise((resolve, reject) => {
        const mask = document.createElement('div');
        mask.className = 'crawai-modal-mask';

        const formFields = fields
            .map(
                (f) => `
      <div class="crawai-form-item">
        <label>${f.label}</label>
        <input type="${f.type || 'number'}" id="field_${f.key}" value="${f.default ?? ''}" placeholder="${f.placeholder || ''}" min="${f.min ?? ''}" max="${f.max ?? ''}"/>
        ${f.hint ? `<div class="crawai-form-hint">${f.hint}</div>` : ''}
      </div>
    `
            )
            .join('');

        mask.innerHTML = `
      <div class="crawai-modal">
        <h3>${title}</h3>
        ${formFields}
        <p class="crawai-form-hint">点击确定后将进行权限验证，验证成功后开始采集</p>
        <div class="crawai-modal-footer">
          <button class="crawai-action-btn ghost js-cancel">取消</button>
          <button class="crawai-action-btn primary js-confirm">确定</button>
        </div>
      </div>
    `;

        mask.querySelector('.js-cancel').addEventListener('click', () => {
            mask.remove();
            reject(new Error('用户取消'));
        });

        mask.querySelector('.js-confirm').addEventListener('click', () => {
            const result = {};
            fields.forEach((f) => {
                const el = mask.querySelector(`#field_${f.key}`);
                result[f.key] = f.type === 'text' ? el.value : parseFloat(el.value) || 0;
            });
            mask.remove();
            resolve(result);
        });

        document.body.appendChild(mask);
    });
}
