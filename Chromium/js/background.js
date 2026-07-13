/*
 * Send Content to Tab - Send web page text or link content to the side panel, edit it, and open it in a new tab or incognito tab.
 * Copyright (C) 2026-present lslslsl06
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

const CONTEXT_MENU_IDS = {
    OPEN_SIDEPANEL: 'open-sidepanel',
    CLOSE_SIDEPANEL: 'close-sidepanel',
    SEND_CURRENT_PAGE_TO_SIDEPANEL: 'send-current-page-to-sidepanel',
    SEND_TO_SIDEPANEL: 'send-to-sidepanel',
    SEND_LINK_TO_SIDEPANEL: 'send-link-to-sidepanel',
    SEND_TO_INCOGNITO: 'send-to-incognito'
};

let isCreatingMenus = false;

// Promise-based wrapper for chrome.contextMenus.removeAll
function removeAllContextMenus() {
    return new Promise((resolve) => {
        chrome.contextMenus.removeAll(() => {
            if (chrome.runtime.lastError) {
                console.error('removeAll error:', chrome.runtime.lastError);
            }
            resolve();
        });
    });
}

// Check if page is supported using PageSupportChecker
function isPageSupported(url) {
    if (typeof PageSupportChecker !== 'undefined' && PageSupportChecker.isUnsupportedPage) {
        return !PageSupportChecker.isUnsupportedPage(url);
    }
    // Fallback check
    if (!url || typeof url !== 'string') return false;
    const unsupportedPrefixes = ['chrome', 'devtools', 'edge', 'about:', 'extension', 'view-source:'];
    const unsupportedUrls = ['https://addons.mozilla.org', 'https://chromewebstore.google.com', 'https://microsoftedge.microsoft.com/addons'];
    for (const prefix of unsupportedPrefixes) {
        if (url.startsWith(prefix)) return false;
    }
    for (const unsupportedUrl of unsupportedUrls) {
        if (url.startsWith(unsupportedUrl)) return false;
    }
    return true;
}

// Check if file access is allowed
function checkFileAccess() {
    return new Promise((resolve) => {
        chrome.extension.isAllowedFileSchemeAccess((isAllowed) => {
            resolve(isAllowed);
        });
    });
}

// Create context menus
async function createContextMenus() {
    if (isCreatingMenus) return;
    isCreatingMenus = true;

    try {
        await removeAllContextMenus();

        const { contextMenuEnabled } = await chrome.storage.local.get('contextMenuEnabled');

        // Default to enabled if not set
        if (contextMenuEnabled === undefined) {
            await chrome.storage.local.set({ contextMenuEnabled: true });
        }

        if (contextMenuEnabled === false) {
            return;
        }

        const { closeSidepanelEnabled } = await chrome.storage.local.get('closeSidepanelEnabled');

        // Default to enabled if not set
        if (closeSidepanelEnabled === undefined) {
            await chrome.storage.local.set({ closeSidepanelEnabled: true });
        }

        // First items: Open side panel (always visible, no page restriction)
        chrome.contextMenus.create({
            id: CONTEXT_MENU_IDS.OPEN_SIDEPANEL,
            title: chrome.i18n.getMessage('contextMenuOpenSidepanel'),
            contexts: ['all'],
            documentUrlPatterns: ['<all_urls>']
        });

        // Close side panel (only if enabled)
        if (closeSidepanelEnabled !== false) {
            chrome.contextMenus.create({
                id: CONTEXT_MENU_IDS.CLOSE_SIDEPANEL,
                title: chrome.i18n.getMessage('contextMenuCloseSidepanel'),
                contexts: ['all'],
                documentUrlPatterns: ['<all_urls>']
            });
        }


        // Separator
        chrome.contextMenus.create({
            id: 'separator-1',
            type: 'separator',
            contexts: ['all'],
            documentUrlPatterns: ['<all_urls>']
        });

        // Send current page URL to side panel (always visible globally)
        chrome.contextMenus.create({
            id: CONTEXT_MENU_IDS.SEND_CURRENT_PAGE_TO_SIDEPANEL,
            title: chrome.i18n.getMessage('contextMenuSendCurrentPageToSidepanel'),
            contexts: ['all'],
            documentUrlPatterns: ['<all_urls>']
        });

        // Separator
        chrome.contextMenus.create({
            id: 'separator-2',
            type: 'separator',
            contexts: ['all'],
            documentUrlPatterns: ['<all_urls>']
        });

        // Check file access permission to determine if file:// URLs should be included
        const fileAccessAllowed = await checkFileAccess();

        // Build documentUrlPatterns based on file access
        // When file access is not allowed, exclude file:// URLs from selection/link context menus
        const selectionPatterns = fileAccessAllowed
            ? ['<all_urls>']
            : ['http://*/*', 'https://*/*'];
        const linkPatterns = fileAccessAllowed
            ? ['<all_urls>']
            : ['http://*/*', 'https://*/*'];

        // Send selected text to side panel (only on supported pages)
        chrome.contextMenus.create({
            id: CONTEXT_MENU_IDS.SEND_TO_SIDEPANEL,
            title: chrome.i18n.getMessage('contextMenuSendToSidepanel'),
            contexts: ['selection'],
            documentUrlPatterns: selectionPatterns
        });

        // Send link content to side panel (only on supported pages)
        chrome.contextMenus.create({
            id: CONTEXT_MENU_IDS.SEND_LINK_TO_SIDEPANEL,
            title: chrome.i18n.getMessage('contextMenuSendLinkToSidepanel'),
            contexts: ['link'],
            documentUrlPatterns: linkPatterns
        });

        // Send selected text to incognito window (only on supported pages, only if incognito features enabled)
        const { incognitoEnabled } = await chrome.storage.local.get('incognitoEnabled');
        if (incognitoEnabled === true) {
            chrome.contextMenus.create({
                id: CONTEXT_MENU_IDS.SEND_TO_INCOGNITO,
                title: chrome.i18n.getMessage('contextMenuSendToIncognito'),
                contexts: ['selection'],
                documentUrlPatterns: selectionPatterns
            });
        }
    } catch (e) {
        console.error('Failed to create context menus:', e);
    } finally {
        isCreatingMenus = false;
    }
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab) return;

    const menuItemId = info.menuItemId;
    const pageUrl = tab.url || '';

    // Check if page is supported for non-sidepanel actions
    const isSupported = isPageSupported(pageUrl);

    if (menuItemId === CONTEXT_MENU_IDS.OPEN_SIDEPANEL) {
        // Open side panel - always works regardless of page support
        await chrome.sidePanel.open({ windowId: tab.windowId });
        return;
    }

    if (menuItemId === CONTEXT_MENU_IDS.CLOSE_SIDEPANEL) {
        // Close side panel - always works regardless of page support
        await chrome.sidePanel.close({ windowId: tab.windowId });
        return;
    }

    // Send current page URL - always works regardless of page support (URL is extracted via tabs API)
    if (menuItemId === CONTEXT_MENU_IDS.SEND_CURRENT_PAGE_TO_SIDEPANEL) {
        if (pageUrl) {
            // Set pending text first, then try to open side panel
            // sidePanel.open requires a user gesture; the await above may lose gesture context,
            // so wrap in try-catch to handle the case gracefully
            await chrome.storage.local.set({ pendingSidepanelText: pageUrl });
            try {
                await chrome.sidePanel.open({ windowId: tab.windowId });
            } catch (e) {
                console.warn('send-content-to-sidepanel: sidePanel.open requires a user gesture. The text has been saved. Please click the extension icon or use the context menu to open the side panel.');
            }
        }
        return;
    }

    // For all other actions, check page support
    if (!isSupported) {
        console.error('send-content-to-sidepanel: Unsupported page -', pageUrl);
        return;
    }

    // Check file access permission for file:// URLs
    if (pageUrl.startsWith('file://')) {
        const fileAccessAllowed = await checkFileAccess();
        if (!fileAccessAllowed) {
            console.error('send-content-to-sidepanel: File access is not allowed. Please enable "Allow access to file URLs" in extension settings.');
            return;
        }
    }

    if (menuItemId === CONTEXT_MENU_IDS.SEND_TO_SIDEPANEL) {
        if (info.selectionText) {
            await chrome.storage.local.set({ pendingSidepanelText: info.selectionText });
            try {
                await chrome.sidePanel.open({ windowId: tab.windowId });
            } catch (e) {
                console.warn('send-content-to-sidepanel: sidePanel.open requires a user gesture. The text has been saved. Please click the extension icon or use the context menu to open the side panel.');
            }
        }
    } else if (menuItemId === CONTEXT_MENU_IDS.SEND_LINK_TO_SIDEPANEL) {
        if (info.linkUrl) {
            await chrome.storage.local.set({ pendingSidepanelText: info.linkUrl });
            try {
                await chrome.sidePanel.open({ windowId: tab.windowId });
            } catch (e) {
                console.warn('send-content-to-sidepanel: sidePanel.open requires a user gesture. The text has been saved. Please click the extension icon or use the context menu to open the side panel.');
            }
        }
    } else if (menuItemId === CONTEXT_MENU_IDS.SEND_TO_INCOGNITO) {
        if (info.selectionText) {
            await navigateToTextInIncognito(info.selectionText);
        }
    }
});

