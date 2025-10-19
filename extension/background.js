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
        'translate-selection': { type: 'TRANSLATE_SELECTION', text: info.selectionText },
        'proofread-selection': { type: 'PROOFREAD_SELECTION', text: info.selectionText },
        'simplify-selection': { type: 'SIMPLIFY_SELECTION', text: info.selectionText },
        'read-aloud-selection': { type: 'READ_ALOUD_SELECTION', text: info.selectionText }
    };
    
    if (actions[info.menuItemId]) {
        chrome.tabs.sendMessage(tab.id, actions[info.menuItemId]);
    }
});

chrome.commands.onCommand.addListener(async (command) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const commandMap = {
        'simplify-selection': 'SIMPLIFY_SELECTION',
        'read-aloud': 'READ_ALOUD_SELECTION',
        'screenshot-analyze': 'ACTIVATE_SCREENSHOT'
    };
    
    if (commandMap[command]) {
        chrome.tabs.sendMessage(tab.id, { type: commandMap[command] });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'LOG') {
        console.log('Extension Log:', request.message);
    }
    return true;
});
