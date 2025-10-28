// chromeai-plus/extension/content.js

(function() {

// ChromeAI Plus Content Script - Complete Version
console.log('🚀 ChromeAI Plus content script loaded');

let currentProfile = null;
let userId = null;
let isProcessing = false;
let showReadingLine = true; // Toggle for reading line feature

// CRITICAL FIX: Declare simplifiedVoiceUtterance once at the top level of the IIFE
// It needs to be scoped here so restoreOriginalContent can access and clear it.
let simplifiedVoiceUtterance = null; 

// The backend URL is assumed to be defined here or globally available
const BACKEND_URL = 'YOUR_BACKEND_URL'; 

// Define the standard language list for parity
const standardLanguageOptions = [
    { value: 'English', label: 'English' },
    { value: 'Spanish', label: 'Spanish (Español)' },
    { value: 'French', label: 'French (Français)' },
    { value: 'German', label: 'German (Deutsch)' },
    { value: 'Italian', label: 'Italiano (Italiano)' },
    { value: 'Portuguese', label: 'Portuguese (Português)' },
    { value: 'Chinese', label: 'Chinese (中文)' },
    { value: 'Japanese', label: 'Japanese (日本語)' },
    { value: 'Korean', label: 'Korean (한국어)' },
    { value: 'Hindi', label: 'Hindi (हिन्दी)' },
    { value: 'Arabic', label: 'Arabic (العربية)' }
];

// Helper function to generate options HTML
function generateLanguageOptionsHtml(selectedValue) {
    return standardLanguageOptions.map(lang => 
        `<option value="${lang.value}" ${lang.value.toLowerCase() === selectedValue.toLowerCase() ? 'selected' : ''}>${lang.label}</option>`
    ).join('');
}


// ============================================
// NEW: RESPONSE VOICE READER CLASS (For Overlays - Modified)
// ============================================
class ResponseVoiceReader {
    constructor(responseContainerId) {
        this.synth = window.speechSynthesis;
        this.responseContainerId = responseContainerId;
        this.isReading = false;
        this.isPaused = false;
        this.ttsData = []; 
        this.currentSegmentIndex = 0;
        this.voices = this.synth.getVoices();

        this.synth.onvoiceschanged = () => {
            this.voices = this.synth.getVoices();
        };
    }

    _getButtonHtml(icon, action, label = '', className = '') {
        return `<button class="tts-control-btn ${className}" data-action="${action}" aria-label="${label}">
                    <span class="icon">${icon}</span>${label ? `<span>${label}</span>` : ''}
                </button>`;
    }

    // Menu HTML removed
    renderControl() {
        const iconHtml = this._getButtonHtml('🔊', 'start', '', 'tts-main-btn');
        return `
            <div class="tts-container" id="tts-container-${this.responseContainerId}">
                ${iconHtml}
            </div>
        `;
    }

    attachListeners(responseContentText, isOCR) {
        const container = document.getElementById(`tts-container-${this.responseContainerId}`);
        if (!container) return;
        
        this.ttsData = this._prepareTTSData(responseContentText, isOCR);
        
        container.querySelector('.tts-main-btn').onclick = () => this._handleMainClick();
        
        this._updateMainButton('start');
    }

    _handleMainClick() {
        if (this.isReading && !this.isPaused) {
            this.pause();
        } else if (this.isPaused) {
            this.resume();
        } else {
            this.start();
        }
    }
    
    // _handleMenuAction removed

    _prepareTTSData(responseText, isOCR) {
        const segments = [];
        if (isOCR) {
            const originalMatch = responseText.match(/ORIGINAL TEXT:\s*([\s\S]*?)\s*TRANSLATION:/i);
            const translationMatch = responseText.match(/TRANSLATION:\s*([\s\S]*)/i);

            if (originalMatch && originalMatch[1]) {
                const originalText = originalMatch[1].trim();
                const lang = this._detectLanguage(originalText) || 'en';
                segments.push({ text: originalText, lang: lang, label: 'Original Text' });
            }

            if (translationMatch && translationMatch[1]) {
                const translatedText = translationMatch[1].trim();
                const lang = this._detectLanguage(translatedText) || 'en';
                segments.push({ text: translatedText, lang: lang, label: 'Translation' });
            }
        } else {
            // Standard handling: Single segment
            const text = responseText.trim();
            const lang = this._detectLanguage(text) || 'en';
            segments.push({ text: text, lang: lang, label: 'Response' });
        }
        
        return segments.filter(s => s.text.length > 0);
    }
    
    // FIX: Improved Language detection
    _detectLanguage(text) {
        if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(text)) return 'ko'; 
        if (/[ぁ-ゔァ-ヴー々〆〤ヶ]/.test(text)) return 'ja'; 
        if (/[\u4e00-\u9fff]/.test(text)) return 'zh'; 
        if (/[\u0600-\u06ff]/.test(text)) return 'ar';
        if (/[\u0900-\u097f]/.test(text)) return 'hi'; 
        if (/[áéíóúñÁÉÍÓÚÑ¿¡]/.test(text)) return 'es'; 
        if (/[àâéèêëîïôœùûüÿçÀÂÉÈÊËÎÏÔŒÙÛÜŸÇ]/.test(text)) return 'fr'; 
        if (/[äöüßÄÖÜẞ]/.test(text)) return 'de'; 
        return 'en';
    }

    _getVoice(langCode) {
        const langMap = {
            'ko': 'ko', 'ja': 'ja', 'zh': 'zh', 'ar': 'ar', 'hi': 'hi', 
            'es': 'es', 'fr': 'fr', 'de': 'de', 'en': 'en'
        };
        const targetLang = langMap[langCode] || 'en';

        const preferredVoice = this.voices.find(v => v.lang.startsWith(targetLang) && v.name.includes('Google')) ||
                               this.voices.find(v => v.lang.startsWith(targetLang)) ||
                               this.voices.find(v => v.default && v.lang.startsWith('en')) ||
                               this.voices[0];
        return preferredVoice;
    }

    _updateMainButton(action) {
        const btn = document.getElementById(`tts-container-${this.responseContainerId}`).querySelector('.tts-main-btn');
        if (btn) {
            const iconMap = { 'start': '🔊', 'pause': '⏸️', 'resume': '▶️', 'stop': '⏹️' };
            btn.innerHTML = `<span class="icon">${iconMap[action]}</span>`;
            btn.dataset.action = action;
        }
    }
    
    _speakSegment() {
        if (this.currentSegmentIndex >= this.ttsData.length) {
            this.stop();
            return;
        }
        
        const segment = this.ttsData[this.currentSegmentIndex];
        const utterance = new SpeechSynthesisUtterance(segment.text);
        utterance.lang = segment.lang;
        utterance.voice = this._getVoice(segment.lang);
        
        utterance.onstart = () => { this._updateMainButton('stop'); };
        
        utterance.onend = () => {
            this.currentSegmentIndex++;
            if (this.currentSegmentIndex < this.ttsData.length) {
                setTimeout(() => this._speakSegment(), 500); 
            } else { this.stop(); }
        };
        
        utterance.onerror = (e) => { console.error('TTS Error:', e); this.stop(); };

        this.synth.speak(utterance);
    }
    
    start() {
        if (this.isReading || this.isPaused) { this.stop(); return; }
        this.synth.cancel();
        this.isReading = true;
        this.isPaused = false;
        this.currentSegmentIndex = 0;
        this._speakSegment();
    }
    
    pause() {
        if (this.synth.speaking && !this.isPaused) {
            this.synth.pause();
            this.isPaused = true;
            this._updateMainButton('resume');
        } else if (!this.synth.speaking && !this.isPaused) {
            this.isPaused = true; 
            this._updateMainButton('resume');
        }
    }
    
    resume() {
        if (this.isPaused) {
            this.synth.resume();
            this.isPaused = false;
            this.isReading = true;
            this._updateMainButton('stop');
        }
    }
    
    stop() {
        if (this.synth.speaking || this.isPaused || this.isReading) {
            this.synth.cancel();
            this.isReading = false;
            this.isPaused = false;
            this.currentSegmentIndex = 0;
            this._updateMainButton('start');
        }
    }
}
// ============================================
// END: RESPONSE VOICE READER CLASS
// ============================================

// ============================================
// NEW: State Persistence Loader
// ============================================

/**
 * Loads userId, accessibilityProfile, and settings from Chrome storage.
 * Applies the profile and settings immediately to the current page.
 */
async function loadProfileAndState() {
    try {
        const result = await chrome.storage.local.get(['userId', 'accessibilityProfile', 'settings', 'showReadingLine']);
        
        // 1. Update Global State
        userId = result.userId;
        currentProfile = result.accessibilityProfile;
        showReadingLine = result.showReadingLine !== false; // Default to true
        
        // 2. Apply Accessibility Profile/Styles to the page
        if (currentProfile) {
            applyProfileStyles(currentProfile); 
        } else {
            applyProfileStyles(null); 
        }

        // 3. Apply Quick Settings
        if (result.settings) {
            applySettingsToPage(result.settings);
        }
        
        console.log(`[Content] State loaded. User: ${userId ? 'Logged In' : 'Anon'}, Profile: ${currentProfile || 'None'}. Reading Line Pref: ${showReadingLine}.`);

    } catch (error) {
        console.error('[Content] Error loading state on page load:', error);
    }
}

// === NEW: Storage Change Listener (Cross-Page Sync) ===
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.userId || changes.accessibilityProfile || changes.settings || changes.showReadingLine) {
            console.log('[Content] Storage change detected. Reloading state to sync across pages...');
            loadProfileAndState();
        }
    }
});
// ============================================




// Format AI response with markdown-like styling
// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// SIMPLIFY WEB - PAGE CONTENT REPLACEMENT
// ============================================

let originalPageContent = null;
let originalMainContainer = null;