// Find existing incognito window
async function findIncognitoWindow() {
    const windows = await chrome.windows.getAll();
    return windows.find(w => w.incognito);
}

// Navigate to text in incognito window (reuse existing or create new)
// For context menu, always use default search engine (chrome.search API) or Google fallback
async function navigateToTextInIncognito(text) {
    try {
        const trimmed = text.trim();
        // Check if it's a URL first
        if (isUrlLike(trimmed)) {
            const url = buildUrlFromText(trimmed);
            const incognitoWindow = await findIncognitoWindow();
            if (incognitoWindow) {
                await chrome.tabs.create({
                    windowId: incognitoWindow.id,
                    url: url,
                    active: true
                });
            } else {
                await chrome.windows.create({
                    incognito: true,
                    url: url,
                    type: 'normal',
                    state: 'normal'
                });
            }
        } else {
            // It's a search query - use default search engine
            // chrome.search.query() doesn't support specifying a window, so always use Google URL in incognito
            const incognitoWindow = await findIncognitoWindow();
            if (incognitoWindow) {
                await chrome.tabs.create({
                    windowId: incognitoWindow.id,
                    url: `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`,
                    active: true
                });
            } else {
                await chrome.windows.create({
                    incognito: true,
                    url: `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`,
                    type: 'normal',
                    state: 'normal'
                });
            }
        }
    } catch (e) {
        console.error('Failed to navigate in incognito:', e);
    }
}

