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

// i18n helper
function getMessage(messageName) {
    return chrome.i18n.getMessage(messageName) || messageName;
}

// Localize all elements with __MSG_ placeholders
function localizePage() {
    document.querySelectorAll('[placeholder]').forEach(el => {
        const placeholder = el.getAttribute('placeholder');
        if (placeholder && placeholder.startsWith('__MSG_')) {
            const msgName = placeholder.replace('__MSG_', '').replace('__', '');
            el.setAttribute('placeholder', getMessage(msgName));
        }
    });

    document.querySelectorAll('[title]').forEach(el => {
        const title = el.getAttribute('title');
        if (title && title.startsWith('__MSG_')) {
            const msgName = title.replace('__MSG_', '').replace('__', '');
            el.setAttribute('title', getMessage(msgName));
        }
    });

    document.querySelectorAll('div, span, h3, label').forEach(el => {
        if (el.childNodes.length === 1 && el.childNodes[0].nodeType === Node.TEXT_NODE) {
            const text = el.textContent.trim();
            if (text.startsWith('__MSG_')) {
                const msgName = text.replace('__MSG_', '').replace('__', '');
                el.textContent = getMessage(msgName);
            }
        }
    });
}

// DOM Elements
const textInput = document.getElementById('textInput');
const openTabBtn = document.getElementById('openTabBtn');
const openIncognitoBtn = document.getElementById('openIncognitoBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const contextMenuToggle = document.getElementById('contextMenuToggle');
const retainTextToggle = document.getElementById('retainTextToggle');
const incognitoWarning = document.getElementById('incognitoWarning');
const fileAccessWarning = document.getElementById('fileAccessWarning');
const emptyTextError = document.getElementById('emptyTextError');
const stagedTextButtons = document.getElementById('stagedTextButtons');
const saveStagedBtn = document.getElementById('saveStagedBtn');
const loadStagedBtn = document.getElementById('loadStagedBtn');
const clearTextBtn = document.getElementById('clearTextBtn');
const getCurrentUrlBtn = document.getElementById('getCurrentUrlBtn');

// State
let isSidePanelInIncognito = false;
let errorTimer = null;
let retainTextEnabled = false;

// Show a brief status message at the bottom of the panel
function showStatusMessage(message) {
    // Remove existing status message if any
    const existing = document.querySelector('.status-message');
    if (existing) {
        existing.remove();
    }

    const statusEl = document.createElement('div');
    statusEl.className = 'status-message show';
    statusEl.textContent = message;
    document.body.appendChild(statusEl);

    setTimeout(() => {
        statusEl.classList.remove('show');
        setTimeout(() => statusEl.remove(), 300);
    }, 2000);
}

// Update staged text buttons visibility and state
async function updateStagedButtons() {
    if (!stagedTextButtons || !saveStagedBtn || !loadStagedBtn) return;

    if (retainTextEnabled) {
        stagedTextButtons.classList.remove('hidden');

        // Save button: enabled only if textarea has content
        saveStagedBtn.disabled = !textInput.value.trim();

        // Load button: enabled only if retainedText exists in storage
        try {
            const { retainedText } = await chrome.storage.local.get('retainedText');
            loadStagedBtn.disabled = !retainedText;
        } catch (e) {
            loadStagedBtn.disabled = true;
        }
    } else {
        stagedTextButtons.classList.add('hidden');
    }
}

// Check if extension has incognito access by trying to find incognito windows
async function checkIncognitoAccess() {
    try {
        const windows = await chrome.windows.getAll();
        const hasIncognitoWindows = windows.some(w => w.incognito);
        // If we can see incognito windows, access is enabled
        return hasIncognitoWindows;
    } catch (e) {
        return false;
    }
}

// Initialize
async function init() {
    localizePage();

    // Detect if side panel is open in an incognito window
    try {
        const currentWindow = await chrome.windows.getCurrent();
        isSidePanelInIncognito = currentWindow.incognito === true;
    } catch (e) {
        console.error('Failed to detect window type:', e);
    }

    // Check incognito access and show warning if needed
    if (!isSidePanelInIncognito) {
        const hasAccess = await checkIncognitoAccess();
        if (!hasAccess) {
            incognitoWarning.classList.remove('hidden');
        }
    }

    // Check file access and show warning only if current tab is a file:// URL
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url && tab.url.startsWith('file://')) {
            const response = await chrome.runtime.sendMessage({ action: 'checkFileAccess' });
            if (response && !response.fileAccessAllowed) {
                fileAccessWarning.classList.remove('hidden');
            }
        }
    } catch (e) {
        console.error('Failed to check file access:', e);
    }

    // Load settings
    try {
        const { contextMenuEnabled } = await chrome.storage.local.get('contextMenuEnabled');
        contextMenuToggle.checked = contextMenuEnabled !== false;
    } catch (e) {
        console.error('Failed to load settings:', e);
    }

    // Load retain text setting
    try {
        const { retainTextEnabled: storedRetainText } = await chrome.storage.local.get('retainTextEnabled');
        retainTextEnabled = storedRetainText === true;
        if (retainTextToggle) {
            retainTextToggle.checked = retainTextEnabled;
        }
    } catch (e) {
        console.error('Failed to load retain text setting:', e);
    }

    // Load pending text from storage (context menu sends)
    let hasPendingText = false;
    try {
        const { pendingSidepanelText } = await chrome.storage.local.get('pendingSidepanelText');
        if (pendingSidepanelText) {
            textInput.value = pendingSidepanelText;
            await chrome.storage.local.remove('pendingSidepanelText');
            hasPendingText = true;
        }
    } catch (e) {
        console.error('Failed to load pending text:', e);
    }

    // Update staged buttons visibility and state
    await updateStagedButtons();

    // Update clear button state
    updateClearButtonState();

    // Update incognito button state
    updateIncognitoButtonState();
}