function restoreOriginalContent() {
    console.log('↩️ Restoring original page...');
    const simplifiedWrapper = document.getElementById('simplified-web-wrapper');
    
    // Stop any running TTS before restoration
    if (simplifiedVoiceUtterance) {
        window.speechSynthesis.cancel();
        simplifiedVoiceUtterance = null;
    }
    
    // 1. Restore the title
    if (originalPageContent && originalPageContent.title) {
        document.title = originalPageContent.title;
    }

    // 2. Remove the simplified content wrapper
    if (simplifiedWrapper) {
        simplifiedWrapper.remove();
    }
    
    // 3. Restore the original HTML content
    if (originalMainContainer) {
        originalMainContainer.innerHTML = originalPageContent.html;
        // Restore the entire original body content if we replaced it entirely
    } else if (originalPageContent && originalPageContent.html) {
        document.documentElement.innerHTML = originalPageContent.html;
    }
    
    originalPageContent = null;
    originalMainContainer = null;
    
    // Send a success notification to the sidepanel/user
    chrome.runtime.sendMessage({ type: 'SIMPLIFY_STATUS', status: 'restored' });
    console.log('✅ Original page restored');
}


function replacePageWithSimplified(simplifiedText, level) {
    console.log('🌐 Replacing page with simplified content...');
    
    // Stop any previous TTS if the user simplifies again
    if (simplifiedVoiceUtterance) {
        window.speechSynthesis.cancel();
        simplifiedVoiceUtterance = null;
    }
    
    // 1. Find the best container for the original content
    const mainSelectors = [
        'main', 'article', '[role="main"]',
        '.content', '.main-content', '.post',
        '[itemprop*="articleBody"]', '[class*="entry-content"]', '[class*="story-body"]'
    ];
    
    let targetContainer = null;
    for (const selector of mainSelectors) {
        targetContainer = document.querySelector(selector);
        if (targetContainer && targetContainer.offsetParent !== null) {
            break;
        }
    }

    // If a good content container isn't found, use body.
    if (!targetContainer || targetContainer.tagName === 'BODY') {
        targetContainer = document.body;
    }
    
    // 2. Save original state if restoration is possible
    if (!originalPageContent) {
        originalPageContent = {
            // Save the innerHTML of the target to restore it correctly
            html: targetContainer.innerHTML,
            title: document.title
        };
        originalMainContainer = targetContainer;
    } else {
        // If simplification is called again without restoration, remove the previous simplified wrapper
        const existingWrapper = document.getElementById('simplified-web-wrapper');
        if (existingWrapper) existingWrapper.remove();
    }
    
    // 3. Prepare the simplified content wrapper (minimal UI)
    const formattedContent = formatAIResponse(simplifiedText);
    
    const simplifiedWrapper = document.createElement('div');
    simplifiedWrapper.id = 'simplified-web-wrapper';
    simplifiedWrapper.style.cssText = 'position: relative; padding: 20px; background: white; border: 1px solid #e0e0e0; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);';
    
    // Add Header (Title/Level)
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #f0f0f0;';
    
    const headerInfo = document.createElement('div');
    headerInfo.style.cssText = 'flex: 1;';
    headerInfo.innerHTML = `
        <h2 style="margin: 0; font-size: 1.5em; color: #4f46e5;">✨ Simplified Content</h2>
        <div style="font-size: 0.9em; color: #6b7280;">Level: ${level}</div>
    `;
    
    // 4. Create Controls (Voice + Restore)
    const controls = document.createElement('div');
    controls.style.cssText = 'display: flex; gap: 12px; align-items: center; flex-shrink: 0;';
    
    // TTS Button (Start/Pause/Stop functionality will be managed in JS)
    const voiceBtn = document.createElement('button');
    voiceBtn.id = 'simplified-voice-btn';
    voiceBtn.innerHTML = '🔊 Read';
    voiceBtn.title = 'Read aloud';
    // Green background for Read button
    voiceBtn.style.cssText = 'padding: 10px 16px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; transition: all 0.2s; box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);';
    
    // Restore Button (Recolored to red to match the image, not blue gradient as previously planned)
    const restoreBtn = document.createElement('button');
    restoreBtn.textContent = '❌ Restore Original Page';
    restoreBtn.id = 'simplified-restore-btn-bottom';
    // Red background for Restore button
    restoreBtn.style.cssText = 'padding: 10px 16px; background: #f44336; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; transition: all 0.2s; box-shadow: 0 4px 12px rgba(244, 67, 54, 0.3);';
    restoreBtn.onclick = function() { restoreOriginalContent(); };
    
    controls.appendChild(voiceBtn);
    controls.appendChild(restoreBtn);
    header.appendChild(headerInfo);
    header.appendChild(controls);
    
    // 5. Add Simplified Content
    const content = document.createElement('div');
    content.id = 'simplified-content';
    content.className = 'ai-formatted-content';
    content.style.cssText = 'color: #333; line-height: 1.9; font-size: 18px;';
    content.innerHTML = formattedContent;

    // 6. Assemble and inject
    simplifiedWrapper.appendChild(header);
    simplifiedWrapper.appendChild(content);
    
    // Add the controls again at the bottom for better visibility (as shown in the image)
    const bottomControls = document.createElement('div');
    bottomControls.style.cssText = 'margin-top: 25px; padding-top: 15px; border-top: 1px solid #f0f0f0; text-align: center;';
    
    const restoreBtnBottom = document.createElement('button');
    restoreBtnBottom.textContent = '❌ Restore Original Page';
    restoreBtnBottom.id = 'simplified-restore-btn-bottom-copy';
    restoreBtnBottom.style.cssText = 'padding: 10px 20px; background: #f44336; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; box-shadow: 0 4px 12px rgba(244, 67, 54, 0.3);';
    restoreBtnBottom.onclick = function() { restoreOriginalContent(); };
    
    // Now add the voice button next to the restore button at the bottom
    const voiceBtnBottom = document.createElement('button');
    voiceBtnBottom.id = 'simplified-voice-btn-bottom-copy';
    voiceBtnBottom.innerHTML = '🔊 Read Simplified Text';
    voiceBtnBottom.title = 'Read aloud';
    voiceBtnBottom.style.cssText = 'padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; margin-right: 10px; box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);';
    
    bottomControls.appendChild(voiceBtnBottom);
    bottomControls.appendChild(restoreBtnBottom);
    simplifiedWrapper.appendChild(bottomControls);


    // Clear container and append the new wrapper
    targetContainer.innerHTML = '';
    targetContainer.appendChild(simplifiedWrapper);
    
    // 7. Update document title
    document.title = '✨ Simplified: ' + (originalPageContent.title || 'Page');
    
    // 8. Setup in-page Voice Reader for the simplified text (apply listener to both buttons/all functionality)
    setupSimplifiedVoiceReader(simplifiedText); 
    
    // Send a success notification to the sidepanel/user
    chrome.runtime.sendMessage({ type: 'SIMPLIFY_STATUS', status: 'simplified' });
    console.log('✅ Main content replaced in place.');
}

// NEW: Function to handle Text-to-Speech logic for the simplified content
function setupSimplifiedVoiceReader(text) {
    const voiceBtnTop = document.getElementById('simplified-voice-btn');
    const voiceBtnBottom = document.getElementById('simplified-voice-btn-bottom-copy');
    
    if (!voiceBtnTop || !window.speechSynthesis) return;

    let isReading = false;
    let isPaused = false;
    let synth = window.speechSynthesis;
    
    // Clear global reference just in case
    simplifiedVoiceUtterance = null;
    
    const updateButtons = (state) => {
        const [text, background, reading, paused] = state;
        [voiceBtnTop, voiceBtnBottom].forEach(btn => {
            if (btn) {
                btn.innerHTML = text;
                btn.style.background = background;
            }
        });
        isReading = reading;
        isPaused = paused;
    };

    const startReading = () => {
        synth.cancel(); // Cancel any existing speech
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        
        const voices = synth.getVoices();
        const preferredVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
                               voices.find(v => v.lang.startsWith('en')) ||
                               voices[0];
        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }
        
        utterance.onstart = function() {
            updateButtons(['⏸️ Pause', '#ff9800', true, false]);
        };
        
        utterance.onend = function() {
            updateButtons(['🔊 Read', '#4CAF50', false, false]);
            simplifiedVoiceUtterance = null;
        };
        
        utterance.onerror = function(e) {
            console.error('Simplified TTS Error:', e);
            updateButtons(['🔊 Read', '#f44336', false, false]);
            simplifiedVoiceUtterance = null;
        };
        
        simplifiedVoiceUtterance = utterance;
        synth.speak(utterance);
    };

    const handleStop = () => {
        if (isReading) {
            synth.cancel();
            updateButtons(['🔊 Read', '#4CAF50', false, false]);
            simplifiedVoiceUtterance = null;
        }
    };
    
    const handlePauseResume = () => {
        if (isReading && !isPaused) {
            // Pause
            synth.pause();
            updateButtons(['▶️ Resume', '#ff9800', true, true]);
        } else if (isReading && isPaused) {
            // Resume
            synth.resume();
            updateButtons(['⏸️ Pause', '#ff9800', true, false]);
        } else {
            // Start
            startReading();
        }
    };

    [voiceBtnTop, voiceBtnBottom].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', handlePauseResume);
        }
    });

    // Add an event listener to the page restoration buttons to ensure TTS is stopped externally
    const restoreBtnTop = document.getElementById('simplified-restore-btn');
    const restoreBtnBottom = document.getElementById('simplified-restore-btn-bottom-copy');
    
    [restoreBtnTop, restoreBtnBottom].forEach(btn => {
        if(btn) {
            btn.addEventListener('click', handleStop);
        }
    });
    
    // Optional: Add global listener for escape key to stop TTS (Good Accessibility practice)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isReading) {
            handleStop();
        }
    });
}