// Handle keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'send-content-to-sidepanel') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            const pageUrl = tab.url || '';
            if (!isPageSupported(pageUrl)) {
                console.error('send-content-to-sidepanel: Unsupported page -', pageUrl);
                return;
            }
            // sidePanel.open requires a user gesture; keyboard shortcuts don't have one,
            // so wrap in try-catch to suppress the gesture error
            try {
                await chrome.sidePanel.open({ windowId: tab.windowId });
            } catch (e) {
                console.warn('send-content-to-sidepanel: sidePanel.open requires a user gesture. Please click the extension icon or use the context menu to open the side panel.');
            }
        }
    } else if (command === 'send-current-page-to-sidepanel') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            const pageUrl = tab.url || '';
            // Send current page URL - always works regardless of page support
            await chrome.storage.local.set({ pendingSidepanelText: pageUrl });
            // sidePanel.open requires a user gesture; keyboard shortcuts don't have one,
            // so wrap in try-catch to suppress the gesture error
            try {
                await chrome.sidePanel.open({ windowId: tab.windowId });
            } catch (e) {
                console.warn('send-current-page-to-sidepanel: sidePanel.open requires a user gesture. Please click the extension icon or use the context menu to open the side panel.');
            }
        }
    }
});


// Handle messages from content script and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (message.action === 'openInNewTab') {
        chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
            if (tab) {
                const trimmed = message.text.trim();
                const url = buildUrlFromText(trimmed);
                // buildUrlFromText returns null only if text is a search query (not a URL)
                // It returns a string for URLs, and also a string for search queries (Google fallback)
                // We need to distinguish: if the text matches URL patterns, use url directly;
                // otherwise, use search engine preference
                if (isUrlLike(trimmed)) {
                    chrome.tabs.create({
                        windowId: tab.windowId,
                        url: url,
                        active: true
                    });
                } else {
                    // Text is not a URL, use search engine preference
                    await openSearchInNewTab(message.text, message.searchEngine, message.customSearchUrl, tab.windowId);
                }
            }
        });
        return false;
    }


    if (message.action === 'openInIncognitoTab') {
        openInIncognitoTab(message.text, message.searchEngine, message.customSearchUrl).catch(e => console.error('openInIncognitoTab error:', e));
        return false;
    }

    if (message.action === 'checkFileAccess') {
        chrome.extension.isAllowedFileSchemeAccess((isAllowed) => {
            sendResponse({ fileAccessAllowed: isAllowed });
        });
        return true;
    }

    if (message.action === 'getCurrentTabUrl') {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) => {
            if (tab && tab.url) {
                sendResponse({ url: tab.url });
            } else {
                sendResponse({ url: null });
            }
        });
        return true;
    }

    if (message.action === 'openSearchInNewTab') {
        chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
            if (tab) {
                await openSearchInNewTab(message.text, message.searchEngine, message.customSearchUrl, tab.windowId);
            }
        });
        return false;
    }

    if (message.action === 'openSearchInIncognitoTab') {
        openSearchInIncognitoTab(message.text, message.searchEngine, message.customSearchUrl).catch(e => console.error('openSearchInIncognitoTab error:', e));
        return false;
    }

});