// Update incognito button state
function updateIncognitoButtonState() {
    if (isSidePanelInIncognito) {
        openIncognitoBtn.disabled = true;
        openIncognitoBtn.title = getMessage('incognitoDisabledHint');
    } else {
        openIncognitoBtn.disabled = false;
        openIncognitoBtn.title = getMessage('sidePanelOpenIncognito');
    }
}

// Hide all error messages
function hideAllErrors() {
    emptyTextError.classList.add('hidden');
}

// Show error message with auto-hide
function showError(element) {
    hideAllErrors();
    element.classList.remove('hidden');
    // Clear any existing timer
    if (errorTimer) {
        clearTimeout(errorTimer);
    }
    // Auto-hide after 3 seconds
    errorTimer = setTimeout(() => {
        element.classList.add('hidden');
        errorTimer = null;
    }, 3000);
}

// Validate text input, returns true if valid
function validateText(text) {
    if (!text) {
        console.warn('No text entered');
        showError(emptyTextError);
        return false;
    }
    return true;
}

// Open in new tab
openTabBtn.addEventListener('click', async () => {
    const text = textInput.value.trim();
    if (!validateText(text)) return;

    try {
        await chrome.runtime.sendMessage({
            action: 'openInNewTab',
            text: text
        });
    } catch (e) {
        console.error('Failed to open in new tab:', e);
    }
});

// Open in incognito tab
openIncognitoBtn.addEventListener('click', async () => {
    if (isSidePanelInIncognito) return;

    const text = textInput.value.trim();
    if (!validateText(text)) return;

    try {
        await chrome.runtime.sendMessage({
            action: 'openInIncognitoTab',
            text: text
        });
    } catch (e) {
        console.error('Failed to open in incognito tab:', e);
    }
});

// Settings panel
settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.remove('hidden');
    // Force reflow for animation
    void settingsPanel.offsetWidth;
    settingsPanel.classList.add('open');
});

closeSettingsBtn.addEventListener('click', () => {
    settingsPanel.classList.remove('open');
    setTimeout(() => {
        settingsPanel.classList.add('hidden');
    }, 250);
});

// Context menu toggle - auto save
contextMenuToggle.addEventListener('change', async () => {
    const enabled = contextMenuToggle.checked;
    try {
        await chrome.storage.local.set({ contextMenuEnabled: enabled });
    } catch (e) {
        console.error('Failed to save setting:', e);
    }
});

// Retain text toggle - auto save
if (retainTextToggle) {
    retainTextToggle.addEventListener('change', async () => {
        retainTextEnabled = retainTextToggle.checked;
        try {
            await chrome.storage.local.set({ retainTextEnabled: retainTextEnabled });
            // If disabling, clear saved text
            if (!retainTextEnabled) {
                await chrome.storage.local.remove('retainedText');
            }
        } catch (e) {
            console.error('Failed to save retain text setting:', e);
        }
        // Update staged buttons visibility and state
        await updateStagedButtons();
    });
}

// Save staged text button
saveStagedBtn.addEventListener('click', async () => {
    const text = textInput.value.trim();
    if (!text) return;

    try {
        await chrome.storage.local.set({ retainedText: text });
        showStatusMessage(getMessage('stagedTextSaved'));
        await updateStagedButtons();
    } catch (e) {
        console.error('Failed to save staged text:', e);
    }
});

// Load staged text button
loadStagedBtn.addEventListener('click', async () => {
    try {
        const { retainedText } = await chrome.storage.local.get('retainedText');
        if (retainedText) {
            textInput.value = retainedText;
            showStatusMessage(getMessage('stagedTextLoaded'));
            updateClearButtonState();
            await updateStagedButtons();
        }
    } catch (e) {
        console.error('Failed to load staged text:', e);
    }
});

// Update clear button state based on text content
function updateClearButtonState() {
    if (clearTextBtn) {
        clearTextBtn.disabled = !textInput.value.trim();
    }
}

// Clear text button
if (clearTextBtn) {
    clearTextBtn.addEventListener('click', () => {
        textInput.value = '';
        updateClearButtonState();
        updateStagedButtons();
        textInput.focus();
    });
}

// Get current page URL button
if (getCurrentUrlBtn) {
    getCurrentUrlBtn.addEventListener('click', async () => {
        try {
            // Send message to background script to get the current tab URL
            // (side panel doesn't have direct tabs access)
            const response = await chrome.runtime.sendMessage({ action: 'getCurrentTabUrl' });
            if (response && response.url) {
                textInput.value = response.url;
                updateClearButtonState();
                updateStagedButtons();
                showStatusMessage(getMessage('currentUrlLoaded'));
            }
        } catch (e) {
            console.error('Failed to get current URL:', e);
        }
    });
}

// Update button states when text changes
textInput.addEventListener('input', () => {
    updateClearButtonState();
    if (retainTextEnabled && saveStagedBtn) {
        saveStagedBtn.disabled = !textInput.value.trim();
    }
});

// Keyboard shortcut: Ctrl+Enter or Cmd+Enter to open in new tab
textInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        openTabBtn.click();
    }
});

// Listen for storage changes to update text when sent from context menu
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.pendingSidepanelText) {
        const newText = changes.pendingSidepanelText.newValue;
        if (newText) {
            textInput.value = newText;
            // Clear the pending text so it doesn't get loaded again on refresh
            chrome.storage.local.remove('pendingSidepanelText');
            // Update button states
            updateClearButtonState();
            updateStagedButtons();
        }
    }
});

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