function formatAIResponse(text) {
    let formatted = text;
    formatted = formatted.replace(/``````/g, function(match, code) {
        return '<pre style="background: #f5f5f5; padding: 16px; border-radius: 8px;"><code>' + code.trim() + '</code></pre>';
    });
    formatted = formatted.replace(/`([^`]+)`/g, function(match, code) {
        return '<code style="background: #f0f0f0; padding: 2px 6px; border-radius: 4px; color: #d63384;">' + code + '</code>';
    });
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight: 700;">$1</strong>');
    const paragraphs = formatted.split('\n\n').filter(function(p) { return p.trim(); });
    return paragraphs.map(function(para) {
        return '<p style="margin: 0 0 1.5em 0;">' + para.trim() + '</p>';
    }).join('\n');
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📨 Content script received:', message.type);

        if (message.type === 'REPLACE_PAGE_CONTENT') {
        replacePageWithSimplified(message.simplifiedContent, message.level);
        sendResponse({ success: true });
        return true;
    }

    if (message.type === 'RESTORE_ORIGINAL_CONTENT') {
        restoreOriginalContent();
        sendResponse({ success: true });
        return true;
    }

    
    if (message.type === 'PING') {
        sendResponse({ status: 'ready' });
        return false;
    }

    if (message.type === 'REMOVE_OVERLAYS') {
        removeExistingOverlays();
        sendResponse({ status: 'overlays_removed' });
        return false;
    }
    
    if (isProcessing && message.type.startsWith('ACTIVATE_')) {
        console.log('⚠️ Already processing, please wait');
        sendResponse({ status: 'busy' });
        return false;
    }
    
    if (message.type.startsWith('ACTIVATE_')) {
        isProcessing = true;
        handleActivation(message)
            .then(() => {
                isProcessing = false;
                sendResponse({ status: 'activated' });
            })
            .catch(error => {
                isProcessing = false;
                console.error('❌ Activation error:', error);
                showNotification('Error: ' + error.message, 'error');
                sendResponse({ status: 'error', error: error.message });
            });
        return true; 
    }
    
    if (message.type === 'APPLY_PROFILE') { // Enhanced profile activation
        const profile = message.profile;
        
        // CRITICAL FIX: Update the internal state right here
        currentProfile = profile; 

        // Remove old classes and apply new styles/classes
        applyProfileStyles(profile);
        
        sendResponse({ status: 'profile_applied' });
        return false;
    }
    
    if (message.type === 'UPDATE_SETTINGS') {
        applySettingsToPage(message.settings);
        sendResponse({ status: 'settings_applied' });
        return false;
    }
    
    if (message.type === 'SHOW_INSIGHTS') {
        displayInsightsOverlay(message.insights, message.sessionCount);
        sendResponse({ status: 'insights_shown' });
        return false;
    }
    
        if (message.type === 'GET_SELECTED_TEXT') {
            const selectedText = window.getSelection().toString().trim();
            sendResponse({ text: selectedText });
            return true;
        }

        if (message.type === 'GET_PAGE_TEXT') {
            const pageText = extractMainContent();
            sendResponse({ text: pageText });
            return true;
        }

    if (message.type === 'SIDE_PANEL_CALL_AI') { // New handler for side panel requests
        const { feature, data } = message;
        
        // Use locally stored state which is continuously synced from storage
        // currentProfile = data.accessibilityMode; // Removed: Use persistent state
        // userId = data.userId; // Removed: Use persistent state
        
        let prompt = data.prompt || data.text;
        let options = {
            feature: feature // Pass feature type for local/cloud split logic
        }; 
        
        // Custom logic to handle SIMPLIFY/TRANSLATE requests using callAI
        if (feature === 'SIMPLIFY') {
            // Simplify uses the specialized API endpoint, pass hint and level
            options.isSimplify = true;
            options.simplifyLevel = data.level;
            prompt = data.text; // Pass raw text
        }
        
        console.log(`🤖 [Content AI] Received SIDE_PANEL_CALL_AI for ${feature}. Starting AI process...`);

        callAI(prompt, options)
            .then(response => {
                console.log(`✅ [Content AI] AI process for ${feature} succeeded.`);
                sendResponse({ 
                    success: true, 
                    response: response 
                });
            })
            .catch(error => {
                isProcessing = false;
                console.error('❌ Activation error:', error);
                showNotification('Error: ' + error.message, 'error');
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep the message channel open for async response
    }
    
    // NEW: Listen for status updates from the page simplification logic
    if (message.type === 'SIMPLIFY_STATUS') {
        // Do nothing here; this is handled in the listener of the sidepanel.
        // Returning false allows the message to finish asynchronously.
        return false;
    }
    
    return false;
});

async function handleActivation(message) {
    const type = message.type.replace('ACTIVATE_', '');
    const data = message.data || {};
    
    // CRITICAL FIX: The global state variables (currentProfile, userId) are managed by the 
    // loadProfileAndState and storage listener. We should rely on those.
    // currentProfile = data.profile; // Removed
    // userId = data.userId; // Removed
    
    console.log(`✨ Activating ${type} with profile:`, currentProfile);
    
    removeExistingOverlays();
    
    switch(type) {
        case 'PROMPT':
            console.log('✨ [Activation] Showing Prompt Interface...');
            await showPromptInterface();
            break;
        case 'PROOFREAD': 
            console.log('✨ [Activation] Activating Proofreader Mode...');
            await activateProofreaderMode();
            break;
        case 'SUMMARIZE': 
            console.log('✨ [Activation] Showing Summarizer Options...');
            await showSummarizerOptions();
            break;
        case 'TRANSLATE': 
            console.log('✨ [Activation] Showing Translator Interface...');
            await showTranslatorInterface();
            break;
        case 'SCREENSHOT':
            console.log('✨ [Activation] Activating Screenshot Analyzer...');
            await captureAndAnalyzeScreenshot();
            break;
        case 'OCR_TRANSLATE':
            console.log('✨ [Activation] Activating OCR Translate...');
            await activateOCRTranslate();
            break;
        case 'SIMPLIFY':
            console.log('✨ [Activation] Activating Simplify Text...');
            await activateSimplify();
            break;
        case 'VOICE_READER':
            console.log('✨ [Activation] Activating Voice Reader...');
            await activateVoiceReader();
            break;
        case 'FOCUS_MODE':
            // Removed: No longer supported as a standalone feature
            console.warn('Focus Mode is deprecated. Use ADHD profile instead.');
            showNotification('Focus Mode is now integrated into the ADHD profile.', 'warning');
            break;
        default:
            console.warn('⚠️ Unknown activation type:', type);
            showNotification('Feature not implemented', 'warning');
    }
}

function removeExistingOverlays() {
    const overlays = document.querySelectorAll('[id$="-overlay"], .chromeai-overlay');
    overlays.forEach(overlay => overlay.remove());
}


function buildAccessibilityPrompt(profile) {
    let basePrompt = "You are ChromeAI Plus, an intelligent assistant. Be concise and helpful.";

    if (!profile) {
        return basePrompt;
    }

    switch (profile) {
        case 'dyslexia':
            return basePrompt + " When generating text, use clear, simple language, short sentences, and avoid long, complex paragraphs to aid reading for users with dyslexia.";
        case 'adhd':
            return basePrompt + " Summarize key information using bullet points or numbered lists. Be direct and avoid unnecessary jargon to maintain user focus (ADHD profile).";
        case 'visual_impairment':
            return basePrompt + " Respond with highly structured, clear formatting using markdown headers and lists for easy screen-reader parsing (Visual Impairment profile).";
        case 'non_native':
            return basePrompt + " Use very simple English, explain complex terms, and translate key concepts if possible (Non-Native Speaker profile).";
        default:
            return basePrompt;
    }
}
// ============================================
// UNIVERSAL AI HANDLER (HYBRID-FIRST: On-Device Preferred, Cloud Fallback)
// ============================================

/**
 * Calls the appropriate hybrid AI endpoint, defaulting to attempting on-device processing first.
 * The on-device task is delegated to the background script.
 */
async function callAI(prompt, options = {}) {
    console.log('🤖 Calling AI...');
    
    // --- FIX 1: Define max prompt length for quick local-check skip. Set to 3000 characters. ---
    const MAX_LOCAL_PROMPT_LENGTH = 3000; 
    // -------------------------------------------------------------------------------------------

    const feature = options.feature || 'PROMPT'; // Use PROMPT as default if not passed

    // CRITICAL FIX: Only attempt local AI for PROMPT, PROOFREAD, SUMMARIZE, and TRANSLATE
    const shouldAttemptLocal = feature === 'PROMPT' || feature === 'PROOFREAD' || feature === 'SUMMARIZE' || feature === 'TRANSLATE'; 

    // --- FIX 2: Check length before attempting local AI to speed up fallback ---
    let skipLocalAttempt = false;
    if (shouldAttemptLocal && prompt.length > MAX_LOCAL_PROMPT_LENGTH) {
        console.log(`⏩ [Hybrid] Prompt length (${prompt.length}) exceeds local limit (${MAX_LOCAL_PROMPT_LENGTH}). Skipping local AI attempt.`);
        skipLocalAttempt = true;
    }
    // -------------------------------------------------------------------------

    // ============================================
    // STEP 1: TRY LOCAL GEMINI NANO FIRST
    // (Relies on the manifest OT tokens for proofreader and prompt API capability)
    // ============================================
    if (shouldAttemptLocal && !skipLocalAttempt) { // Check the feature flag AND the new skip flag
        try {
            // FIX: Use the globally available API object (LanguageModel) which we know works.
            const LanguageModel = window.LanguageModel || (window.ai && window.ai.languageModel);

            if (LanguageModel) {
                const availability = await LanguageModel.availability();
                console.log('📊 [Hybrid] Local AI availability (Content Script):', availability);

                // --- Apply Accessibility Prompt Logic ---
                const systemPrompt = buildAccessibilityPrompt(currentProfile);
                // --- END NEW ---

                // CRITICAL FIX: Check for BOTH 'readily' and 'available'
                if (availability === 'readily' || availability === 'available') {
                    console.log('🔍 [Hybrid] Using Local Gemini Nano (Content Script Direct)...');

                    const session = await LanguageModel.create({
                        // Pass the custom system prompt here
                        systemPrompt: systemPrompt,
                        language: 'en'
                    });

                    const result = await session.prompt(prompt);
                    session.destroy();

                    console.log('✅ [Hybrid] Local AI responded successfully (Content Script Result)');
                    showNotification('✓ Using on-device AI', 'success');
                    return result;
                } else if (availability === 'after-download' || availability === 'downloadable') {
                    // Do nothing, let it fall through to cloud.
                    console.log('⏳ [Hybrid] Model needs download or is downloading, skipping local and using cloud...');
                }
            }
        } catch (localError) {
            console.log('❌ [Hybrid] Local AI failed, skipping local:', localError.message);
            // Continue to cloud fallback
        }
    } else {
        console.log(`⏩ [Hybrid] Skipping local AI check for feature: ${feature}. Proceeding directly to Cloud.`);
    }


    // ============================================
    // STEP 2: CLOUD FALLBACK (YOUR EXISTING CODE CONTINUES BELOW)
    // ============================================
    console.log('☁️ [Hybrid] Falling back to cloud backend...');
    const isSimplifyCall = options.isSimplify || false;

    // Helper for making the actual fetch call (used for both hybrid and forced cloud)
    const performFetch = async (forceCloud) => {
        let endpoint = isSimplifyCall ? `${BACKEND_URL}/api/hybrid/simplify` : `${BACKEND_URL}/api/hybrid/prompt`;
        console.log(`📡 [Cloud] Fetching from backend (Cloud forced: ${forceCloud})...`);

        const requestBody = isSimplifyCall ? {
            text: prompt,
            useCloud: forceCloud,
            accessibilityMode: currentProfile,
            // CRITICAL FIX: Include simplify level in the requestBody for the backend API
            level: options.simplifyLevel, 
            userId: userId
        } : {
            prompt: prompt,
            useCloud: forceCloud,
            accessibilityMode: currentProfile,
            userId: userId
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`Backend returned ${response.status}`);
        }

        return await response.json();
    };

    try {
        // 1. Attempt Hybrid/On-Device Check (useCloud: false)
        const data = await performFetch(false);

        if (!data.success) {
            throw new Error(data.error || 'AI request failed');
        }

        // 2. Check instruction: If backend says 'on-device', client must delegate it.
        if (data.source === 'on-device') {
            console.log('⚠️ [Cloud] Backend instructed to use On-Device AI, but delegation to background is disabled. Forcing Cloud fallback...');

            // 3. Fallback: Force a cloud call (useCloud: true) if local execution failed
            const cloudData = await performFetch(true);

            if (!cloudData.success) {
                throw new Error(cloudData.error || 'Cloud fallback failed');
            }

            console.log('✅ [Cloud] Cloud AI responded (Forced Fallback)');
            return isSimplifyCall ? cloudData.simplified : cloudData.response;
        }

        // 4. If backend executed Cloud (e.g., prompt was too long/auto-forced)
        console.log('✅ [Cloud] AI responded (Cloud executed by backend)');
        return isSimplifyCall ? data.simplified : data.response;

    } catch (error) {
        console.error('❌ [Cloud] AI Error:', error);
        throw new Error(`AI unavailable: ${error.message}. Make sure Flask backend is running on port 5000.`);
    }
}
// ============================================
// OVERLAY CAPTURE UTILITY (unchanged)
// ============================================

/**
 * Manages hiding and showing a specific overlay element during a screenshot capture.
 * Uses display: 'none' for guaranteed removal from the visible layout.
 * @param {string} overlayId The ID of the overlay to hide.
 * @param {Function} callback The capture function to execute while hidden.
 * @returns {Promise<any>} The result of the callback function.
 */
async function hideOverlayAndCapture(overlayId, callback) {
    const overlay = document.getElementById(overlayId);
    if (!overlay) {
        console.warn(`Overlay element with ID ${overlayId} not found.`);
        return callback();
    }

    const originalDisplay = overlay.style.display;
    let result = null;
    
    try {
        // Step 1: Set display to 'none' for GUARANTEED removal from the screenshot
        overlay.style.display = 'none'; 
        
        // Use a slight delay to ensure the DOM is fully rendered before capture request is sent
        await new Promise(resolve => setTimeout(resolve, 50)); 
        
        // Step 2: Perform the capture while hidden
        result = await callback();
        
    } finally {
        // Step 3: Restore the overlay's original display property
        overlay.style.display = originalDisplay;
    }

    return result;
}


// ============================================
// OCR + TRANSLATE (Updated for language parity and TTS fix)
// ============================================

async function activateOCRTranslate() {
    console.log('📸 Activating OCR Translate...');
    
    // Use a unique ID for the overlay
    const OVERLAY_ID = 'ocr-translate-overlay';
    // CRITICAL FIX: Ensure createOverlay uses the fixed positioning for centering
    const overlay = createOverlay(OVERLAY_ID, '🔍 OCR + Translate');
    
    const content = `
        <div style="padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; color: #333;">🔍 OCR + Translate</h3>
                <button id="back-to-main-btn" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">← Back</button>
            </div>
            <p style="margin-bottom: 16px; color: #666; font-size: 14px;">
                Capture text from images and translate it
            </p>
            
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 600;">Translate to:</label>
                <select id="ocr-target-language" style="width: 100%; padding: 10px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">
                    ${generateLanguageOptionsHtml('English')}
                </select>
            </div>
            
            <button id="ocr-capture-btn" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 15px; margin-bottom: 8px;">
                📸 Capture Screenshot
            </button>
            
            <button id="ocr-upload-btn" style="width: 100%; padding: 14px; background: #2196f3; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 15px;">
                📁 Upload Image
            </button>
            
            <input type="file" id="ocr-file-input" accept="image/*" style="display: none;">
            
            <div id="ocr-preview" style="display: none; margin-top: 16px;">
                <img id="ocr-img" style="width: 100%; max-height: 300px; object-fit: contain; border-radius: 8px; margin-bottom: 12px; border: 2px solid #e0e0e0;">
                <button id="ocr-process-btn" style="width: 100%; padding: 14px; background: #4caf50; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 15px;">
                    🔍 Extract & Translate Text
                </button>
            </div>
            
            <div id="ocr-result" style="margin-top: 16px; display: none;">
            </div>
        </div>
    `;
    
    overlay.querySelector('.chromeai-modal-body').innerHTML = content;
    document.body.appendChild(overlay);
    
    // Back button functionality
    document.getElementById('back-to-main-btn').onclick = () => {
        overlay.remove();
        showMainInterface();
    };
    
    let currentImageData = null;
    
    // Capture screenshot BUTTON HANDLER
    document.getElementById('ocr-capture-btn').onclick = async () => {
        console.log('📸 Capture button clicked');
        try {
            showNotification('📸 Capturing screenshot...', 'info');
            
            // CRITICAL FIX: Hide the overlay before capturing the screenshot
            const dataUrl = await hideOverlayAndCapture(OVERLAY_ID, captureScreenshot);
            
            console.log('✅ Screenshot captured, size:', dataUrl.length);
            showOCRPreview(dataUrl);
        } catch (error) {
            console.error('❌ Screenshot failed:', error);
            showNotification('Screenshot failed: ' + error.message, 'error');
        }
    };
    
    // Upload image
    document.getElementById('ocr-upload-btn').onclick = () => {
        console.log('📁 Upload button clicked');
        document.getElementById('ocr-file-input').click();
    };
    
    document.getElementById('ocr-file-input').onchange = (e) => {
        const file = e.target.files[0];
        console.log('📁 File selected:', file?.name);
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                console.log('✅ File loaded');
                showOCRPreview(event.target.result);
            };
            reader.readAsDataURL(file);
        }
    };
    
    function showOCRPreview(dataUrl) {
        console.log('👁️ Showing preview');
        currentImageData = dataUrl;
        document.getElementById('ocr-img').src = dataUrl;
        document.getElementById('ocr-preview').style.display = 'block';
    }
    
    // Process OCR + Translate
    document.getElementById('ocr-process-btn').onclick = async () => {
        // ... rest of the OCR backend communication logic
        console.log('🔍 Processing OCR...');
        const targetLanguage = document.getElementById('ocr-target-language').value;
        const resultDiv = document.getElementById('ocr-result');
        
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `
            <div style="padding: 16px; background: #e3f2fd; border-radius: 8px; text-align: center;">
                <div style="font-size: 24px; margin-bottom: 8px;">⏳</div>
                <div>Processing with Gemini Vision AI...</div>
                <small>Extracting text and translating to ${targetLanguage}</small>
            </div>
        `;
        
        // 🐛 FIX 7: Add log for OCR submission (Content Script side)
        console.log(`🖼️ [OCR] Sending OCR/Translate request to backend API (Content Script)...`);

        try {
            const result = await processOCRWithBackend(currentImageData, targetLanguage);
            console.log('✅ OCR completed');
            
            const ttsManager = new ResponseVoiceReader('ocr-result'); // Use the result div ID

            resultDiv.innerHTML = `
                <div style="padding: 16px; background: #e8f5e9; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <strong>✅ OCR Completed:</strong>
                        ${ttsManager.renderControl()}
                    </div>
                    <div style="white-space: pre-wrap; line-height: 1.6;">
                        ${formatOCRResult(result)}
                    </div>
                    <button id="copy-result-btn" style="margin-top: 12px; width: 100%; padding: 10px; background: #4caf50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        📋 Copy Translation
                    </button>
                </div>
            `;
            ttsManager.attachListeners(result, true); // Pass isOCR: true
            
            document.getElementById('copy-result-btn').onclick = () => {
                navigator.clipboard.writeText(result);
                showNotification('✓ Copied to clipboard', 'success');
            };
            
        } catch (error) {
            console.error('❌ OCR failed:', error);
            resultDiv.innerHTML = `
                <div style="padding: 16px; background: #ffebee; border-radius: 8px; color: #c62828;">
                    <strong>❌ Error:</strong> ${error.message}<br><br>
                </div>
            `;
        }
    };
    
    overlay.onclick = (e) => {
        if (e.target === e.currentTarget) {
            // Check if the click was on the overlay background and not the TTS menu
            if (!e.target.closest('.tts-container')) {
                 overlay.remove();
            }
        }
    };
}

async function captureScreenshot() {
    console.log('📸 Requesting screenshot from background...');
    
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'CAPTURE_SCREENSHOT',
            captureType: 'visible'
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('❌ Screenshot error:', chrome.runtime.lastError);
                reject(new Error(chrome.runtime.lastError.message));
            } else if (response && response.dataUrl) {
                console.log('✅ Screenshot received');
                resolve(response.dataUrl);
            } else {
                console.error('❌ No screenshot data received');
                reject(new Error('Screenshot capture failed - no data received'));
            }
        });
    });
}

async function processOCRWithBackend(imageDataUrl, targetLanguage) {
    console.log('🌐 Calling backend OCR API...');
    console.log('Image size:', imageDataUrl.length, 'bytes');
    
    const response = await fetch(`${BACKEND_URL}/api/multimodal/ocr-translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            image: imageDataUrl,
            targetLanguage: targetLanguage,
            userId: userId
        })
    });
    
    console.log('📡 Backend response status:', response.status);
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Backend error response:', errorText);
        throw new Error(`Backend error ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log('📦 Backend response data:', data);
    
    if (!data.success) {
        throw new Error(data.error || 'OCR processing failed');
    }
    
    return data.result;
}

function formatOCRResult(result) {
    return result
        .replace(/ORIGINAL TEXT:/gi, '<strong style="color: #1976d2; font-size: 16px;">📝 ORIGINAL TEXT:</strong>')
        .replace(/TRANSLATION:/gi, '<br><br><strong style="color: #388e3c; font-size: 16px;">🌐 TRANSLATION:</strong>')
        .replace(/\n/g, '<br>');
}

// ============================================
// SCREENSHOT ANALYSIS (unchanged)
// ============================================

async function captureAndAnalyzeScreenshot() {
    console.log('📷 Activating Screenshot Analysis...');
    
    const OVERLAY_ID = 'screenshot-analyzer-overlay';
    const overlay = createOverlay(OVERLAY_ID, '📷 Screenshot Analyzer');
    
    const content = `
        <div style="padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; color: #333;">📷 Screenshot Analyzer</h3>
                <button id="back-to-main-btn" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">← Back</button>
            </div>
            <button id="capture-btn" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 15px; margin-bottom: 12px;">
                📸 Capture Screenshot
            </button>
            
            <div id="screenshot-preview" style="display: none;">
                <img id="screenshot-img" style="width: 100%; border-radius: 8px; margin-bottom: 12px; border: 2px solid #e0e0e0;">
                <textarea id="screenshot-query" placeholder="What would you like to know about this image?" style="width: 100%; height: 80px; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; margin-bottom: 12px;"></textarea>
                <button id="analyze-btn" style="width: 100%; padding: 14px; background: #4caf50; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 15px;">
                    🔍 Analyze with AI
                </button>
            </div>
            
            <div id="screenshot-result" style="margin-top: 16px; display: none;"></div>
        </div>
    `;
    
    overlay.querySelector('.chromeai-modal-body').innerHTML = content;
    document.body.appendChild(overlay);
    
    // Back button functionality
    document.getElementById('back-to-main-btn').onclick = () => {
        overlay.remove();
        showMainInterface();
    };
    
    let capturedImage = null;
    
    // Capture screenshot BUTTON HANDLER
    document.getElementById('capture-btn').onclick = async () => {
        try {
            showNotification('📸 Capturing...', 'info');
            
            // CRITICAL FIX: Hide the overlay before capturing the screenshot
            const dataUrl = await hideOverlayAndCapture(OVERLAY_ID, captureScreenshot);
            
            capturedImage = dataUrl;
            document.getElementById('screenshot-img').src = dataUrl;
            document.getElementById('screenshot-preview').style.display = 'block';
        } catch (error) {
            showNotification('Screenshot failed: ' + error.message, 'error');
        }
    };
    
    document.getElementById('analyze-btn').onclick = async () => {
        const query = document.getElementById('screenshot-query').value.trim() || 'Analyze this image';
        const resultDiv = document.getElementById('screenshot-result');
        
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<div style="padding: 12px; background: #e3f2fd; border-radius: 8px;">⏳ Analyzing with Gemini Vision AI...</div>';
        
        // 🐛 FIX 8: Add log for Screenshot submission (Content Script side)
        console.log(`📸 [SCREENSHOT] Sending screenshot analysis request to backend API (Content Script)...`);

        try {
            const analysis = await analyzeImageWithBackend(capturedImage, query);
            
            const ttsManager = new ResponseVoiceReader('screenshot-result');

            resultDiv.innerHTML = `
                <div style="padding: 16px; background: #e8f5e9; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <strong>🤖 AI Analysis:</strong>
                        ${ttsManager.renderControl()}
                    </div>
                    <div style="white-space: pre-wrap; line-height: 1.6;">
                        ${analysis}
                    </div>
                </div>
            `;
            ttsManager.attachListeners(analysis, false);
        } catch (error) {
            resultDiv.innerHTML = `
                <div style="padding: 12px; background: #ffebee; border-radius: 8px; color: #c62828;">
                    <strong>Error:</strong> ${error.message}
                </div>
            `;
        }
    };
    
    overlay.onclick = (e) => {
        if (e.target === e.currentTarget) {
             if (!e.target.closest('.tts-container')) {
                 overlay.remove();
            }
        }
    };
}

async function analyzeImageWithBackend(imageDataUrl, query) {
    const response = await fetch(`${BACKEND_URL}/api/multimodal/analyze-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            image: imageDataUrl,
            query: query,
            accessibilityMode: currentProfile,
            userId: userId
        })
    });
    
    if (!response.ok) {
        throw new Error(`Backend error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
        throw new Error(data.error || 'Analysis failed');
    }
    
    return data.analysis;
}

// ============================================
// OTHER FEATURES (Hybrid-First Logic applied) (unchanged except for TTS fix)
// ============================================

async function showPromptInterface() {
    const overlay = createOverlay('prompt-overlay', '💭 Ask AI Anything');
    
    overlay.querySelector('.chromeai-modal-body').innerHTML = `
        <div style="padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; color: #333;">💭 Ask AI Anything</h3>
                <button id="back-to-main-btn" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">← Back</button>
            </div>
            <textarea id="prompt-input" placeholder="Ask me anything..." style="width: 100%; height: 120px; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;"></textarea>
            <button id="prompt-submit" style="width: 100%; margin-top: 12px; padding: 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">✨ Ask AI</button>
            <div id="prompt-response" style="margin-top: 16px; display: none;"></div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Back button functionality
    document.getElementById('back-to-main-btn').onclick = () => {
        overlay.remove();
        showMainInterface();
    };
    
    document.getElementById('prompt-submit').onclick = async () => {
        const input = document.getElementById('prompt-input').value.trim();
        if (!input) return;
        
        const responseDiv = document.getElementById('prompt-response');
        responseDiv.style.display = 'block';
        responseDiv.innerHTML = '⏳ Thinking...';
        
        try {
            const response = await callAI(input, { feature: 'PROMPT' });
            // Use formatAIResponse
            const formattedResponse = this.formatAIResponse(response);
            const ttsManager = new ResponseVoiceReader('prompt-response');

            responseDiv.innerHTML = `
                <div style="padding: 12px; background: #e8f5e9; border-radius: 8px; white-space: pre-wrap;">
                    <div style="display: flex; justify-content: flex-end; margin-bottom: 10px;">
                        ${ttsManager.renderControl()}
                    </div>
                    ${formattedResponse}
                </div>`;
            ttsManager.attachListeners(response, false); // Attach listener

        } catch (error) {
            responseDiv.innerHTML = `<div style="padding: 12px; background: #ffebee; border-radius: 8px; color: #c62828;">${error.message}</div>`;
        }
    };
    
    overlay.onclick = (e) => {
        if (e.target === e.currentTarget) {
             if (!e.target.closest('.tts-container')) {
                 overlay.remove();
            }
        }
    };
}

async function activateProofreaderMode() {
    let textToProofread = window.getSelection().toString().trim();
    
    if (!textToProofread) {
        textToProofread = extractMainContent();
    }

    if (!textToProofread) {
        showNotification('Please select text or open a document on the page to proofread.', 'warning');
        return;
    }

    const textForProcessing = textToProofread; 

    const overlay = createOverlay('proofread-overlay', '🔤 Proofreader');
    overlay.querySelector('.chromeai-modal-body').innerHTML = `
        <div style="padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; color: #333;">🔤 Proofreader</h3>
                <button id="back-to-main-btn" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">← Back</button>
            </div>
            <div id="proofread-original" style="margin-bottom: 16px; padding: 12px; background: #f0f0f0; border-radius: 8px; font-size: 14px; white-space: pre-wrap;">
                <strong>Original Text:</strong><br>${textForProcessing}
            </div>
            <div id="proofread-result">
                <div style="padding: 12px; background: #e3f2fd; border-radius: 8px;">⏳ Analyzing with AI...</div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Back button functionality
    document.getElementById('back-to-main-btn').onclick = () => {
        overlay.remove();
        showMainInterface();
    };

    try {
        const prompt = `Proofread the following text for grammar, spelling, and clarity. Respond ONLY with the corrected text, ensuring the output has a smooth flow. Do NOT include any explanations or headers. Selected text: ${textForProcessing}`;
        
        // The callAI logic now prioritizes the specialized Proofreader OT/Nano, then falls back to cloud
        const correctedText = await callAI(prompt, { feature: 'PROOFREAD' });

        // Use formatAIResponse
        const ttsManager = new ResponseVoiceReader('proofread-result');
        const formattedText = this.formatAIResponse(correctedText);
        
        document.getElementById('proofread-result').innerHTML = `
            <div style="padding: 16px; background: #e8f5e9; border-radius: 8px;">
                <div style="display: flex; justify-content: flex-end; margin-bottom: 10px;">
                    ${ttsManager.renderControl()}
                </div>
                <strong>✅ Corrected Text:</strong><br>
                <div id="corrected-output" style="line-height: 1.6; margin-top: 8px;">${formattedText}</div>
                <button id="copy-proofread-btn" style="margin-top: 12px; width: 100%; padding: 10px; background: #4caf50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                    📋 Copy Correction
                </button>
            </div>
        `;
        ttsManager.attachListeners(correctedText, false);
        document.getElementById('copy-proofread-btn').onclick = () => {
            navigator.clipboard.writeText(correctedText);
            showNotification('✓ Copied to clipboard', 'success');
        };
        
    } catch (error) {
        document.getElementById('proofread-result').innerHTML = `
            <div style="padding: 12px; background: #ffebee; border-radius: 8px; color: #c62828;">
                <strong>❌ Error:</strong> ${error.message}
            </div>
        `;
    }
}
// (In chromeai-plus/extension/content.js - REPLACE the existing showSummarizerOptions function)

async function showSummarizerOptions() {
    let textToSummarize = window.getSelection().toString().trim();
    
    // Fallback logic: If nothing is selected, use the whole document.
    if (!textToSummarize) {
        textToSummarize = extractMainContent();
    }
    
    if (textToSummarize.length < 100) {
        showNotification('Not enough content on the page to summarize. Please select more text.', 'warning');
        return;
    }
    
    // Shorten the display text to prevent modal overflow
    const displayText = textToSummarize.substring(0, 500) + (textToSummarize.length > 500 ? '...' : '');
    const fullContent = textToSummarize; // Use this variable for the final prompt

    const overlay = createOverlay('summarizer-overlay', '📄 Summarizer');
    
    // 1. Updated Content: Show original text and a submit button
    overlay.querySelector('.chromeai-modal-body').innerHTML = `
        <div style="padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; color: #333;">📄 Summarizer</h3>
                <button id="back-to-main-btn" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">← Back</button>
            </div>
            <div id="summarizer-original" style="margin-bottom: 16px; padding: 12px; background: #f0f0f0; border-radius: 8px; font-size: 14px; max-height: 100px; overflow-y: auto; white-space: pre-wrap;">
                <strong>Original Text (${fullContent.length} chars):</strong><br>${displayText}
            </div>
            
            <button id="summarize-submit-btn" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 15px;">
                ✨ Summarize Document
            </button>
            
            <div id="summarizer-result" style="margin-top: 16px;"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Back button functionality
    document.getElementById('back-to-main-btn').onclick = () => {
        overlay.remove();
        showMainInterface();
    };

    const resultDiv = document.getElementById('summarizer-result');

    // 2. New Event Listener: Wait for the user to click the button
    document.getElementById('summarize-submit-btn').onclick = async () => {
        
        // Show loading state immediately upon click
        resultDiv.innerHTML = `
            <div style="padding: 12px; background: #e3f2fd; border-radius: 8px;">⏳ Summarizing content with AI...</div>
        `;

        try {
            const prompt = `Summarize the following document concisely, clearly, and using bullet points for key takeaways. Document text: ${fullContent}`;
            
            // The callAI logic now prioritizes the dedicated Summarize OT/Nano, then falls back to cloud
            const summary = await callAI(prompt, { feature: 'SUMMARIZE' });

            // Use formatAIResponse
            const ttsManager = new ResponseVoiceReader('summarizer-result');
            const formattedSummary = this.formatAIResponse(summary);

            resultDiv.innerHTML = `
                <div style="padding: 16px; background: #e8f5e9; border-radius: 8px;">
                    <div style="display: flex; justify-content: flex-end; margin-bottom: 10px;">
                        ${ttsManager.renderControl()}
                    </div>
                    <strong>🤖 Summary:</strong><br>
                    <div id="summary-output" style="line-height: 1.6; margin-top: 8px;">${formattedSummary}</div>
                    <button id="copy-summary-btn" style="margin-top: 12px; width: 100%; padding: 10px; background: #4caf50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        📋 Copy Summary
                    </button>
                </div>
            `;
            ttsManager.attachListeners(summary, false);
            document.getElementById('copy-summary-btn').onclick = () => {
                navigator.clipboard.writeText(summary);
                showNotification('✓ Copied to clipboard', 'success');
            };
        } catch (error) {
            resultDiv.innerHTML = `
                <div style="padding: 12px; background: #ffebee; border-radius: 8px; color: #c62828;">
                    <strong>❌ Error:</strong> ${error.message}
                </div>
            `;
        }
    };
    
    overlay.onclick = (e) => {
        if (e.target === e.currentTarget) {
             if (!e.target.closest('.tts-container')) {
                 overlay.remove();
            }
        }
    };
}

async function showTranslatorInterface() {
    let selectedText = window.getSelection().toString().trim();
    
    if (!selectedText) {
        selectedText = extractMainContent();
    }
    
    if (!selectedText) {
        showNotification('Please select text or open a document to translate.', 'warning');
        return;
    }

    const overlay = createOverlay('translator-overlay', '🌐 Translator');
    
    overlay.querySelector('.chromeai-modal-body').innerHTML = `
        <div style="padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; color: #333;">🌐 Translator</h3>
                <button id="back-to-main-btn" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">← Back</button>
            </div>
            <div id="translate-original" style="margin-bottom: 16px; padding: 12px; background: #f0f0f0; border-radius: 8px; font-size: 14px; max-height: 100px; overflow-y: auto; white-space: pre-wrap;">
                <strong>Selected Text:</strong><br>${selectedText.substring(0, 150)}...
            </div>
            
            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Translate to:</label>
            <select id="translate-target-language" style="width: 100%; padding: 10px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; margin-bottom: 12px;">
                ${generateLanguageOptionsHtml('Spanish')}
            </select>
            
            <button id="translate-submit-btn" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 15px;">
                ✨ Translate
            </button>
            
            <div id="translation-result" style="margin-top: 16px;"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Back button functionality
    document.getElementById('back-to-main-btn').onclick = () => {
        overlay.remove();
        showMainInterface();
    };

    document.getElementById('translate-submit-btn').onclick = async () => {
        const targetLanguage = document.getElementById('translate-target-language').value;
        const resultDiv = document.getElementById('translation-result');
        
        resultDiv.innerHTML = `<div style="padding: 12px; background: #e3f2fd; border-radius: 8px;">⏳ Translating to ${targetLanguage}...</div>`;

        try {
            const prompt = `Translate the following text into ${targetLanguage}. Provide only the translation. Selected text: ${selectedText}`;
            
            // The callAI logic now prioritizes the dedicated Translate OT/Nano, then falls back to cloud
            const translation = await callAI(prompt, { feature: 'TRANSLATE' });

            // Use formatAIResponse
            const ttsManager = new ResponseVoiceReader('translation-result');
            const formattedTranslation = this.formatAIResponse(translation);

            resultDiv.innerHTML = `
                <div style="padding: 16px; background: #e8f5e9; border-radius: 8px;">
                    <div style="display: flex; justify-content: flex-end; margin-bottom: 10px;">
                        ${ttsManager.renderControl()}
                    </div>
                    <strong>🌐 Translation (${targetLanguage}):</strong><br>
                    <div id="translation-output" style="line-height: 1.6; margin-top: 8px;">${formattedTranslation}</div>
                    <button id="copy-translate-btn" style="margin-top: 12px; width: 100%; padding: 10px; background: #4caf50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        📋 Copy Translation
                    </button>
                </div>
            `;
            ttsManager.attachListeners(translation, false);
            document.getElementById('copy-translate-btn').onclick = () => {
                navigator.clipboard.writeText(translation);
                showNotification('✓ Copied to clipboard', 'success');
            };
        } catch (error) {
            resultDiv.innerHTML = `
                <div style="padding: 12px; background: #ffebee; border-radius: 8px; color: #c62828;">
                    <strong>❌ Error:</strong> ${error.message}
                </div>
            `;
        }
    };
    
    overlay.onclick = (e) => {
        if (e.target === e.currentTarget) {
             if (!e.target.closest('.tts-container')) {
                 overlay.remove();
            }
        }
    };
}

async function activateSimplify() {
    const selectedText = window.getSelection().toString().trim();
    if (!selectedText) {
        showNotification('Please select text on the page to simplify.', 'warning');
        return;
    }

    const overlay = createOverlay('simplify-content-overlay', '📝 Simplify Text');
    
    // Display the original text and a loading message
    overlay.querySelector('.chromeai-modal-body').innerHTML = `
        <div style="padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; color: #333;">📝 Simplify Text</h3>
                <button id="back-to-main-btn" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">← Back</button>
            </div>
            <div id="simplify-original" style="margin-bottom: 16px; padding: 12px; background: #f0f0f0; border-radius: 8px; font-size: 14px; max-height: 100px; overflow-y: auto; white-space: pre-wrap;">
                <strong>Original Text:</strong><br>${selectedText.substring(0, 500)}...
            </div>
            <div id="simplify-result">
                <div style="padding: 12px; background: #e3f2fd; border-radius: 8px;">
                    ⏳ Simplifying with AI based on your profile (${currentProfile || 'General'})...
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Back button functionality
    document.getElementById('back-to-main-btn').onclick = () => {
        overlay.remove();
        showMainInterface();
    };

    try {
        const simplifiedText = await callAI(selectedText, { isSimplify: true, feature: 'SIMPLIFY' });
        
        // Use formatAIResponse
        const ttsManager = new ResponseVoiceReader('simplify-result');
        const formattedText = this.formatAIResponse(simplifiedText);

        // Display the successful result
        document.getElementById('simplify-result').innerHTML = `
            <div style="padding: 16px; background: #e8f5e9; border-radius: 8px;">
                <div style="display: flex; justify-content: flex-end; margin-bottom: 10px;">
                    ${ttsManager.renderControl()}
                </div>
                <strong>✨ Simplified Text:</strong><br>
                <div id="simplified-output" style="line-height: 1.6; margin-top: 8px;">${formattedText}</div>
                <button id="copy-simplify-btn" style="margin-top: 12px; width: 100%; padding: 10px; background: #4caf50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                    📋 Copy Simplified Text
                </button>
            </div>
        `;
        ttsManager.attachListeners(simplifiedText, false);
        document.getElementById('copy-simplify-btn').onclick = () => {
            navigator.clipboard.writeText(simplifiedText);
            showNotification('✓ Copied to clipboard', 'success');
        };
        
    } catch (error) {
        document.getElementById('simplify-result').innerHTML = `
            <div style="padding: 12px; background: #ffebee; border-radius: 8px; color: #c62828;">
                <strong>❌ Error:</strong> ${error.message}
            </div>
        `;
    }
    
    overlay.onclick = (e) => {
        if (e.target === e.currentTarget) {
             if (!e.target.closest('.tts-container')) {
                 overlay.remove();
            }
        }
    };
}

async function activateVoiceReader() {
    // Call the dedicated voiceReader object's methods, which will create the full controls
    if (window.voiceReader) {
        window.voiceReader.show();
        window.voiceReader.startReading();
        showNotification('🔊 Voice Reader Activated!', 'success');
    } else {
        showNotification('Voice Reader not fully initialized', 'error');
    }
}

// ============================================
// MAIN INTERFACE FUNCTION (unchanged)
// ============================================

function showMainInterface() {
    const overlay = createOverlay('main-interface-overlay', '🤖 ChromeAI Plus Features');
    
    overlay.querySelector('.chromeai-modal-body').innerHTML = `
        <div style="padding: 20px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="margin: 0 0 8px 0; color: #333; font-size: 24px;">🤖 ChromeAI Plus</h2>
                <p style="margin: 0; color: #666; font-size: 14px;">Choose an AI feature to get started</p>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px;">
                <button class="feature-card" id="main-prompt-btn" style="padding: 16px; background: white; border: 2px solid #e0e0e0; border-radius: 12px; cursor: pointer; transition: all 0.3s ease; text-align: center;">
                    <div style="font-size: 32px; margin-bottom: 8px;">💭</div>
                    <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">Prompt API</div>
                    <div style="font-size: 11px; color: #666;">AI conversations</div>
                </button>
                
                <button class="feature-card" id="main-proofread-btn" style="padding: 16px; background: white; border: 2px solid #e0e0e0; border-radius: 12px; cursor: pointer; transition: all 0.3s ease; text-align: center;">
                    <div style="font-size: 32px; margin-bottom: 8px;">🔤</div>
                    <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">Proofreader</div>
                    <div style="font-size: 11px; color: #666;">Grammar check</div>
                </button>
                
                <button class="feature-card" id="main-summarize-btn" style="padding: 16px; background: white; border: 2px solid #e0e0e0; border-radius: 12px; cursor: pointer; transition: all 0.3s ease; text-align: center;">
                    <div style="font-size: 32px; margin-bottom: 8px;">📄</div>
                    <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">Summarizer</div>
                    <div style="font-size: 11px; color: #666;">Condense content</div>
                </button>
                
                <button class="feature-card" id="main-translate-btn" style="padding: 16px; background: white; border: 2px solid #e0e0e0; border-radius: 12px; cursor: pointer; transition: all 0.3s ease; text-align: center;">
                    <div style="font-size: 32px; margin-bottom: 8px;">🌐</div>
                    <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">Translator</div>
                    <div style="font-size: 11px; color: #666;">Multi-language</div>
                </button>
                
                <button class="feature-card" id="main-screenshot-btn" style="padding: 16px; background: white; border: 2px solid #e0e0e0; border-radius: 12px; cursor: pointer; transition: all 0.3s ease; text-align: center;">
                    <div style="font-size: 32px; margin-bottom: 8px;">📸</div>
                    <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">Screenshot AI</div>
                    <div style="font-size: 11px; color: #666;">Analyze images</div>
                </button>
                
                <button class="feature-card" id="main-ocr-btn" style="padding: 16px; background: white; border: 2px solid #e0e0e0; border-radius: 12px; cursor: pointer; transition: all 0.3s ease; text-align: center;">
                    <div style="font-size: 32px; margin-bottom: 8px;">🖼️</div>
                    <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">OCR Translate</div>
                    <div style="font-size: 11px; color: #666;">Extract & translate</div>
                </button>
                
                <button class="feature-card" id="main-simplify-btn" style="padding: 16px; background: white; border: 2px solid #e0e0e0; border-radius: 12px; cursor: pointer; transition: all 0.3s ease; text-align: center;">
                    <div style="font-size: 32px; margin-bottom: 8px;">📝</div>
                    <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">Simplify</div>
                    <div style="font-size: 11px; color: #666;">Easy reading</div>
                </button>
                
                <button class="feature-card" id="main-voice-btn" style="padding: 16px; background: white; border: 2px solid #e0e0e0; border-radius: 12px; cursor: pointer; transition: all 0.3s ease; text-align: center;">
                    <div style="font-size: 32px; margin-bottom: 8px;">🔊</div>
                    <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">Voice Reader</div>
                    <div style="font-size: 11px; color: #666;">Intelligent TTS</div>
                </button>
            </div>
            
            <div style="text-align: center; padding: 12px; background: #f8f9fa; border-radius: 8px; font-size: 12px; color: #666;">
                💡 Tip: Click on any feature to start using AI assistance
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Add hover effects
    const style = document.createElement('style');
    style.textContent = `
        .feature-card:hover {
            border-color: #667eea !important;
            transform: translateY(-2px) !important;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15) !important;
        }
    `;
    document.head.appendChild(style);
    
    // Event listeners for main interface buttons
    document.getElementById('main-prompt-btn').onclick = () => {
        overlay.remove();
        showPromptInterface();
    };
    
    document.getElementById('main-proofread-btn').onclick = () => {
        overlay.remove();
        activateProofreaderMode();
    };
    
    document.getElementById('main-summarize-btn').onclick = () => {
        overlay.remove();
        showSummarizerOptions();
    };
    
    document.getElementById('main-translate-btn').onclick = () => {
        overlay.remove();
        showTranslatorInterface();
    };
    
    document.getElementById('main-screenshot-btn').onclick = () => {
        overlay.remove();
        captureAndAnalyzeScreenshot();
    };
    
    document.getElementById('main-ocr-btn').onclick = () => {
        overlay.remove();
        activateOCRTranslate();
    };
    
    document.getElementById('main-simplify-btn').onclick = () => {
        overlay.remove();
        activateSimplify();
    };
    
    document.getElementById('main-voice-btn').onclick = () => {
        overlay.remove();
        activateVoiceReader();
    };
    
    overlay.onclick = (e) => {
        if (e.target === e.currentTarget) {
             if (!e.target.closest('.tts-container')) {
                 overlay.remove();
            }
        }
    };
}

// ============================================
// HELPER FUNCTIONS (updated applyProfileStyles)
// ============================================

/**
 * Creates the modal overlay container with fixed positioning for reliable centering.
 */
function createOverlay(id, title) {
    const overlay = document.createElement('div');
    overlay.id = id;
    
    // FIX 1: Add the whitelisting class for ADHD/Focus Mode
    overlay.classList.add('chromeai-overlay'); 
    
    // CRITICAL FIX: Use 'top/left/transform' centering for stability
    overlay.style.cssText = `
        position: fixed; 
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%); /* Fix: Changed -55% to -50% for correct centering */
        
        background: rgba(0,0,0,0.6); 
        z-index: 999999;
        display: flex; /* For contents */
        align-items: center; 
        justify-content: center;
        animation: fadeIn 0.2s;
        /* Ensure overlay container covers max possible area without relying on stretch */
        width: 100%;
        height: 100%;
        pointer-events: none; /* Allow clicks to pass through to underlying content for dismissal */
    `;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: white; border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        max-width: 600px; width: 90%; max-height: 85vh; overflow-y: auto;
        pointer-events: auto; /* Re-enable clicks for the modal itself */
    `;
    
    modal.innerHTML = `
        <div style="padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 16px 16px 0 0; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0;">${title}</h3>
            <button class="close-btn" style="background: rgba(255,255,255,0.2); border: none; color: white; font-size: 20px; width: 32px; height: 32px; border-radius: 50%; cursor: pointer;">✕</button>
        </div>
        <div class="chromeai-modal-body"></div>
    `;
    
    modal.querySelector('.close-btn').onclick = () => {
         // Stop any running TTS before closing
        const ttsContainer = modal.querySelector('.tts-container');
        if (ttsContainer) {
            const ttsManager = window.activeTTSManagers?.[id];
            if (ttsManager) ttsManager.stop();
        }
        overlay.remove();
    };
    
    overlay.appendChild(modal);
    return overlay;
}

