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
    try {
        if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
            const msg = chrome.i18n.getMessage(messageName);
            if (msg && msg !== '') {
                return msg;
            }
        }
    } catch (e) {
        console.warn('chrome.i18n not available, using fallback:', e);
    }
    // Fallback: return the message key itself if translation not found
    return messageName;
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
    // Localize title
    const title = document.querySelector('title');
    if (title) {
        const text = title.textContent.trim();
        if (text.startsWith('__MSG_')) {
            const msgName = text.replace('__MSG_', '').replace('__', '');
            title.textContent = getMessage(msgName);
        }
    }

    // Localize all elements with text content (supporting markdown)
    document.querySelectorAll('h1, h2, h3, p, li, div.footer p, span, label, div.section, div.header').forEach(el => {
        // Process all child text nodes
        const childNodes = Array.from(el.childNodes);
        childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text.startsWith('__MSG_')) {
                    const msgName = text.replace('__MSG_', '').replace('__', '');
                    const translated = getMessage(msgName);
                    // Check if the translated text contains markdown syntax
                    if (translated.includes('**') || translated.includes('<code>')) {
                        // Replace the text node with HTML containing rendered markdown
                        const span = document.createElement('span');
                        span.innerHTML = renderMarkdown(translated);
                        node.parentNode.replaceChild(span, node);
                    } else {
                        node.textContent = translated;
                    }
                }
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', localizePage);