// Open search query in new tab using specified engine
async function openSearchInNewTab(query, searchEngine, customSearchUrl, windowId) {
    const trimmed = query.trim();
    // First check if it's a URL
    if (isUrlLike(trimmed)) {
        const url = buildUrlFromText(trimmed);
        await chrome.tabs.create({ windowId: windowId, url: url, active: true });
        return;
    }

    // It's a search query - use the specified engine
    if (searchEngine === 'default') {
        // Use chrome.search API (compliant with policy)
        await searchWithDefaultEngine(trimmed);
    } else if (searchEngine === 'custom' && customSearchUrl) {
        const searchUrl = customSearchUrl.replace('{searchTerms}', encodeURIComponent(trimmed));
        await chrome.tabs.create({ windowId: windowId, url: searchUrl, active: true });
    } else {
        const searchUrl = getSearchUrl(searchEngine, trimmed);
        if (searchUrl) {
            await chrome.tabs.create({ windowId: windowId, url: searchUrl, active: true });
        } else {
            // Fallback to default
            await searchWithDefaultEngine(trimmed);
        }
    }
}

// Open search query in incognito tab using specified engine
async function openSearchInIncognitoTab(query, searchEngine, customSearchUrl) {
    const trimmed = query.trim();
    // First check if it's a URL
    if (isUrlLike(trimmed)) {
        const url = buildUrlFromText(trimmed);
        // URL - open directly in incognito
        const incognitoWindow = await findIncognitoWindow();
        if (incognitoWindow) {
            await chrome.tabs.create({ windowId: incognitoWindow.id, url: url, active: true });
        } else {
            await chrome.windows.create({ incognito: true, url: url, type: 'normal', state: 'normal' });
        }
        return;
    }

    // It's a search query
    if (searchEngine === 'default') {
        // For incognito, chrome.search may not work reliably (opens in current window),
        // so always open in incognito window with Google search URL
        const incognitoWindow = await findIncognitoWindow();
        if (incognitoWindow) {
            await chrome.tabs.create({ windowId: incognitoWindow.id, url: `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`, active: true });
        } else {
            await chrome.windows.create({ incognito: true, url: `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`, type: 'normal', state: 'normal' });
        }
    } else if (searchEngine === 'custom' && customSearchUrl) {
        const searchUrl = customSearchUrl.replace('{searchTerms}', encodeURIComponent(trimmed));
        const incognitoWindow = await findIncognitoWindow();
        if (incognitoWindow) {
            await chrome.tabs.create({ windowId: incognitoWindow.id, url: searchUrl, active: true });
        } else {
            await chrome.windows.create({ incognito: true, url: searchUrl, type: 'normal', state: 'normal' });
        }
    } else {
        const searchUrl = getSearchUrl(searchEngine, trimmed);
        if (searchUrl) {
            const incognitoWindow = await findIncognitoWindow();
            if (incognitoWindow) {
                await chrome.tabs.create({ windowId: incognitoWindow.id, url: searchUrl, active: true });
            } else {
                await chrome.windows.create({ incognito: true, url: searchUrl, type: 'normal', state: 'normal' });
            }
        } else {
            // Fallback - use Google URL in incognito (chrome.search doesn't support window targeting)
            const incognitoWindow = await findIncognitoWindow();
            if (incognitoWindow) {
                await chrome.tabs.create({ windowId: incognitoWindow.id, url: `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`, active: true });
            } else {
                await chrome.windows.create({ incognito: true, url: `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`, type: 'normal', state: 'normal' });
            }
        }
    }
}


