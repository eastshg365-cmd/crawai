// API 封装：自动带 token，统一处理响应

const BASE_URL = 'http://localhost:3000/api';

async function getToken() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['token'], (res) => resolve(res.token || ''));
    });
}

async function request(path, options = {}) {
    const token = await getToken();
    const headers = {
        'Content-Type': 'application/json',
        'lang': 'zh-cn',
        ...(token ? { token } : {}),
        ...(options.headers || {}),
    };

    const url = BASE_URL + path;
    const res = await fetch(url, {
        ...options,
        headers,
    });

    const data = await res.json();

    if (data.code === 401) {
        chrome.storage.local.remove(['token']);
        throw new Error('请先登录');
    }

    if (data.code !== 1) {
        throw new Error(data.msg || '请求失败');
    }

    return data;
}

export const api = {
    get: (path, params) => {
        const qs = params ? '?' + new URLSearchParams(params).toString() : '';
        return request(path + qs, { method: 'GET' });
    },
    post: (path, body) =>
        request(path, { method: 'POST', body: JSON.stringify(body) }),
};

// 具体业务接口
export const checkPermission = (funcName) =>
    api.post(`/ai/func/${funcName}`, {});

export const saveVideo = (data) =>
    api.post('/ai/chrome_video/modify_add', data);

export const saveAuthor = (data) =>
    api.post('/ai/chrome_author/modify_add', data);

export const genSttTask = (data) =>
    api.post('/ai/func/STT_TaskID_Gen', data);

export const querySttTask = (data) =>
    api.post('/ai/func/STT_TaskID_Query', data);
