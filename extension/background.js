chrome.runtime.onInstalled.addListener(() => {
    console.log('ChromeAI Plus installed');
    createContextMenus();
    initializeSidePanel();
});

function createContextMenus() {
    chrome.contextMenus.create({
        id: 'translate-selection',
        title: 'Translate with ChromeAI',
        contexts: ['selection']
    });

    chrome.contextMenus.create({
        id: 'proofread-selection',
        title: 'Proofread with ChromeAI',
        contexts: ['selection', 'editable']
    });
    
    // ADDED: Simplify Selected Text to Context Menu
    chrome.contextMenus.create({
        id: 'simplify-selection',
        title: 'Simplify Selected Text',
        contexts: ['selection']
    });

    chrome.contextMenus.create({
        id: 'read-aloud-selection',
        title: 'Read Aloud',
        contexts: ['selection']
    });

    // NEW: Context menu to open side panel
    chrome.contextMenus.create({
        id: 'open-sidepanel',
        title: 'Open ChromeAI Side Panel',
        contexts: ['all']
    });
}

// NEW: Initialize side panel
function initializeSidePanel() {
    chrome.sidePanel
        .setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error) => console.error('Side panel error:', error));
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    // NOTE: ACTIVATE_ types open an overlay in content.js.
    // We now direct features that need a UI (Translate, Proofread, Simplify) to the Side Panel.
    
    let featureToOpen = null;
    
    const actions = {
        'translate-selection': { type: 'ACTIVATE_TRANSLATE', feature: 'translate' },
        'proofread-selection': { type: 'ACTIVATE_PROOFREAD', feature: 'proofread' },
        'simplify-selection': { type: 'ACTIVATE_SIMPLIFY', feature: 'simplify' }, 
        'read-aloud-selection': { type: 'READ_ALOUD_SELECTION' },
        'open-sidepanel': { type: 'OPEN_SIDE_PANEL' }
    };

    if (actions[info.menuItemId]) {
        const action = actions[info.menuItemId];
        
        if (info.menuItemId === 'open-sidepanel') {
            // Open side panel directly
            chrome.sidePanel.open({ windowId: tab.windowId });
        } else if (info.menuItemId === 'read-aloud-selection') {
            // Read Aloud doesn't need the side panel UI
            chrome.tabs.sendMessage(tab.id, action.type);
        } else {
            // For features that require the Side Panel UI (Translate, Proofread, Simplify)
            featureToOpen = action.feature;
            
            // 1. Open the Side Panel (this ensures it's ready)
            chrome.sidePanel.open({ windowId: tab.windowId });

            // 2. Send a special message to the Side Panel after a small delay
            // This message tells the side panel what feature interface to open and passes the selected text.
            setTimeout(() => {
                chrome.runtime.sendMessage({
                    type: 'OPEN_SIDE_PANEL_FEATURE',
                    feature: featureToOpen,
                    selectionText: info.selectionText // Pass selection text if available
                });
            }, 300); // Small delay for side panel to fully load
        }
    }
});

chrome.commands.onCommand.addListener(async (command) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const commandMap = {
        'simplify-selection': 'ACTIVATE_SIMPLIFY', 
        'read-aloud': 'READ_ALOUD_SELECTION',
        'screenshot-analyze': 'ACTIVATE_SCREENSHOT',
        'open-sidepanel': 'OPEN_SIDE_PANEL'
    };

    if (commandMap[command]) {
        if (command === 'open-sidepanel') {
            chrome.sidePanel.open({ windowId: tab.windowId });
        } else {
            chrome.tabs.sendMessage(tab.id, { type: commandMap[command] });
            
            // FIX: Open side panel for features that need a UI (Simplify, Screenshot)
            if (commandMap[command] !== 'READ_ALOUD_SELECTION') {
                 chrome.sidePanel.open({ windowId: tab.windowId });
            }
        }
    }
});

