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

// Convert markdown syntax to HTML tags
// Supports: **bold** and <code>inline code</code>
function renderMarkdown(text) {
    // Convert <code>...</code> first (to avoid conflicts)
    text = text.replace(/<code>(.+?)<\/code>/g, '<code>$1</code>');
    // Convert **bold** to <strong> tags
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return text;
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

    // Only localize title attributes for helpBtn and settingsBtn (keep tooltips for these two)
    document.querySelectorAll('[title]').forEach(el => {
        const title = el.getAttribute('title');
        if (title && title.startsWith('__MSG_')) {
            // Only set tooltip for help button and settings button
            if (el.id === 'helpBtn' || el.id === 'settingsBtn') {
                const msgName = title.replace('__MSG_', '').replace('__', '');
                el.setAttribute('title', getMessage(msgName));
            } else {
                // Remove title attribute from all other elements to suppress tooltips
                el.removeAttribute('title');
            }
        }
    });

    document.querySelectorAll('div, span, h3, h4, label, p, button, a, .setting-note, .setting-error').forEach(el => {
        if (el.childNodes.length === 1 && el.childNodes[0].nodeType === Node.TEXT_NODE) {
            const text = el.textContent.trim();
            if (text.startsWith('__MSG_')) {
                const msgName = text.replace('__MSG_', '').replace('__', '');
                const translated = getMessage(msgName);
                // Check if the translated text contains markdown syntax
                if (translated.includes('**') || translated.includes('<code>')) {
                    el.innerHTML = renderMarkdown(translated);
                } else {
                    el.textContent = translated;
                }
            }
        }
    });

    // Localize select option text
    document.querySelectorAll('select option').forEach(el => {
        const text = el.textContent.trim();
        if (text.startsWith('__MSG_')) {
            const msgName = text.replace('__MSG_', '').replace('__', '');
            el.textContent = getMessage(msgName);
        }
    });
}

// DOM Elements
const textInput = document.getElementById('textInput');
const openTabBtn = document.getElementById('openTabBtn');
const openIncognitoBtn = document.getElementById('openIncognitoBtn');
const helpBtn = document.getElementById('helpBtn');
const helpPanel = document.getElementById('helpPanel');
const closeHelpBtn = document.getElementById('closeHelpBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const contextMenuToggle = document.getElementById('contextMenuToggle');
const closeSidepanelMenuToggle = document.getElementById('closeSidepanelMenuToggle');
const closeSidepanelMenuItem = document.getElementById('closeSidepanelMenuItem');
const retainTextToggle = document.getElementById('retainTextToggle');
const incognitoToggle = document.getElementById('incognitoToggle');
const resetSettingsItem = document.getElementById('resetSettingsItem');
const resetSettingsConfirmArea = document.getElementById('resetSettingsConfirmArea');
const resetSettingsConfirmBtn = document.getElementById('resetSettingsConfirmBtn');
const clearRetainedTextItem = document.getElementById('clearRetainedTextItem');
const clearRetainedTextConfirmArea = document.getElementById('clearRetainedTextConfirmArea');
const clearRetainedTextConfirmBtn = document.getElementById('clearRetainedTextConfirmBtn');
const clearRetainedTextCancelBtn = document.getElementById('clearRetainedTextCancelBtn');

const fileAccessWarning = document.getElementById('fileAccessWarning');
const emptyTextError = document.getElementById('emptyTextError');
const stagedTextButtons = document.getElementById('stagedTextButtons');
const saveStagedBtn = document.getElementById('saveStagedBtn');
const loadStagedBtn = document.getElementById('loadStagedBtn');
const clearTextBtn = document.getElementById('clearTextBtn');
const copyTextBtn = document.getElementById('copyTextBtn');
const getCurrentUrlBtn = document.getElementById('getCurrentUrlBtn');

// Search engine DOM elements
const searchEngineToggle = document.getElementById('searchEngineToggle');
const searchEngineSettingsArea = document.getElementById('searchEngineSettingsArea');
const searchEngineSelect = document.getElementById('searchEngineSelect');
const customSearchEngineRow = document.getElementById('customSearchEngineRow');
const customSearchEngineInput = document.getElementById('customSearchEngineInput');
const customSearchEngineError = document.getElementById('customSearchEngineError');
const saveCustomSearchUrlBtn = document.getElementById('saveCustomSearchUrlBtn');
const savedUrlLinkRow = document.getElementById('savedUrlLinkRow');
const savedUrlLink = document.getElementById('savedUrlLink');

// State
let isSidePanelInIncognito = false;
let errorTimer = null;
let retainTextEnabled = false;

// Search engine state (session-only, resets when side panel is closed)
let searchEngineEnabled = false; // Master toggle, defaults to off
let currentSearchEngine = 'default'; // Currently selected engine in UI (may not be saved yet)
let currentCustomSearchUrl = ''; // Currently entered custom URL in UI (may not be saved yet)
let savedSearchEngine = 'default'; // Last confirmed engine selection
let savedCustomSearchUrl = ''; // Last confirmed custom URL (via save button)


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

    // Load close sidepanel menu setting
    try {
        const { closeSidepanelEnabled } = await chrome.storage.local.get('closeSidepanelEnabled');
        if (closeSidepanelMenuToggle) {
            closeSidepanelMenuToggle.checked = closeSidepanelEnabled !== false;
        }
    } catch (e) {
        console.error('Failed to load close sidepanel menu setting:', e);
    }

    // Update close sidepanel menu item disabled state based on context menu toggle
    updateCloseSidepanelMenuItemState();

    // Load incognito enabled setting
    try {
        const { incognitoEnabled } = await chrome.storage.local.get('incognitoEnabled');
        if (incognitoToggle) {
            incognitoToggle.checked = incognitoEnabled === true;
        }
    } catch (e) {
        console.error('Failed to load incognito setting:', e);
    }

    // Update incognito button visibility based on setting
    updateIncognitoButtonVisibility();

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

    // Update clear retained text item visibility
    await updateClearRetainedTextItemVisibility();

    // Update clear button state
    updateClearButtonState();

    // Initialize search engine settings (session-only, defaults to 'default')
    initSearchEngineSettings();

    // Update incognito button state
    updateIncognitoButtonState();
}