function showNotification(message, type = 'info') {
    const colors = { success: '#4caf50', error: '#f44336', warning: '#ff9800', info: '#2196f3' };
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px; padding: 16px 24px;
        background: ${colors[type]}; color: white; border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 9999999;
        font-weight: 500; animation: slideIn 0.3s;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

/**
 * Extracts main readable text content from the current page/document, 
 * supporting web pages, PDFs, and Google Docs.
 */
function extractMainContent() {
    // First check if it's a PDF
    if (window.pdfProcessor && window.pdfProcessor.isPDF()) {
        console.log('📄 Extracting PDF content...');
        // FIX: Directly rely on pdfProcessor.extractText for all PDF cases
        return cleanText(window.pdfProcessor.extractText());
    }
    
    const hostname = window.location.hostname;
    const url = window.location.href;
    let text = '';
    
    // 1. Google Docs Detection
    if (hostname === 'docs.google.com') {
        console.log('Extraction: Google Docs');
        const paragraphs = document.querySelectorAll('.kix-paragraphrenderer');
        if (paragraphs.length > 0) {
            paragraphs.forEach(p => {
                const content = p.textContent.trim();
                if (content && content.length > 0) {
                    // FIX: Use simple newline to concatenate paragraphs, cleanText will handle formatting
                    text += content + '\n\n'; 
                }
            });
            if (text.trim().length > 0) {
                return cleanText(text);
            }
        }
        const content = document.querySelector('.kix-page-content');
        if (content && content.textContent.trim().length > 0) {
             text = content.textContent;
        }
    }
    
    // 2. PDF Viewer Detection (Redundant due to pdfProcessor check above, keeping minimal for safety)
    else if (url.endsWith('.pdf') || document.querySelector('.textLayer')) {
        console.log('Extraction: PDF Viewer (Fallback)');
         if (window.pdfProcessor && typeof window.pdfProcessor.extractText === 'function') {
            text = window.pdfProcessor.extractText();
         } else {
            const textLayers = document.querySelectorAll('.textLayer');
            textLayers.forEach(layer => {
                text += layer.textContent + '\n\n';
            });
         }
    }

    // 3. Word/Office Online Detection (Generic Approach)
    else if (hostname.includes('office.com') || hostname.includes('sharepoint.com')) {
        console.log('Extraction: Office/Word Online');
        const editorContent = document.querySelector('[role="textbox"], [contenteditable="true"], .WACContainer');
        if (editorContent) {
            text = editorContent.innerText;
        }
    }
    
    // 4. Standard Web Page / Fallback
    else {
        console.log('Extraction: Standard Web Page');
        const selectors = [
            'article', 'main', '[role="main"]', '.content', '#content', '.post-content',
            '.body-content', 
            '[class*="article-body"]', 
            '[class*="story-body"]', 
            '[itemprop*="articleBody"]', 
            '[class*="entry-content"]', 
            '[class*="single-post"]', 
            '[class*="body-text"]' 
        ];
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.innerText.trim().length > 100) {
                text = element.innerText;
                break;
            }
        }
        if (!text) {
             text = document.body.innerText;
        }
    }
    
    return cleanText(text);
}

