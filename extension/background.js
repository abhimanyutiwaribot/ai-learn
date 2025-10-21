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

// CRITICAL FIX: Listener to handle Screenshot and Local AI execution requests.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    // 1. Handle the asynchronous SCREENSHOT request
    if (request.type === 'CAPTURE_SCREENSHOT') {
        chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }, (dataUrl) => {
            if (chrome.runtime.lastError) {
                console.error("Capture error:", chrome.runtime.lastError.message);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
                return;
            }
            sendResponse({ success: true, dataUrl: dataUrl });
        });
        return true; 
    }
    
    // 2. CRITICAL FIX: Handle local AI execution
    if (request.type === 'RUN_LOCAL_GEMINI') {
        // Must use an async function inside the listener to use await
        (async () => {
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
                    const prompt = request.prompt;

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
        })();
        return true; // Must return true for the asynchronous response
    }
    
    // 3. Handle the synchronous LOG request
    if (request.type === 'LOG') {
        console.log('Extension Log:', request.message);
        return false; 
    }
    
    return false;
});