// Validate custom search engine URL
function isValidSearchUrl(url) {
    if (!url || typeof url !== 'string') return false;
    // Must contain {searchTerms} placeholder
    if (!url.includes('{searchTerms}')) return false;
    // Must be a valid URL (http or https)
    try {
        const testUrl = url.replace('{searchTerms}', 'test');
        const parsed = new URL(testUrl);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (e) {
        return false;
    }
}

// Initialize search engine settings (session-only, resets when side panel is closed)
async function initSearchEngineSettings() {
    // Reset to default every time side panel opens (session-only)
    searchEngineEnabled = false;
    currentSearchEngine = 'default';
    currentCustomSearchUrl = '';
    savedSearchEngine = 'default';
    savedCustomSearchUrl = '';

    // Load saved custom search engine URL from storage (if any)
    try {
        const { savedCustomSearchUrl: storedUrl } = await chrome.storage.local.get('savedCustomSearchUrl');
        if (storedUrl) {
            savedCustomSearchUrl = storedUrl;
        }
    } catch (e) {
        console.error('Failed to load saved custom search URL:', e);
    }

    if (searchEngineToggle) {
        searchEngineToggle.checked = false;
    }
    if (searchEngineSettingsArea) {
        searchEngineSettingsArea.classList.add('hidden');
    }
    if (searchEngineSelect) {
        searchEngineSelect.value = 'default';
    }
    if (customSearchEngineRow) {
        customSearchEngineRow.classList.add('hidden');
    }
    if (customSearchEngineError) {
        customSearchEngineError.classList.add('hidden');
    }
    if (saveCustomSearchUrlBtn) {
        saveCustomSearchUrlBtn.disabled = true;
    }
    // Show "load saved URL" link if there's a saved custom URL
    updateSavedUrlLinkVisibility();
}

// Update the "load saved URL" link visibility based on savedCustomSearchUrl
function updateSavedUrlLinkVisibility() {
    if (savedUrlLinkRow && savedCustomSearchUrl) {
        savedUrlLinkRow.classList.remove('hidden');
    } else if (savedUrlLinkRow) {
        savedUrlLinkRow.classList.add('hidden');
    }
}

// Apply saved search engine settings to UI (when opening settings panel)
function applySavedSearchEngineSettings() {
    currentSearchEngine = savedSearchEngine;
    currentCustomSearchUrl = savedCustomSearchUrl;
    searchEngineSelect.value = savedSearchEngine;

    if (savedSearchEngine === 'custom') {
        customSearchEngineRow.classList.remove('hidden');
        if (customSearchEngineInput) {
            customSearchEngineInput.value = savedCustomSearchUrl;
        }
        // If there's a saved URL, disable save button (already saved)
        if (saveCustomSearchUrlBtn) {
            saveCustomSearchUrlBtn.disabled = !!savedCustomSearchUrl;
        }
        customSearchEngineError.classList.add('hidden');
    } else {
        customSearchEngineRow.classList.add('hidden');
        customSearchEngineError.classList.add('hidden');
        if (customSearchEngineInput) {
            customSearchEngineInput.value = '';
        }
        if (saveCustomSearchUrlBtn) {
            saveCustomSearchUrlBtn.disabled = true;
        }
    }
    // Update saved URL link visibility
    updateSavedUrlLinkVisibility();
}

// Revert to saved settings if current edits are invalid/unsaved
function revertToSavedSearchEngineSettings() {
    // If custom is selected but URL is empty, invalid, or not saved, revert to saved
    if (currentSearchEngine === 'custom') {
        const url = customSearchEngineInput ? customSearchEngineInput.value.trim() : '';
        if (!url || !isValidSearchUrl(url) || url !== savedCustomSearchUrl) {
            // Revert to saved
            currentSearchEngine = savedSearchEngine;
            currentCustomSearchUrl = savedCustomSearchUrl;
            searchEngineSelect.value = savedSearchEngine;

            if (savedSearchEngine === 'custom' && savedCustomSearchUrl) {
                customSearchEngineRow.classList.remove('hidden');
                if (customSearchEngineInput) {
                    customSearchEngineInput.value = savedCustomSearchUrl;
                }
                if (saveCustomSearchUrlBtn) {
                    saveCustomSearchUrlBtn.disabled = true;
                }
                customSearchEngineError.classList.add('hidden');
            } else {
                customSearchEngineRow.classList.add('hidden');
                customSearchEngineError.classList.add('hidden');
                if (customSearchEngineInput) {
                    customSearchEngineInput.value = '';
                }
                if (saveCustomSearchUrlBtn) {
                    saveCustomSearchUrlBtn.disabled = true;
                }
            }
            // Update saved URL link visibility after revert
            updateSavedUrlLinkVisibility();
        }
    }
}

// Handle search engine master toggle
if (searchEngineToggle) {
    searchEngineToggle.addEventListener('change', () => {
        searchEngineEnabled = searchEngineToggle.checked;
        if (searchEngineEnabled) {
            searchEngineSettingsArea.classList.remove('hidden');
            // Restore saved settings when opening
            applySavedSearchEngineSettings();
        } else {
            searchEngineSettingsArea.classList.add('hidden');
            // Reset to default when disabled
            currentSearchEngine = 'default';
            currentCustomSearchUrl = '';
            searchEngineSelect.value = 'default';
            customSearchEngineRow.classList.add('hidden');
            customSearchEngineError.classList.add('hidden');
            if (customSearchEngineInput) {
                customSearchEngineInput.value = '';
            }
            if (saveCustomSearchUrlBtn) {
                saveCustomSearchUrlBtn.disabled = true;
            }
        }
    });
}

// Handle search engine selection change
if (searchEngineSelect) {
    searchEngineSelect.addEventListener('change', () => {
        const selected = searchEngineSelect.value;
        currentSearchEngine = selected;

        if (selected === 'custom') {
            customSearchEngineRow.classList.remove('hidden');
            // Focus the input
            setTimeout(() => customSearchEngineInput.focus(), 100);
            // Disable save button until valid URL is entered
            if (saveCustomSearchUrlBtn) {
                saveCustomSearchUrlBtn.disabled = true;
            }
            // If there's a saved custom URL, pre-fill it
            if (savedCustomSearchUrl) {
                customSearchEngineInput.value = savedCustomSearchUrl;
                saveCustomSearchUrlBtn.disabled = true;
            }
        } else {
            customSearchEngineRow.classList.add('hidden');
            customSearchEngineError.classList.add('hidden');
            // Immediately save non-custom selections
            savedSearchEngine = selected;
            // Don't clear savedCustomSearchUrl - it's persisted in storage
            // Only clear the current editing state
            currentCustomSearchUrl = '';
        }
    });
}

// Handle custom search engine URL input - enable/disable save button based on validity
if (customSearchEngineInput) {
    customSearchEngineInput.addEventListener('input', () => {
        customSearchEngineError.classList.add('hidden');
        const url = customSearchEngineInput.value.trim();
        if (saveCustomSearchUrlBtn) {
            // Enable save button only if URL is valid AND different from saved
            saveCustomSearchUrlBtn.disabled = !(isValidSearchUrl(url) && url !== savedCustomSearchUrl);
        }
    });
}

// Handle "load saved URL" link click
if (savedUrlLink) {
    savedUrlLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (savedCustomSearchUrl) {
            // Select "custom" option
            searchEngineSelect.value = 'custom';
            currentSearchEngine = 'custom';
            // Show custom search row
            customSearchEngineRow.classList.remove('hidden');
            // Fill in the saved URL
            customSearchEngineInput.value = savedCustomSearchUrl;
            // Disable save button (already saved)
            saveCustomSearchUrlBtn.disabled = true;
            customSearchEngineError.classList.add('hidden');
            // Focus the input
            setTimeout(() => customSearchEngineInput.focus(), 100);
        }
    });
}