function cleanText(text) {
    // FIX 1: Preserve paragraph breaks (\n\n) but clean up excessive whitespace/newlines
    return text
        .replace(/\s+/g, ' ')               // Normalize all whitespace to single space
        .replace(/([\n\r]){2,}/g, '\n\n')   // Collapse excessive newlines into two (paragraph break)
        .replace(/\s+([.,!?;:])/g, '$1')    // Remove space before punctuation
        .replace(/\n\s*\n/g, '\n\n')        // Clean up newlines surrounded by spaces
        .trim();
}

function applySettingsToPage(settings) {
    // Reset all styles first
    document.body.style.fontFamily = '';
    document.body.style.fontSize = '';
    document.body.style.filter = '';
    document.body.style.animation = '';
    document.body.style.transition = '';
    
    // Apply dyslexia-friendly font
    if (settings.dyslexiaFont) {
        document.body.style.fontFamily = 'OpenDyslexic, "Comic Sans MS", sans-serif';
    }
    
    // Apply text size
    if (settings.textSize) {
        document.body.style.fontSize = settings.textSize + 'px';
    }
    
    // Apply high contrast
    if (settings.highContrast) {
        document.body.style.filter = 'contrast(1.5)';
    }
    
    // Apply reduce motion
    if (settings.reduceMotion) {
        document.body.style.animation = 'none';
        document.body.style.transition = 'none';
        // Also disable animations on all elements
        const allElements = document.querySelectorAll('*');
        allElements.forEach(el => {
            el.style.animation = 'none';
            el.style.transition = 'none';
        });
    }
}

