chrome.runtime.onInstalled.addListener(() => {
    console.log('ChromeAI Plus installed');
    createContextMenus();
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
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const actions = {
        'translate-selection': { type: 'ACTIVATE_TRANSLATOR', text: info.selectionText },
        'proofread-selection': { type: 'ACTIVATE_PROOFREADER', text: info.selectionText },
        'simplify-selection': { type: 'ACTIVATE_SIMPLIFY', text: info.selectionText },
        'read-aloud-selection': { type: 'ACTIVATE_VOICE_READER', text: info.selectionText }
    };
    
    if (actions[info.menuItemId]) {
        chrome.tabs.sendMessage(tab.id, actions[info.menuItemId]);
    }
});

chrome.commands.onCommand.addListener(async (command) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const commandMap = {
        'simplify-selection': 'ACTIVATE_SIMPLIFY',
        'read-aloud': 'ACTIVATE_VOICE_READER',
        'screenshot-analyze': 'ACTIVATE_SCREENSHOT'
    };
    
    if (commandMap[command]) {
        chrome.tabs.sendMessage(tab.id, { type: commandMap[command] });
    }
});

// ============================================
// SCREENSHOT CAPTURE HANDLER
// ============================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'CAPTURE_SCREENSHOT') {
        console.log('📸 Capturing screenshot...');
        
        chrome.tabs.captureVisibleTab(
            null,
            { format: 'png', quality: 90 },
            (dataUrl) => {
                if (chrome.runtime.lastError) {
                    console.error('❌ Screenshot error:', chrome.runtime.lastError);
                    sendResponse({ 
                        success: false, 
                        error: chrome.runtime.lastError.message 
                    });
                } else {
                    console.log('✅ Screenshot captured');
                    sendResponse({ 
                        success: true, 
                        dataUrl: dataUrl 
                    });
                }
            }
        );
        
        return true; // Keep channel open for async response
    }
    
    if (request.type === 'LOG') {
        console.log('Extension Log:', request.message);
    }
    
    return true;
});