// Handle save custom search engine URL button
if (saveCustomSearchUrlBtn) {
    saveCustomSearchUrlBtn.addEventListener('click', async () => {
        const url = customSearchEngineInput.value.trim();
        if (!url) {
            return;
        }

        if (isValidSearchUrl(url)) {
            currentCustomSearchUrl = url;
            savedCustomSearchUrl = url;
            savedSearchEngine = 'custom';
            customSearchEngineError.classList.add('hidden');
            saveCustomSearchUrlBtn.disabled = true;
            // Save to storage for persistence across side panel sessions
            try {
                await chrome.storage.local.set({ savedCustomSearchUrl: url });
            } catch (e) {
                console.error('Failed to save custom search URL:', e);
            }
            showStatusMessage(getMessage('searchEngineCustomUrlSaved'));
        } else {
            customSearchEngineError.classList.remove('hidden');
            currentCustomSearchUrl = '';
        }
    });
}

// Update incognito button state
function updateIncognitoButtonState() {
    if (isSidePanelInIncognito) {
        openIncognitoBtn.disabled = true;
        openIncognitoBtn.title = getMessage('incognitoDisabledHint');
    } else {
        openIncognitoBtn.disabled = false;
        openIncognitoBtn.removeAttribute('title');
    }
}

// Update incognito button visibility based on incognitoEnabled setting
function updateIncognitoButtonVisibility() {
    if (!openIncognitoBtn) return;
    // Check if incognito features are enabled
    const incognitoEnabled = incognitoToggle ? incognitoToggle.checked : false;
    if (incognitoEnabled) {
        openIncognitoBtn.classList.remove('hidden');
    } else {
        openIncognitoBtn.classList.add('hidden');
    }
}

