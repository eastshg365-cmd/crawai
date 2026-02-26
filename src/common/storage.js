// chrome.storage 封装，Promise 化

export const storage = {
    get: (keys) =>
        new Promise((resolve) => chrome.storage.local.get(keys, resolve)),

    set: (data) =>
        new Promise((resolve) => chrome.storage.local.set(data, resolve)),

    remove: (keys) =>
        new Promise((resolve) => chrome.storage.local.remove(keys, resolve)),

    getToken: async () => {
        const res = await storage.get(['token']);
        return res.token || null;
    },

    setToken: (token) => storage.set({ token }),

    clearToken: () => storage.remove(['token']),
};