// CRITICAL FIX: Complete screenshot handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    // Handle the new message from content.js to open a specific feature in the sidepanel
    if (request.type === 'REQUEST_OPEN_SIDE_PANEL_FEATURE') {
        if (sender && sender.tab && sender.tab.windowId) {
            chrome.sidePanel.open({ windowId: sender.tab.windowId });
            // Now relay the instruction to the sidepanel script
            setTimeout(() => {
                chrome.runtime.sendMessage({
                    type: 'OPEN_SIDE_PANEL_FEATURE',
                    feature: request.feature,
                    selectionText: request.selectionText
                });
            }, 300);
            sendResponse({ success: true });
        }
        return true;
    }

    // Handle both CAPTURE_SCREENSHOT and SIDE_PANEL_SCREENSHOT requests
    if (request.type === 'CAPTURE_SCREENSHOT' || request.type === 'SIDE_PANEL_SCREENSHOT') {
        console.log('📸 Screenshot request received:', request.type);

        const getWindowId = () => {
            return new Promise((resolve) => {
                // Method 1: Try to get windowId from sender (content scripts)
                if (sender && sender.tab && sender.tab.windowId) {
                    console.log('✅ Using windowId from sender:', sender.tab.windowId);
                    resolve(sender.tab.windowId);
                    return;
                }
                
                // Method 2: Query active tab (side panel and fallback)
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs && tabs[0] && tabs[0].windowId) {
                        console.log('✅ Using windowId from active tab:', tabs[0].windowId);
                        resolve(tabs[0].windowId);
                    } else {
                        console.log('❌ No active tab found');
                        resolve(null);
                    }
                });
            });
        };

        const captureScreenshot = (windowId) => {
            return new Promise((resolve, reject) => {
                chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    if (!dataUrl) {
                        reject(new Error('Screenshot capture returned empty data'));
                        return;
                    }
                    resolve(dataUrl);
                });
            });
        };

        // Execute the screenshot capture
        (async () => {
            try {
                const windowId = await getWindowId();
                if (!windowId) {
                    sendResponse({ success: false, error: 'Could not determine active window' });
                    return;
                }

                console.log('📸 Capturing screenshot for window:', windowId);
                const dataUrl = await captureScreenshot(windowId);
                console.log('✅ Screenshot captured successfully, size:', dataUrl.length);
                sendResponse({ success: true, dataUrl: dataUrl });
                
            } catch (error) {
                console.error('❌ Screenshot capture failed:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();

        return true; // Keep the message channel open for async response
    }

    // NEW: Handle side panel communication
    if (request.type === 'OPEN_SIDE_PANEL') {
        chrome.sidePanel.open({ windowId: sender.tab.windowId });
        sendResponse({ success: true });
        return false;
    }

    // CRITICAL FIX: Block local AI execution from Content Script (RUN_LOCAL_GEMINI)
    if (request.type === 'RUN_LOCAL_GEMINI') {
        console.warn('⚠️ RUN_LOCAL_GEMINI request received. AI execution in the service worker is DISABLED by developer request. Forcing fallback.');
        sendResponse({ 
            success: false, 
            error: 'AI execution via Service Worker is disabled. Content script should proceed to cloud fallback.' 
        });
        return true; 
    }

    // NEW: Block side panel AI requests (SIDE_PANEL_AI_REQUEST)
    if (request.type === 'SIDE_PANEL_AI_REQUEST') {
        console.warn('⚠️ SIDE_PANEL_AI_REQUEST received. AI execution in the service worker is DISABLED by developer request. Sidepanel must use direct cloud API (Flask backend).');
        sendResponse({ 
            success: false, 
            error: 'AI execution via Service Worker is disabled. Sidepanel must use direct cloud API.' 
        });
        return true;
    }

    // Handle the synchronous LOG request
    if (request.type === 'LOG') {
        console.log('Extension Log:', request.message);
        return false;
    }

    return false;
});