// Incognito toggle - auto save
if (incognitoToggle) {
    incognitoToggle.addEventListener('change', async () => {
        const enabled = incognitoToggle.checked;
        try {
            await chrome.storage.local.set({ incognitoEnabled: enabled });
        } catch (e) {
            console.error('Failed to save incognito setting:', e);
        }
        // Update incognito button visibility
        updateIncognitoButtonVisibility();
    });
}

// Reset settings - click to show confirm area
if (resetSettingsItem) {
    resetSettingsItem.addEventListener('click', () => {
        if (resetSettingsConfirmArea) {
            resetSettingsConfirmArea.classList.remove('hidden');
        }
    });
}

// Reset settings confirm button
if (resetSettingsConfirmBtn) {
    resetSettingsConfirmBtn.addEventListener('click', async () => {
        try {
            // Clear all storage
            await chrome.storage.local.clear();
            // Set default values
            await chrome.storage.local.set({
                contextMenuEnabled: true,
                closeSidepanelEnabled: true,
                retainTextEnabled: false,
                incognitoEnabled: false
            });
            // Reload settings in UI
            if (contextMenuToggle) contextMenuToggle.checked = true;
            if (closeSidepanelMenuToggle) closeSidepanelMenuToggle.checked = true;
            if (retainTextToggle) retainTextToggle.checked = false;
            if (incognitoToggle) incognitoToggle.checked = false;
            retainTextEnabled = false;
            // Update UI states
            updateCloseSidepanelMenuItemState();
            updateIncognitoButtonVisibility();
            await updateStagedButtons();
            // Update clear retained text item visibility (retainedText was cleared)
            await updateClearRetainedTextItemVisibility();
            // Hide confirm area
            if (resetSettingsConfirmArea) {
                resetSettingsConfirmArea.classList.add('hidden');
            }
            showStatusMessage(getMessage('settingsResetSuccess'));
        } catch (e) {
            console.error('Failed to reset settings:', e);
        }
    });
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

// Open in new tab (with search engine preference if enabled)
openTabBtn.addEventListener('click', async () => {
    const text = textInput.value.trim();
    if (!validateText(text)) return;

    const message = {
        action: 'openInNewTab',
        text: text
    };

    // Only pass search engine params if the master toggle is enabled
    if (searchEngineEnabled) {
        message.searchEngine = currentSearchEngine;
        message.customSearchUrl = currentCustomSearchUrl;
    }

    try {
        await chrome.runtime.sendMessage(message);
    } catch (e) {
        console.error('Failed to open in new tab:', e);
    }
});

// Open in incognito tab (with search engine preference if enabled)
openIncognitoBtn.addEventListener('click', async () => {
    if (isSidePanelInIncognito) return;

    const text = textInput.value.trim();
    if (!validateText(text)) return;

    const message = {
        action: 'openInIncognitoTab',
        text: text
    };

    // Only pass search engine params if the master toggle is enabled
    if (searchEngineEnabled) {
        message.searchEngine = currentSearchEngine;
        message.customSearchUrl = currentCustomSearchUrl;
    }

    try {
        await chrome.runtime.sendMessage(message);
        showStatusMessage(getMessage('incognitoTabOpened'));
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
    // Revert to saved settings if custom URL is invalid/unsaved
    revertToSavedSearchEngineSettings();
    // Hide reset settings confirm area
    if (resetSettingsConfirmArea) {
        resetSettingsConfirmArea.classList.add('hidden');
    }
    // Hide clear retained text confirm area
    if (clearRetainedTextConfirmArea) {
        clearRetainedTextConfirmArea.classList.add('hidden');
    }
    settingsPanel.classList.remove('open');
    setTimeout(() => {
        settingsPanel.classList.add('hidden');
    }, 250);
});

// Help panel
helpBtn.addEventListener('click', () => {
    helpPanel.classList.remove('hidden');
    // Force reflow for animation
    void helpPanel.offsetWidth;
    helpPanel.classList.add('open');
});

closeHelpBtn.addEventListener('click', () => {
    helpPanel.classList.remove('open');
    setTimeout(() => {
        helpPanel.classList.add('hidden');
    }, 250);
});

// Update close sidepanel menu item disabled state based on context menu toggle
function updateCloseSidepanelMenuItemState() {
    if (!closeSidepanelMenuItem) return;
    const contextMenuEnabled = contextMenuToggle.checked;
    if (contextMenuEnabled) {
        closeSidepanelMenuItem.classList.remove('setting-item-disabled');
        if (closeSidepanelMenuToggle) {
            closeSidepanelMenuToggle.disabled = false;
        }
    } else {
        closeSidepanelMenuItem.classList.add('setting-item-disabled');
        if (closeSidepanelMenuToggle) {
            closeSidepanelMenuToggle.disabled = true;
        }
    }
}

// Context menu toggle - auto save
contextMenuToggle.addEventListener('change', async () => {
    const enabled = contextMenuToggle.checked;
    try {
        await chrome.storage.local.set({ contextMenuEnabled: enabled });
    } catch (e) {
        console.error('Failed to save setting:', e);
    }
    // Update close sidepanel menu item state
    updateCloseSidepanelMenuItemState();
});

// Close sidepanel menu toggle - auto save
if (closeSidepanelMenuToggle) {
    closeSidepanelMenuToggle.addEventListener('change', async () => {
        const enabled = closeSidepanelMenuToggle.checked;
        try {
            await chrome.storage.local.set({ closeSidepanelEnabled: enabled });
        } catch (e) {
            console.error('Failed to save close sidepanel menu setting:', e);
        }
    });
}


// Update clear retained text item visibility based on retainTextEnabled and retainedText existence
async function updateClearRetainedTextItemVisibility() {
    if (!clearRetainedTextItem) return;
    if (retainTextEnabled) {
        // Only show the clear button if there is actually retained text in storage
        try {
            const { retainedText } = await chrome.storage.local.get('retainedText');
            if (retainedText) {
                clearRetainedTextItem.classList.remove('hidden');
            } else {
                clearRetainedTextItem.classList.add('hidden');
                // Also hide the confirm area when the item is hidden
                if (clearRetainedTextConfirmArea) {
                    clearRetainedTextConfirmArea.classList.add('hidden');
                }
            }
        } catch (e) {
            clearRetainedTextItem.classList.add('hidden');
            if (clearRetainedTextConfirmArea) {
                clearRetainedTextConfirmArea.classList.add('hidden');
            }
        }
    } else {
        clearRetainedTextItem.classList.add('hidden');
        // Also hide the confirm area when the item is hidden
        if (clearRetainedTextConfirmArea) {
            clearRetainedTextConfirmArea.classList.add('hidden');
        }
    }
}


// Clear retained text item - click to show confirm area
if (clearRetainedTextItem) {
    clearRetainedTextItem.addEventListener('click', () => {
        if (clearRetainedTextConfirmArea) {
            clearRetainedTextConfirmArea.classList.remove('hidden');
        }
    });
}

// Clear retained text confirm button
if (clearRetainedTextConfirmBtn) {
    clearRetainedTextConfirmBtn.addEventListener('click', async () => {
        try {
            await chrome.storage.local.remove('retainedText');
            // Hide confirm area
            if (clearRetainedTextConfirmArea) {
                clearRetainedTextConfirmArea.classList.add('hidden');
            }
            // Update staged buttons to reflect that retainedText is now empty
            await updateStagedButtons();
            // Update clear retained text item visibility (hide it since retainedText is now empty)
            await updateClearRetainedTextItemVisibility();
            showStatusMessage(getMessage('retainedTextCleared'));
        } catch (e) {
            console.error('Failed to clear retained text:', e);
        }
    });
}

// Clear retained text cancel button
if (clearRetainedTextCancelBtn) {
    clearRetainedTextCancelBtn.addEventListener('click', () => {
        if (clearRetainedTextConfirmArea) {
            clearRetainedTextConfirmArea.classList.add('hidden');
        }
    });
}

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
        // Update clear retained text item visibility
        await updateClearRetainedTextItemVisibility();
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
        // Update clear retained text item visibility (show it since retainedText now exists)
        await updateClearRetainedTextItemVisibility();
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

// Update clear and copy button state based on text content
function updateClearButtonState() {
    const hasText = !!textInput.value.trim();
    if (clearTextBtn) {
        clearTextBtn.disabled = !hasText;
    }
    if (copyTextBtn) {
        copyTextBtn.disabled = !hasText;
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

// Copy text button
if (copyTextBtn) {
    copyTextBtn.addEventListener('click', async () => {
        const text = textInput.value.trim();
        if (!text) return;

        try {
            await navigator.clipboard.writeText(text);
            showStatusMessage(getMessage('textCopied'));
        } catch (e) {
            console.error('Failed to copy text:', e);
        }
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
