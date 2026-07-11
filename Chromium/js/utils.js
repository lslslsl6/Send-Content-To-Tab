/*
 * Send Content to Tab - Send web page text or link content to the side panel, edit it, and open it in a new tab or incognito tab.
 * Copyright (C) 2025-present lslslsl06
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

const PageSupportChecker = {
    UNSUPPORTED_PREFIXES: [
        'chrome',
        'devtools',
        'edge',
        'about:',
        'extension',
        'view-source:'
    ],

    UNSUPPORTED_URLS: [
        'https://addons.mozilla.org',
        'https://chromewebstore.google.com',
        'https://microsoftedge.microsoft.com/addons'
    ],

    isUnsupportedPage(url) {
        if (!url || typeof url !== 'string') return true;

        for (const prefix of this.UNSUPPORTED_PREFIXES) {
            if (url.startsWith(prefix)) {
                return true;
            }
        }

        for (const unsupportedUrl of this.UNSUPPORTED_URLS) {
            if (url.startsWith(unsupportedUrl)) {
                return true;
            }
        }

        return false;
    },

    getUnsupportedPatterns() {
        return {
            prefixes: [...this.UNSUPPORTED_PREFIXES],
            urls: [...this.UNSUPPORTED_URLS]
        };
    }
};

if (typeof self !== 'undefined') {
    self.PageSupportChecker = PageSupportChecker;
}
if (typeof window !== 'undefined') {
    window.PageSupportChecker = PageSupportChecker;
}
