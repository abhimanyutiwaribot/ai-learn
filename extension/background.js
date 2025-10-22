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
    const actions = {
        'translate-selection': { type: 'TRANSLATE_SELECTION', text: info.selectionText },
        'proofread-selection': { type: 'PROOFREAD_SELECTION', text: info.selectionText },
        'simplify-selection': { type: 'SIMPLIFY_SELECTION', text: info.selectionText },
        'read-aloud-selection': { type: 'READ_ALOUD_SELECTION', text: info.selectionText },
        'open-sidepanel': { type: 'OPEN_SIDE_PANEL' } // NEW
    };

    if (actions[info.menuItemId]) {
        if (info.menuItemId === 'open-sidepanel') {
            // Open side panel directly
            chrome.sidePanel.open({ windowId: tab.windowId });
        } else {
            chrome.tabs.sendMessage(tab.id, actions[info.menuItemId]);
        }
    }
});

chrome.commands.onCommand.addListener(async (command) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const commandMap = {
        'simplify-selection': 'SIMPLIFY_SELECTION',
        'read-aloud': 'READ_ALOUD_SELECTION',
        'screenshot-analyze': 'ACTIVATE_SCREENSHOT',
        'open-sidepanel': 'OPEN_SIDE_PANEL' // NEW
    };

    if (commandMap[command]) {
        if (command === 'open-sidepanel') {
            chrome.sidePanel.open({ windowId: tab.windowId });
        } else {
            chrome.tabs.sendMessage(tab.id, { type: commandMap[command] });
        }
    }
});

// CRITICAL FIX: Complete screenshot handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

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

    // NEW: Handle side panel AI requests
    if (request.type === 'SIDE_PANEL_AI_REQUEST') {
        // Reuse your existing AI logic for side panel
        handleAIRequest(request.prompt, sendResponse);
        return true;
    }

    // CRITICAL FIX: Handle local AI execution
    if (request.type === 'RUN_LOCAL_GEMINI') {
        handleAIRequest(request.prompt, sendResponse);
        return true;
    }

    // Handle the synchronous LOG request
    if (request.type === 'LOG') {
        console.log('Extension Log:', request.message);
        return false;
    }

    return false;
});

// NEW: Reusable AI function for both side panel and content scripts
async function handleAIRequest(prompt, sendResponse) {
    try {
        // Check if the generic languageModel API is exposed
        if (!chrome.languageModel) {
            sendResponse({ success: false, error: 'Local AI API is not defined by Chrome (Permission/Version Issue).' });
            return;
        }

        const available = await chrome.languageModel.availability();

        if (available === 'available') {
            console.log('Background Worker: Running On-Device Gemini...');
            let aiResponseText = null;

            // --- TASK DISPATCH LOGIC (using specialized APIs for proofread/summarize) ---

            // Detect tasks based on unique prompt strings
            const isProofread = prompt.includes("Proofread the following text");
            const isSummarize = prompt.includes("Summarize the following document");

            // 1. Attempt specialized APIs (if they exist)
            if (isProofread && chrome.ai && chrome.ai.proofread) {
                console.log('Background Worker: Using specialized Proofread API.');
                // Extract raw text from the prompt for the dedicated API
                const rawText = prompt.split("Selected text:").pop().trim();
                aiResponseText = await chrome.ai.proofread({ text: rawText });
            }
            else if (isSummarize && chrome.ai && chrome.ai.summarize) {
                console.log('Background Worker: Using specialized Summarize API.');
                // Extract raw text from the prompt for the dedicated API
                const rawText = prompt.split("Document text:").pop().trim();
                aiResponseText = await chrome.ai.summarize({ text: rawText });
            }
            // 2. Default to Prompt API (Handles Prompt, Translate, Simplify, and specialized fallbacks)
            else {
                console.log('Background Worker: Using generic languageModel.generateContent.');
                const response = await chrome.languageModel.generateContent({
                    prompt: prompt,
                    config: { outputLanguage: 'en' }
                });
                aiResponseText = response.text;
            }
            // --- END TASK DISPATCH LOGIC ---

            sendResponse({ success: true, response: aiResponseText });

        } else {
            sendResponse({ success: false, error: `On-Device model unavailable: status=${available}` });
        }
    } catch (error) {
        // This catches execution errors (e.g., model not downloaded, API quota)
        console.error('Background Worker: Local Gemini execution failed:', error);
        sendResponse({ success: false, error: 'Local AI execution failed: ' + error.message });
    }
}