function displayInsightsOverlay(insights, sessionCount) {
    const overlay = createOverlay('insights-overlay', '📊 Your Learning Insights');
    overlay.querySelector('.chromeai-modal-body').innerHTML = `
        <div style="padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; color: #333;">📊 Your Learning Insights</h3>
                <button id="back-to-main-btn" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">← Back</button>
            </div>
            <div style="background: #e3f2fd; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
                <strong>Sessions Analyzed:</strong> ${sessionCount}
            </div>
            <div style="white-space: pre-wrap; line-height: 1.6;">${insights}</div>
        </div>
    `;
    document.body.appendChild(overlay);
    
    // Back button functionality
    document.getElementById('back-to-main-btn').onclick = () => {
        overlay.remove();
        showMainInterface();
    };
    
    overlay.onclick = (e) => {
        if (e.target === e.currentTarget) {
             if (!e.target.closest('.tts-container')) {
                 overlay.remove();
            }
        }
    };
}

// ============================================
// CRITICAL FIX: STYLE RESET LOGIC
// ============================================

// NEW: Helper to clean up specific, non-class-based inline styles applied by profiles
function clearProfileInlineStyles() {
    // Selectors for elements that might have received ADHD highlights
    const intrusiveSelectors = [
        'main', 'article', '[role="main"]',
        '.content', '.main-content', '.post',
        '.body-content', 
        '[class*="article-body"]', 
        '[class*="story-body"]',
        '[itemprop*="articleBody"]', 
        '[class*="entry-content"]', 
        '[class*="single-post"]', 
        '[class*="body-text"]' 
    ];

    intrusiveSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
            // Clear only the styles potentially set by ADHD's focusMainContent
            el.style.removeProperty('box-shadow');
            el.style.removeProperty('transition');
        });
    });
    
    // Selectors for elements that might have been hidden/dimmed by ADHD
    const distractingSelectors = [
        '[id*="ad"]', '[class*="ad"]', 'iframe[src*="ads"]',
        '[class*="banner"]', '[id*="banner"]', '[class*="popup"]', 
        '[id*="popup"]', '[class*="notification"]',
        'aside', 'nav', '.sidebar', '.advertisement', 'footer'
    ];
    
    distractingSelectors.forEach(selector => {
         try {
            const elements = document.body.querySelectorAll(selector);
            elements.forEach(el => {
                // Clear inline style set by hideDistractingElementsGradually (display: none !important)
                el.style.removeProperty('display'); 
            });
         } catch(e) {}
    });
    
    // Clear styles applied to html tag that might conflict (e.g., from old ADHD code)
    document.documentElement.style.removeProperty('scroll-behavior');
}


