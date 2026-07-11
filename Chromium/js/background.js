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

        // First items: Open/Close side panel (always visible, no page restriction)
        chrome.contextMenus.create({
            id: CONTEXT_MENU_IDS.OPEN_SIDEPANEL,
            title: chrome.i18n.getMessage('contextMenuOpenSidepanel'),
            contexts: ['all'],
            documentUrlPatterns: ['<all_urls>']
        });
        chrome.contextMenus.create({
            id: CONTEXT_MENU_IDS.CLOSE_SIDEPANEL,
            title: chrome.i18n.getMessage('contextMenuCloseSidepanel'),
            contexts: ['all'],
            documentUrlPatterns: ['<all_urls>']
        });

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

        // Send selected text to side panel (only on supported pages)
        chrome.contextMenus.create({
            id: CONTEXT_MENU_IDS.SEND_TO_SIDEPANEL,
            title: chrome.i18n.getMessage('contextMenuSendToSidepanel'),
            contexts: ['selection'],
            documentUrlPatterns: ['<all_urls>']
        });

        // Send link content to side panel (only on supported pages)
        chrome.contextMenus.create({
            id: CONTEXT_MENU_IDS.SEND_LINK_TO_SIDEPANEL,
            title: chrome.i18n.getMessage('contextMenuSendLinkToSidepanel'),
            contexts: ['link'],
            documentUrlPatterns: ['<all_urls>']
        });

        // Send selected text to incognito window (only on supported pages)
        chrome.contextMenus.create({
            id: CONTEXT_MENU_IDS.SEND_TO_INCOGNITO,
            title: chrome.i18n.getMessage('contextMenuSendToIncognito'),
            contexts: ['selection'],
            documentUrlPatterns: ['<all_urls>']
        });
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
            await chrome.storage.local.set({ pendingSidepanelText: pageUrl });
            await chrome.sidePanel.open({ windowId: tab.windowId });
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
            await chrome.sidePanel.open({ windowId: tab.windowId });
        }
    } else if (menuItemId === CONTEXT_MENU_IDS.SEND_LINK_TO_SIDEPANEL) {
        if (info.linkUrl) {
            await chrome.storage.local.set({ pendingSidepanelText: info.linkUrl });
            await chrome.sidePanel.open({ windowId: tab.windowId });
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
async function navigateToTextInIncognito(text) {
    try {
        const incognitoWindow = await findIncognitoWindow();
        const url = buildUrlFromText(text);

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
            await chrome.sidePanel.open({ windowId: tab.windowId });
        }
    } else if (command === 'send-current-page-to-sidepanel') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            const pageUrl = tab.url || '';
            // Send current page URL - always works regardless of page support
            await chrome.storage.local.set({ pendingSidepanelText: pageUrl });
            await chrome.sidePanel.open({ windowId: tab.windowId });
        }
    }
});

// Handle messages from content script and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (message.action === 'openInNewTab') {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (tab) {
                chrome.tabs.create({
                    windowId: tab.windowId,
                    url: buildUrlFromText(message.text),
                    active: true
                });
            }
        });
    }

    if (message.action === 'openInIncognitoTab') {
        openInIncognitoTab(message.text).catch(e => console.error('openInIncognitoTab error:', e));
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

});

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
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

// Open text in incognito tab (from side panel)
async function openInIncognitoTab(text) {
    try {
        const incognitoWindow = await findIncognitoWindow();
        const url = buildUrlFromText(text);

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

    // Enable click extension icon to open side panel
    try {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (e) {
        console.error('Failed to set panel behavior:', e);
    }

    await createContextMenus();
});

// Recreate context menus on startup
chrome.runtime.onStartup.addListener(async () => {
    await createContextMenus();
});

// Listen for storage changes to update context menus
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.contextMenuEnabled) {
        createContextMenus();
    }
});
