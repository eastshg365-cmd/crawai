/**
 * 凯瑞莱AI营销插件 SDK
 * 在网站页面中引入此 JS，实现网站 → 插件的双向通信
 * 
 * 使用方法：
 * import CrawAI from './crawai-sdk.js';
 * const sdk = new CrawAI();
 * await sdk.ready();
 * sdk.collectSearch({ keyword: '私人定制护肤', count: 50 });
 */

class CrawAI {
    constructor() {
        this._ready = false;
        this._callbacks = {};
        this._taskCallbacks = {};

        // 监听插件回调
        window.addEventListener('message', (event) => {
            if (event.source !== window) return;
            const msg = event.data;
            if (!msg?.type?.startsWith('CRAWAI_')) return;

            if (msg.type === 'CRAWAI_READY' || msg.type === 'CRAWAI_PONG') {
                this._ready = true;
                this._isLoggedIn = msg.hasToken;
                this._emit('ready', msg);
            }
            if (msg.type === 'CRAWAI_TOKEN_SYNCED') {
                this._isLoggedIn = true;
                this._emit('tokenSynced');
            }
            if (msg.type === 'CRAWAI_TASK_ACK') {
                const cb = this._taskCallbacks[msg.taskId];
                if (cb) cb(msg.response);
            }
        });

        // 主动询问插件状态
        setTimeout(() => window.postMessage({ type: 'CRAWAI_PING' }, '*'), 500);
    }

    // 等待插件就绪
    ready(timeout = 3000) {
        return new Promise((resolve, reject) => {
            if (this._ready) { resolve(true); return; }
            const timer = setTimeout(() => reject(new Error('插件未安装或未启用')), timeout);
            this.on('ready', () => { clearTimeout(timer); resolve(true); });
        });
    }

    // 检查插件是否已安装
    static isInstalled() {
        return !!document.getElementById('crawai_ext_installed');
    }

    // 获取插件版本
    static getVersion() {
        return document.getElementById('crawai_ext_installed')?.dataset?.version || null;
    }

    // 发送采集任务
    _sendTask(payload) {
        const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        return new Promise((resolve) => {
            this._taskCallbacks[taskId] = resolve;
            setTimeout(() => {
                delete this._taskCallbacks[taskId];
                resolve({ ok: false, msg: '任务超时' });
            }, 10000);
            window.postMessage({ type: 'CRAWAI_TASK', payload: { ...payload, taskId } }, '*');
        });
    }

    /** 采集小红书搜索结果
     * @param {{ keyword: string, count?: number }} options
     */
    collectSearch({ keyword, count = 30 }) {
        return this._sendTask({ action: 'collect_search', platform: 'xiaohongshu', keyword, count });
    }

    /** 采集小红书账号数据
     * @param {{ authorId: string, count?: number }} options
     */
    collectAuthor({ authorId, count = 20 }) {
        return this._sendTask({ action: 'collect_author', platform: 'xiaohongshu', authorId, count });
    }

    /** 采集下拉词
     * @param {{ keyword: string }} options
     */
    collectKeywords({ keyword }) {
        return this._sendTask({ action: 'collect_keywords', keyword });
    }

    // 事件系统
    on(event, cb) {
        if (!this._callbacks[event]) this._callbacks[event] = [];
        this._callbacks[event].push(cb);
        return this;
    }
    _emit(event, data) {
        (this._callbacks[event] || []).forEach((cb) => cb(data));
    }
}

// 全局挂载
window.CrawAI = CrawAI;
export default CrawAI;