// FIX: New function to apply/remove accessibility profiles on the content page
function applyProfileStyles(profileName) {
    
    // CRITICAL FIX 1: Clear inline styles from previous profile/mode BEFORE removing classes
    clearProfileInlineStyles(); 
    
    // 1. Reset all existing accessibility classes from html (best practice)
    document.documentElement.classList.remove(
        'accessibility-dyslexia',
        'accessibility-adhd',
        'accessibility-visual_impairment',
        'accessibility-non_native',
        'chromeai-adhd-enabled'
    );
    // 2. Remove the reading line if present
    const existingLine = document.querySelector('.chromeai-reading-line');
    if (existingLine) {
        existingLine.remove();
    }

    // This handles both switching (removes old classes, adds new one) and
    // turning OFF (removes all classes, runs clearInlineStyles, and does nothing more).
    if (profileName) {
        // Apply new profile if one is selected
        document.documentElement.classList.add(`accessibility-${profileName}`);
        
        if (profileName === 'adhd') {
            // Ensure the ADDD styles are properly triggered for ADHD
            applyADHDStyles(); 
        }
        
        console.log(`✅ Applied profile class: accessibility-${profileName}`);
    } else {
        console.log('✅ Removed all accessibility profile classes.');
    }
}
// ============================================


// Enhanced ADHD Mode Implementation
function applyADHDStyles() {
    console.log('🔄 Applying ADHD styles...');

    // Hide distracting elements
    hideDistractingElementsGradually();

    // Focus main content
    focusMainContent();

    // Add reading line only if enabled
    if (showReadingLine) {
        addReadingLine();
        console.log('✅ Reading line enabled');
    } else {
        console.log('ℹ️ Reading line disabled');
    }

    console.log('🎯 ADHD styles applied');
}