// Built-in search engine definitions
const SEARCH_ENGINES = {
    google: {
        name: 'Google',
        searchUrl: 'https://www.google.com/search?q={searchTerms}'
    },
    bing: {
        name: 'Bing',
        searchUrl: 'https://www.bing.com/search?q={searchTerms}'
    },
    duckduckgo: {
        name: 'DuckDuckGo',
        searchUrl: 'https://duckduckgo.com/?q={searchTerms}'
    }
    // You can add built-in search engine manually.
};

// Get search URL for a given engine ID and query text
function getSearchUrl(engineId, query) {
    const trimmed = query.trim();
    const encoded = encodeURIComponent(trimmed);

    if (engineId === 'default') {
        // Use chrome.search API - return special marker, caller must handle
        return null;
    }

    if (engineId === 'custom') {
        // Custom search engine - get URL from storage (session-only via sidepanel)
        // This is handled via message passing; fallback to default
        return null;
    }

    const engine = SEARCH_ENGINES[engineId];
    if (engine) {
        return engine.searchUrl.replace('{searchTerms}', encoded);
    }

    // Fallback to default
    return null;
}

// Perform search using chrome.search API (for default engine)
function searchWithDefaultEngine(query, disposition = 'NEW_TAB') {
    return new Promise((resolve, reject) => {
        try {
            chrome.search.query({
                text: query,
                disposition: disposition
            }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        } catch (e) {
            reject(e);
        }
    });
}

// Check if text looks like a URL (returns true for URLs, false for search queries)
function isUrlLike(text) {
    const trimmed = text.trim();
    const URL_PREFIXES = ['http://', 'https://', 'file://'];
    if (URL_PREFIXES.some(prefix => trimmed.startsWith(prefix))) {
        return true;
    }
    // Check for localhost
    if (/^localhost(:\d+)?(\/|$)/.test(trimmed) && !/\s/.test(trimmed)) {
        return true;
    }
    // Check for IPv6 loopback
    if (/^\[[0-9a-fA-F:]+\](:\d+)?(\/|$)/.test(trimmed) && !/\s/.test(trimmed)) {
        return true;
    }
    // Check for IPv4 addresses
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/|$)/.test(trimmed) && !/\s/.test(trimmed)) {
        return true;
    }
    // Check for common domain patterns
    if (/^[a-zA-Z0-9][-a-zA-Z0-9]*(\.[a-zA-Z0-9][-a-zA-Z0-9]*)*\.[a-zA-Z]{2,}(\/|$)/.test(trimmed) && !/\s/.test(trimmed)) {
        return true;
    }
    return false;
}