function hideDistractingElementsGradually() {
    const safeSelectors = [
        '[id*="ad"]',
        '[class*="ad"]',
        '[id*="Ad"]',
        '[class*="Ad"]',
        'iframe[src*="ads"]',
        '[class*="banner"]',
        '[id*="banner"]',
        '[class*="popup"]',
        '[id*="popup"]',
        '[class*="notification"]'
    ];

    let hiddenCount = 0;
    safeSelectors.forEach(selector => {
        try {
            // Use document.querySelectorAll on document.body for faster traversal and to avoid extension popups/overlays
            const elements = document.body.querySelectorAll(selector);
            elements.forEach(el => {
                // Check if the element is not an overlay created by the extension itself
                if (el.offsetParent !== null && !el.closest('.chromeai-overlay')) { 
                    el.style.setProperty('display', 'none', 'important'); // Use setProperty for !important
                    hiddenCount++;
                }
            });
        } catch (error) {
            console.log(`❌ Error hiding ${selector}:`, error);
        }
    });

    console.log(`✅ Hid ${hiddenCount} distracting elements`);
}


function focusMainContent() {
    const mainSelectors = [
        'main', 'article', '[role="main"]',
        '.content', '.main-content', '.post',
        '.body-content', 
        '[class*="article-body"]', 
        '[class*="story-body"]',
        '[itemprop*="articleBody"]', 
        '[class*="entry-content"]', 
        '[class*="single-post"]', 
        '[class*="body-text"]' 
    ];

    for (let selector of mainSelectors) {
        const element = document.querySelector(selector);
        if (element) {
            console.log(`✅ Found main content: ${selector}`);

            // Add a subtle highlight (inline style)
            element.style.setProperty('box-shadow', '0 0 0 2px #4285f4', 'important');
            element.style.setProperty('transition', 'box-shadow 0.3s ease', 'important');

            // Smooth scroll to content
            setTimeout(() => {
                element.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }, 100);

            break;
        }
    }
}

function addReadingLine() {
    // Remove any existing reading line
    const existingLine = document.querySelector('.chromeai-reading-line');
    if (existingLine) {
        existingLine.remove();
    }

    const line = document.createElement('div');
    line.className = 'chromeai-reading-line';
    document.body.appendChild(line);

    // Position the line at mouse position
    document.addEventListener('mousemove', (e) => {
        line.style.top = `${e.clientY}px`;
    });
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'TOGGLE_READING_LINE') {
        toggleReadingLine(message.enabled);
        sendResponse({ success: true, enabled: message.enabled });
        return true;
    }
});


// CRITICAL FIX: Call the state loader immediately on script execution
loadProfileAndState();

console.log('✅ ChromeAI Plus content script ready');

// ============================================
// READING LINE TOGGLE FUNCTIONALITY
// ============================================

// Toggle Reading Line Feature
function toggleReadingLine(enabled) {
    showReadingLine = enabled;

    // Save preference to storage
    chrome.storage.local.set({ showReadingLine: enabled }, () => {
        console.log(`📝 Reading line preference saved: ${enabled}`);
    });

    if (!enabled) {
        // Remove existing reading line
        const existingLine = document.querySelector('.chromeai-reading-line');
        if (existingLine) {
            existingLine.remove();
            console.log('🗑️ Reading line removed');
        }
    } 
    
    // FIX 3: When enabling, check for the ADHD class and re-run applyADHDStyles 
    // to ensure the line is added if the profile is active.
    else if (document.documentElement.classList.contains('accessibility-adhd')) {
        applyADHDStyles(); 
        console.log('✅ Reading line re-added via toggle');
    }
}

// Load reading line preference on startup
chrome.storage.local.get(['showReadingLine'], (result) => {
    if (result.showReadingLine !== undefined) {
        showReadingLine = result.showReadingLine;
        console.log(`📖 Reading line preference loaded: ${showReadingLine}`);
    }
});

// Add message listener for reading line toggle
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'TOGGLE_READING_LINE') {
        toggleReadingLine(message.enabled);
        sendResponse({ success: true, enabled: message.enabled });
        return true;
    }
    // NEW: Listen for status updates from the page simplification logic
    if (message.type === 'SIMPLIFY_STATUS') {
        // Do nothing here; this is handled in the listener of the sidepanel.
        // Returning false allows the message to finish asynchronously.
        return false;
    }
});

})();
(async function initializePDFSupport() {
    if (window.pdfProcessor && window.pdfProcessor.isPDF()) {
        console.log('📄 PDF detected, waiting for content load...');
        const loaded = await window.pdfProcessor.waitForPDFLoad();
        if (loaded) {
            console.log('✅ PDF content loaded successfully');
        } else {
            console.log('⚠️ PDF content load timeout');
        }
    }


})();