// Build URL from text - if it looks like a URL, use it directly; otherwise do a search
function buildUrlFromText(text) {
    const trimmed = text.trim();
    // Check if text looks like a URL (ftp is no longer directly accessible in modern browsers, treat as search)
    // Also, regarding file urls, for some reasons, currently only urls starting with file:// are supported. You can add the starting urls supported by your browser by yourself.
    const URL_PREFIXES = ['http://', 'https://', 'file://'];
    if (URL_PREFIXES.some(prefix => trimmed.startsWith(prefix))) {
        return trimmed;
    }
    // Check for localhost (e.g. localhost, localhost:7777, localhost:8080/path)
    if (/^localhost(:\d+)?(\/|$)/.test(trimmed) && !/\s/.test(trimmed)) {
        return `http://${trimmed}`;
    }
    // Check for IPv6 loopback and other IPv6 addresses (e.g. [::1], [::1]:7777)
    if (/^\[[0-9a-fA-F:]+\](:\d+)?(\/|$)/.test(trimmed) && !/\s/.test(trimmed)) {
        return `http://${trimmed}`;
    }
    // Check for IPv4 addresses (e.g. 127.0.0.1, 192.168.1.1:8080)
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/|$)/.test(trimmed) && !/\s/.test(trimmed)) {
        return `http://${trimmed}`;
    }
    // Check for common domain patterns like "example.com", "www.example.com", "sub.domain.example.com"
    if (/^[a-zA-Z0-9][-a-zA-Z0-9]*(\.[a-zA-Z0-9][-a-zA-Z0-9]*)*\.[a-zA-Z]{2,}(\/|$)/.test(trimmed) && !/\s/.test(trimmed)) {
        return `https://${trimmed}`;
    }
    // Default: search
    // Due to browser limit like Google Chrome, you need to set up the address manually.
    // Note: This is a fallback; the side panel now sends search engine preference with the request.
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}


// Open text in incognito tab (from side panel)
async function openInIncognitoTab(text, searchEngine, customSearchUrl) {
    try {
        const trimmed = text.trim();

        if (isUrlLike(trimmed)) {
            // It's a URL - open directly
            const url = buildUrlFromText(trimmed);
            const incognitoWindow = await findIncognitoWindow();
            if (incognitoWindow) {
                await chrome.tabs.create({
                    windowId: incognitoWindow.id,
                    url: url,
                    active: true
                });
            } else {
                await chrome.windows.create({
                    incognito: true,
                    url: url,
                    type: 'normal',
                    state: 'normal'
                });
            }
        } else {
            // It's a search query - use openSearchInIncognitoTab
            await openSearchInIncognitoTab(text, searchEngine, customSearchUrl);
        }
    } catch (e) {
        console.error('Failed to open in incognito tab:', e);
    }
}


// Initialize on install/update
chrome.runtime.onInstalled.addListener(async (details) => {
    // Set default settings
    const { contextMenuEnabled } = await chrome.storage.local.get('contextMenuEnabled');
    if (contextMenuEnabled === undefined) {
        await chrome.storage.local.set({ contextMenuEnabled: true });
    }

    // Default retainTextEnabled to false (opt-in feature)
    const { retainTextEnabled } = await chrome.storage.local.get('retainTextEnabled');
    if (retainTextEnabled === undefined) {
        await chrome.storage.local.set({ retainTextEnabled: false });
    }

    // Default incognitoEnabled to false (opt-in feature)
    const { incognitoEnabled } = await chrome.storage.local.get('incognitoEnabled');
    if (incognitoEnabled === undefined) {
        await chrome.storage.local.set({ incognitoEnabled: false });
    }

    // Enable click extension icon to open side panel
    try {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (e) {
        console.error('Failed to set panel behavior:', e);
    }

    await createContextMenus();

    // Open help page on first install
    if (details.reason === 'install') {
        try {
            await chrome.tabs.create({ url: chrome.runtime.getURL('help.html') });
        } catch (e) {
            console.error('Failed to open help page:', e);
        }
    }
});


// Recreate context menus on startup
chrome.runtime.onStartup.addListener(async () => {
    await createContextMenus();
});

// Listen for storage changes to update context menus
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.contextMenuEnabled || changes.closeSidepanelEnabled || changes.incognitoEnabled)) {
        createContextMenus();
    }
});

