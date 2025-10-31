const BACKEND_URL = 'http://localhost:5000';
let currentProfile = null;
let accessibilityMode = false;
let userId = null; 
let sidePanelInstance = null; // <-- ADDED GLOBAL INSTANCE VARIABLE

// Define the standard language list for parity
const standardLanguageOptions = [
    { value: 'English', label: 'English' },
    { value: 'Spanish', label: 'Spanish (Español)' },
    { value: 'French', label: 'French (Français)' },
    { value: 'German', label: 'German (Deutsch)' },
    { value: 'Italian', label: 'Italian (Italiano)' },
    { value: 'Portuguese', label: 'Portuguese (Português)' },
    { value: 'Chinese', label: 'Chinese (中文)' }, 
    { value: 'Japanese', label: 'Japanese (日本語)' }, 
    { value: 'Korean', label: 'Korean (한국어)' }, 
    { value: 'Hindi', label: 'Hindi (हिन्दी)' }, 
    { value: 'Arabic', label: 'Arabic (العربية)' } 
];


// ============================================
// NEW: RESPONSE VOICE READER CLASS (Modified)
// ============================================
class ResponseVoiceReader {
    constructor(responseContainerId) {
        this.synth = window.speechSynthesis;
        this.responseContainerId = responseContainerId;
        this.isReading = false;
        this.isPaused = false;
        this.ttsData = []; // Array of {text, lang} objects
        this.currentSegmentIndex = 0;
        this.voices = this.synth.getVoices();

        // Ensure voices are loaded (critical for language detection)
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

    // Main logic to attach listeners to the injected controls
    attachListeners(responseContentText, isOCR) {
        const container = document.getElementById(`tts-container-${this.responseContainerId}`);
        if (!container) return;
        
        this.ttsData = this._prepareTTSData(responseContentText, isOCR);
        
        // Main button listener (handles start/stop/menu toggle)
        container.querySelector('.tts-main-btn').onclick = () => this._handleMainClick();
        
        this._updateMainButton('start');
    }

    _handleMainClick() {
        if (this.isReading && !this.isPaused) {
            this.pause(); // Pause when reading
        } else if (this.isPaused) {
            this.resume(); // Resume when paused
        } else {
            this.start(); // Start when stopped
        }
    }
    
    // _handleMenuAction removed

    _prepareTTSData(responseText, isOCR) {
    const segments = [];
    
    if (isOCR) {
        // Specialized OCR handling based on the structured output
        const originalMatch = responseText.match(/ORIGINAL TEXT:\s*([\s\S]*?)\s*TRANSLATION:/i);
        const translationMatch = responseText.match(/TRANSLATION:\s*([\s\S]*)/i);

        if (originalMatch && originalMatch[1]) {
            const originalText = originalMatch[1].trim();
            const lang = this._detectLanguage(originalText);
            segments.push({ text: originalText, lang: lang, label: 'Original Text' });
        }

        if (translationMatch && translationMatch[1]) {
            const translatedText = translationMatch[1].trim();
            const lang = this._detectLanguage(translatedText);
            segments.push({ text: translatedText, lang: lang, label: 'Translation' });
        }
    } else {
        // Standard handling: Single segment
        const text = responseText.trim();
        const lang = this._detectLanguage(text);
        segments.push({ text: text, lang: lang, label: 'Response' });
    }
    
    // Filter out empty segments and log for debugging
    const validSegments = segments.filter(s => s.text.length > 0);
    console.log("TTS Segments prepared:", validSegments);
    
    return validSegments;
}
    
    // FIX: Improved Language detection
    // FIX: Improved Language detection that supports all languages
_detectLanguage(text) {
    console.log("detect language call for text:", text.substring(0, 50));
    
    // Remove whitespace and check if text is meaningful
    const cleanText = text.trim();
    if (!cleanText || cleanText.length < 3) return 'en';
    
    // Character-based language detection for all supported languages
    if (/[\u4e00-\u9fff]/.test(cleanText)) return 'zh'; // Chinese
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(cleanText)) return 'ja'; // Japanese
    if (/[\uac00-\ud7af]/.test(cleanText)) return 'ko'; // Korean
    if (/[\u0900-\u097f]/.test(cleanText)) return 'hi'; // Hindi
    if (/[\u0600-\u06ff]/.test(cleanText)) return 'ar'; // Arabic
    
    // Latin-based languages
    if (/[áéíóúñÁÉÍÓÚÑ¿¡]/.test(cleanText)) return 'es'; // Spanish
    if (/[àâéèêëîïôœùûüÿçÀÂÉÈÊËÎÏÔŒÙÛÜŸÇ]/.test(cleanText)) return 'fr'; // French
    if (/[äöüßÄÖÜẞ]/.test(cleanText)) return 'de'; // German
    if (/[àèéìíòóùúÀÈÉÌÍÒÓÙÚ]/.test(cleanText)) return 'it'; // Italian
    if (/[àáâãçéêíóôõúÀÁÂÃÇÉÊÍÓÔÕÚ]/.test(cleanText)) return 'pt'; // Portuguese
    
    // Default to English
    return 'en';
}

    _getVoice(langCode) {
    // Map language code to BCP-47 for voice matching
    const langMap = {
        'en': 'en', 'es': 'es', 'fr': 'fr', 'de': 'de', 'it': 'it', 'pt': 'pt',
        'zh': 'zh-CN', 'ja': 'ja-JP', 'ko': 'ko-KR', 'hi': 'hi-IN', 'ar': 'ar'
    };
    
    const targetLang = langMap[langCode] || 'en';
    console.log("Looking for voice for language:", targetLang, "from code:", langCode);

    // Get available voices
    const voices = this.synth.getVoices();
    
    // Try to find the best matching voice
    let preferredVoice = voices.find(v => v.lang.startsWith(targetLang) && v.name.includes('Google')) ||
                        voices.find(v => v.lang.startsWith(targetLang) && v.name.includes('Microsoft')) ||
                        voices.find(v => v.lang.startsWith(targetLang)) ||
                        voices.find(v => v.default && v.lang.startsWith('en')) ||
                        voices[0];
    
    console.log("Selected voice:", preferredVoice?.name, "for lang:", preferredVoice?.lang);
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
    
    // _openMenu and _closeMenu removed

    _speakSegment() {
    if (this.currentSegmentIndex >= this.ttsData.length) {
        this.stop();
        return;
    }
    
    const segment = this.ttsData[this.currentSegmentIndex];
    console.log("Speaking segment:", {
        index: this.currentSegmentIndex,
        lang: segment.lang,
        textLength: segment.text.length,
        label: segment.label
    });
    
    const utterance = new SpeechSynthesisUtterance(segment.text);
    utterance.lang = segment.lang;
    utterance.voice = this._getVoice(segment.lang);
    
    utterance.onstart = () => { 
        console.log("TTS started for language:", segment.lang);
        this._updateMainButton('stop'); 
    };
    
    utterance.onend = () => {
        console.log("TTS ended for segment:", this.currentSegmentIndex);
        this.currentSegmentIndex++;
        if (this.currentSegmentIndex < this.ttsData.length) {
            setTimeout(() => this._speakSegment(), 500); 
        } else { 
            this.stop(); 
        }
    };
    
    utterance.onerror = (e) => { 
        console.error('TTS Error:', e, 'for language:', segment.lang);
        this.stop(); 
    };

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


class ChromeAISidePanel {
    constructor() {
        this.currentOCRScreenshot = null; // Used for OCR/Screenshot features
        this.isVoicePaused = false;
        this.currentUtterance = null;

        this.initializeEventListeners();
        this.loadUserSettings();
        this.loadDarkModeState(); // NEW: Load initial dark mode state
        this.initializeVoiceReader();
    }

    // Simple Language Detection Helper (Used when 'auto' is selected for fast, accurate reading)
    _detectLanguage(text) {
    const cleanText = text.trim();
    if (!cleanText || cleanText.length < 3) return 'en-US';
    
    // Character-based language detection
    if (/[\u4e00-\u9fff]/.test(cleanText)) return 'zh-CN'; // Chinese
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(cleanText)) return 'ja-JP'; // Japanese
    if (/[\uac00-\ud7af]/.test(cleanText)) return 'ko-KR'; // Korean
    if (/[\u0900-\u097f]/.test(cleanText)) return 'hi-IN'; // Hindi
    if (/[\u0600-\u06ff]/.test(cleanText)) return 'ar-SA'; // Arabic
    
    // Latin-based languages
    if (/[áéíóúñÁÉÍÓÚÑ¿¡]/.test(cleanText)) return 'es-ES';
    if (/[àâéèêëîïôœùûüÿçÀÂÉÈÊËÎÏÔŒÙÛÜŸÇ]/.test(cleanText)) return 'fr-FR';
    if (/[äöüßÄÖÜẞ]/.test(cleanText)) return 'de-DE';
    if (/[àèéìíòóùúÀÈÉÌÍÒÓÙÚ]/.test(cleanText)) return 'it-IT';
    if (/[àáâãçéêíóôõúÀÁÂÃÇÉÊÍÓÔÕÚ]/.test(cleanText)) return 'pt-PT';
    
    return 'en-US';
}

    async loadUserSettings() {
        const result = await chrome.storage.local.get(['userId', 'accessibilityProfile', 'settings','showReadingLine']);
        
        if (result.userId && result.userId !== 'anonymous') {
            userId = result.userId;
            this.showMainContent();
            
            if (userId) {
                // CRITICAL PRIVACY FIX: loadProfileFromBackend now only checks local storage.
                this.loadProfileFromBackend(userId);
            }
            
        } else {
            this.showAuthSection();
            return;
        }
        
        // Load Accessibility Profile status
        if (result.accessibilityProfile) {
            currentProfile = result.accessibilityProfile;
            accessibilityMode = true;
            document.getElementById('accessibility-mode-toggle').checked = true;
            this.updateCurrentProfile();
        } else {
            currentProfile = null;
            accessibilityMode = false;
            document.getElementById('accessibility-mode-toggle').checked = false;
        }
        

        // Hide profile selection initially
        document.getElementById('profile-section').style.display = accessibilityMode ? 'block' : 'none';
        
        // REMOVED: Unused this.applySettings(result.settings) logic

        // Load Reading Line preference (add this at the end of the method)
        const readingLineToggle = document.getElementById('reading-line-toggle');
        if (readingLineToggle) {
               readingLineToggle.checked = result.showReadingLine !== false; // Default to true
        }
        this.updateReadingLineToggle(); // Final check to set initial disabled state
}

    showAuthSection() {
        document.getElementById('auth-section').style.display = 'block';
        document.getElementById('main-content').style.display = 'none';
        // Hide all feature interfaces
        document.querySelectorAll('.feature-interface').forEach(el => el.style.display = 'none');
    }

    showMainContent() {
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';
        // Hide all feature interfaces
        document.querySelectorAll('.feature-interface').forEach(el => el.style.display = 'none');
    }

    initializeEventListeners() {
        // --- Auth Listeners ---
        document.getElementById('login-btn').addEventListener('click', () => this.handleAuth('login'));
        document.getElementById('register-btn').addEventListener('click', () => this.handleAuth('register'));
        document.getElementById('logout-btn').addEventListener('click', () => this.logoutUser());
        // NEW: Guest Login Listener
        document.getElementById('guest-login-btn').addEventListener('click', () => this.handleGuestLogin());
                
        // Simplify Web feature listeners
        document.getElementById('simplify-web-btn').addEventListener('click', () => this.showFeatureInterface('simplify-web'));
        document.getElementById('simplify-web-back-btn').addEventListener('click', () => this.hideFeatureInterface('simplify-web'));
        document.getElementById('simplify-web-submit').addEventListener('click', () => this.handleSimplifyWebSubmit());
        document.getElementById('restore-original-btn').addEventListener('click', () => this.handleRestoreOriginal());

        
        // --- Dark Mode Listener ---
        document.getElementById('dark-mode-toggle').addEventListener('change', (e) => this.handleDarkModeToggle(e.target.checked));
        
        // --- Accessibility Listeners ---
        document.getElementById('accessibility-mode-toggle').addEventListener('change', (e) => {
            accessibilityMode = e.target.checked;
            this.updateReadingLineToggle(); // Add after accessibilityMode = e.target.checked

            document.getElementById('profile-section').style.display = accessibilityMode ? 'block' : 'none';
            
            if (!accessibilityMode) {
                currentProfile = null;
                this.updateCurrentProfile();
                this.updateReadingLineToggle(); 
                this.applyAccessibilityStylesToPopup(null);
                chrome.storage.local.set({ accessibilityProfile: null });
            } else if (currentProfile) {
                this.updateCurrentProfile();
                this.updateReadingLineToggle(); 
                this.applyAccessibilityStylesToPopup(currentProfile);
                chrome.storage.local.set({ accessibilityProfile: currentProfile });
            } else {
                 // If enabling but no profile is set, save the state to storage as null
                 chrome.storage.local.set({ accessibilityProfile: null });
            }
        });

        // --- Reading Line Toggle Listener (FIXED) ---
const readingLineToggle = document.getElementById('reading-line-toggle');
if (readingLineToggle) {
    readingLineToggle.addEventListener('change', async (e) => {
        // CRITICAL FIX: Check if the toggle is disabled to prevent accidental state change
        if (e.target.disabled) {
            e.preventDefault();
            e.target.checked = !e.target.checked; // Revert the visual change
            this.showStatus('Reading Line can only be controlled when ADHD profile is active.', 'warning');
            return;
        }

        const enabled = e.target.checked;
        
        // Save preference to storage
        await chrome.storage.local.set({ showReadingLine: enabled });
        
        // Send message to content script to toggle
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            try {
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'TOGGLE_READING_LINE',
                    enabled: enabled
                });
                this.showStatus(`Reading line ${enabled ? 'enabled' : 'disabled'}`, 'success');
            } catch (error) {
                console.warn('Could not toggle reading line:', error.message);
                // Fallback: broadcast to all tabs
                const tabs = await chrome.tabs.query({});
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, {
                        action: 'TOGGLE_READING_LINE',
                        enabled: enabled
                    }).catch(() => {});
                });
            }
        }
    });
}


        
        // --- Profile Listeners ---
        document.querySelectorAll('.profile-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const profile = btn.dataset.profile;
                const isGuest = !userId || userId === 'anonymous'; // Check for guest status

                // --- MODIFIED LOGIC START ---
                if (isGuest) {
                    // Allow the profile to be applied, but show the warning for guest users.
                    this.showStatus('Profile activated temporarily. Log in for personalizes insights.', 'warning');
                    // The original 'return;' statement is removed to allow profile activation to proceed.
                }
                // --- MODIFIED LOGIC END ---

                currentProfile = profile;
                
                document.querySelectorAll('.profile-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                this.updateCurrentProfile();
                this.updateReadingLineToggle(); // Update reading line availability
                
                // This saves the profile to local storage (for persistence across sidepanel re-opens) for all users.
                await chrome.storage.local.set({ accessibilityProfile: profile });
                // CRITICAL PRIVACY FIX: Removed backend save call
                this.saveProfileToBackend(profile); 
                
                this.applyAccessibilityStylesToPopup(profile);
                
                // Only show the success message for logged-in users
                if (!isGuest) {
                    this.showStatus('Profile saved: ' + profile, 'success');
                }
            });
        });
        
        // --- Feature Listeners (Updated for sidepanel interfaces) ---
        document.getElementById('prompt-btn').addEventListener('click', () => this.showFeatureInterface('prompt'));
        document.getElementById('proofread-btn').addEventListener('click', () => this.showFeatureInterface('proofread'));
        document.getElementById('summarize-btn').addEventListener('click', () => this.showFeatureInterface('summarize'));
        document.getElementById('translate-btn').addEventListener('click', () => this.showFeatureInterface('translate'));
        document.getElementById('screenshot-btn').addEventListener('click', () => this.showFeatureInterface('screenshot'));
        document.getElementById('ocr-translate-btn').addEventListener('click', () => this.showFeatureInterface('ocr-translate'));
        document.getElementById('simplify-btn').addEventListener('click', () => this.showFeatureInterface('simplify'));
        document.getElementById('simplify-web-btn').addEventListener('click', () => this.showFeatureInterface('simplify-web'));
        document.getElementById('voice-reader-btn').addEventListener('click', () => this.showFeatureInterface('voice-reader'));
        document.getElementById('insights-btn').addEventListener('click', () => this.showFeatureInterface('insights'));
        
        // --- Back Button Listeners ---
        document.getElementById('prompt-back-btn').addEventListener('click', () => this.hideFeatureInterface('prompt'));
        document.getElementById('proofread-back-btn').addEventListener('click', () => this.hideFeatureInterface('proofread'));
        document.getElementById('summarize-back-btn').addEventListener('click', () => this.hideFeatureInterface('summarize'));
        document.getElementById('translate-back-btn').addEventListener('click', () => this.hideFeatureInterface('translate'));
        document.getElementById('simplify-back-btn').addEventListener('click', () => this.hideFeatureInterface('simplify'));
        document.getElementById('simplify-web-back-btn').addEventListener('click', () => this.hideFeatureInterface('simplify-web'));
        document.getElementById('voice-reader-back-btn').addEventListener('click', () => this.hideFeatureInterface('voice-reader'));
        document.getElementById('ocr-translate-back-btn').addEventListener('click', () => this.hideFeatureInterface('ocr-translate'));
        document.getElementById('screenshot-back-btn').addEventListener('click', () => this.hideFeatureInterface('screenshot'));
        document.getElementById('insights-back-btn').addEventListener('click', () => this.hideFeatureInterface('insights'));
        
        // --- Feature Action Listeners ---
        document.getElementById('prompt-submit').addEventListener('click', () => this.handlePromptSubmit());
        document.getElementById('proofread-submit').addEventListener('click', () => this.handleProofreadSubmit());
        document.getElementById('summarize-submit').addEventListener('click', () => this.handleSummarizeSubmit());
        document.getElementById('translate-submit').addEventListener('click', () => this.handleTranslateSubmit());
        document.getElementById('simplify-submit').addEventListener('click', () => this.handleSimplifySubmit());
        document.getElementById('voice-read-submit').addEventListener('click', () => this.handleVoiceReadSubmit());
        document.getElementById('voice-stop-btn').addEventListener('click', () => this.handleVoiceStop());
        document.getElementById('ocr-translate-submit').addEventListener('click', () => this.handleOCRTranslateSubmit());
        
        // --- Source Button Listeners ---
        // Proofreader source buttons
        document.getElementById('proofread-selected-btn').addEventListener('click', () => this.switchTextSource('proofread', 'selected'));
        
        // Summarizer source buttons
        document.getElementById('summarize-selected-btn').addEventListener('click', () => this.switchTextSource('summarize', 'selected'));
        
        // Translator source buttons
        document.getElementById('translate-selected-btn').addEventListener('click', () => this.switchTextSource('translate', 'selected'));
        document.getElementById('simplify-selected-btn').addEventListener('click', () => this.switchTextSource('simplify', 'selected')); 
        // Voice Reader source buttons
        document.getElementById('voice-selected-btn').addEventListener('click', () => this.switchTextSource('voice-reader', 'selected'));
        document.getElementById('voice-page-btn').addEventListener('click', () => this.switchTextSource('voice-reader', 'page'));
        
        // OCR source buttons
        document.getElementById('ocr-upload-btn').addEventListener('click', () => this.switchOCRSource('upload'));
        document.getElementById('ocr-screenshot-btn').addEventListener('click', () => this.switchOCRSource('screenshot'));
        
        // OCR Upload Listeners ---
        document.getElementById('ocr-upload-area').addEventListener('click', () => document.getElementById('ocr-image-input').click());
        document.getElementById('ocr-image-input').addEventListener('change', (e) => this.handleOCRImageUpload(e));
        document.getElementById('remove-ocr-image').addEventListener('click', () => this.removeOCRImage());
        
        // OCR Screenshot Listeners ---
        document.getElementById('capture-screenshot-btn').addEventListener('click', () => this.captureOCRImage());
        document.getElementById('remove-ocr-screenshot').addEventListener('click', () => this.removeOCRScreenshot());
        
        // Voice Reader Controls ---
        document.getElementById('voice-speed').addEventListener('input', (e) => this.updateVoiceControl('speed', e.target.value));
        document.getElementById('voice-pitch').addEventListener('input', (e) => this.updateVoiceControl('pitch', e.target.value));
        document.getElementById('voice-volume').addEventListener('input', (e) => this.updateVoiceControl('volume', e.target.value));
        document.getElementById('voice-pause-btn').addEventListener('click', () => this.handleVoicePause());
        
        // --- Screenshot Listeners ---
    const analyzeScreenshotBtn = document.getElementById('analyze-screenshot-btn');
    if (analyzeScreenshotBtn) analyzeScreenshotBtn.addEventListener('click', () => this.handleScreenshotAnalysis());
        // Main capture button for screenshot interface
        const captureMainBtn = document.getElementById('capture-screenshot-main');
        if (captureMainBtn) {
            captureMainBtn.addEventListener('click', () => this.captureScreenshot());
        }
        
        // --- OCR Response Listeners ---
        document.getElementById('copy-ocr-response').addEventListener('click', () => this.copyOCRResponse());
        document.getElementById('clear-ocr-response').addEventListener('click', () => this.clearOCRResponse());
    }

    async loadDarkModeState() {
        const result = await chrome.storage.local.get(['darkModeEnabled']);
        const isDark = result.darkModeEnabled === true;
        document.getElementById('dark-mode-toggle').checked = isDark;
        this.applyDarkModeStyles(isDark);
    }

    handleDarkModeToggle(isDark) {
        this.applyDarkModeStyles(isDark);
        chrome.storage.local.set({ darkModeEnabled: isDark });
        this.showStatus(`Dark Mode ${isDark ? 'Enabled 🌙' : 'Disabled ☀️'}`, 'info');
    }

    applyDarkModeStyles(isDark) {
        document.body.classList.toggle('dark-mode', isDark);
    }

    // === NEW UTILITY METHOD: Scroll to Element ===
    /**
     * Smoothly scrolls the side panel viewport to the given element ID.
     * @param {string} elementId 
     */
    _scrollToResponse(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            // Use setTimeout to ensure the DOM has rendered the element/content before scrolling
            setTimeout(() => {
                element.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start' 
                });
            }, 50);
        }
    }
    // === END NEW UTILITY METHOD ===

    // === NEW UTILITY METHOD: Robust Message Sender ===
    async sendMessageToContentScript(tabId, message) {
        return new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tabId, message, (response) => {
                if (chrome.runtime.lastError) {
                    // This catches "Could not establish connection. Receiving end does not exist."
                    const error = new Error('Failed to connect to content script. Try reloading the webpage.');
                    error.originalMessage = chrome.runtime.lastError.message;
                    return reject(error);
                }
                if (!response) {
                    return reject(new Error('Content script sent an empty or undefined response.'));
                }
                resolve(response);
            });
        });
    }

    // === AI Response Formatting ===
    formatAIResponse(text) {
        if (!text) return '';
        
        // 1. Convert **bold** to <strong>bold</strong>. This fixes the user's issue.
        let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // 2. Convert code blocks (```language\ncode\n```) to <pre>
        html = html.replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (match, p1) => {
            // Apply dark mode background if body has dark-mode class
            const isDark = document.body.classList.contains('dark-mode');
            const bg = isDark ? '#333333' : '#f8f8f8';
            const color = isDark ? '#f0f0f0' : '#333';
            
            return `<pre style="background:${bg}; color:${color}; padding: 10px; border-radius: 6px; overflow-x: auto; margin: 10px 0; font-family: monospace;"><code>${p1.trim()}</code></pre>`;
        });

        // 3. Convert list items (* or -) to HTML format
        // Finds newline followed by *, -, or number + dot, and converts to a bullet point symbol.
        // It relies on double newlines being handled by the main newline replacement later.
        html = html.replace(/(\r?\n)([*-] )/g, '$1&bull; ');

        // 4. Convert newlines to <br> for general display outside <pre>
        // Note: This needs to run *after* the markdown replacements above.
        html = html.replace(/\r?\n/g, '<br>');

        // 5. Clean up leading/trailing <br> tags
        html = html.replace(/^(<br>)+|(<br>)+$/g, '');

        return html;
    }
    

    // === SCREENSHOT FUNCTIONALITY (UNCHANGED) ===
    // ... (omitted for brevity, assume unchanged logic)

    initializeScreenshotInterface() {
        // Reset screenshot interface
        const previewDiv = document.getElementById('screenshot-preview');
        const responseDiv = document.getElementById('screenshot-response');
        const queryInput = document.getElementById('screenshot-query');
        const analyzeBtn = document.getElementById('analyze-screenshot-btn');
        const captureBtn = document.getElementById('capture-screenshot-main') || document.getElementById('capture-screenshot-btn');
        
        if (previewDiv) previewDiv.style.display = 'none';
        if (responseDiv) responseDiv.style.display = 'none';
        if (queryInput) queryInput.value = '';
        if (analyzeBtn) analyzeBtn.disabled = true;
        if (captureBtn) captureBtn.disabled = false;
        
        // Reset current screenshot data
        this.currentScreenshotData = null;
        
        // Show status ready message
        this.showStatus('Ready to capture screenshot. Click "Capture Screenshot" to begin.', 'info');
        
        // Return true to indicate successful initialization
        return true;
    }

    async captureScreenshot() {
        try {
            this.showStatus('📸 Capturing screenshot...', 'info');
            
            // Initialize screenshot interface first
            await this.initializeScreenshotInterface();
            
            // Request tab focus before capturing
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                throw new Error('No active tab found');
            }
            await chrome.tabs.update(tab.id, { active: true });
            
            // Small delay to ensure tab is focused
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    type: 'CAPTURE_SCREENSHOT'
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve(response);
                });
            });

            if (response && response.success) {
                this.showScreenshotPreview(response.dataUrl);
                this.showStatus('✅ Screenshot captured!', 'success');
                
                // Enable screenshot analysis buttons
                const analyzeBtn = document.getElementById('analyze-screenshot-btn');
                const quickAnalyzeBtn = document.getElementById('quick-analyze-btn');
                if (analyzeBtn) analyzeBtn.disabled = false;
                if (quickAnalyzeBtn) quickAnalyzeBtn.disabled = false;
            } else {
                const errorMsg = response ? response.error : 'Unknown error';
                this.showStatus('❌ Failed to capture screenshot: ' + errorMsg, 'error');
            }
        } catch (error) {
            console.error('❌ Screenshot error:', error);
            this.showStatus('❌ Screenshot error: ' + error.message, 'error');
        }
    }

    showScreenshotPreview(dataUrl) {
        const previewImg = document.getElementById('screenshot-img');
        const previewDiv = document.getElementById('screenshot-preview');
        
        previewImg.src = dataUrl;
        previewDiv.style.display = 'block';
        
        // Store the screenshot data
        this.currentScreenshotData = dataUrl;
    }

    async handleScreenshotAnalysis() {
        if (!this.currentScreenshotData) {
            await this.captureScreenshot();
            return;
        }

        const query = document.getElementById('screenshot-query').value.trim();
        if (!query) {
            this.showStatus('Please enter a question or description.', 'error');
            return;
        }

        // Show loader in screenshot response area
        const responseContainer = document.getElementById('screenshot-response');
        responseContainer.innerHTML = `
            <div class="loading-container">
                <div class="loader"></div>
                <p>🤖 Analyzing screenshot...</p>
            </div>
        `;
        responseContainer.style.display = 'block';
        
        // **SCROLL TO LOADER**
        this._scrollToResponse('screenshot-response');

        // 🐛 FIX 8: Add log for Screenshot submission
        console.log(`📸 [SCREENSHOT] Sending screenshot analysis request to backend API...`);

        try {
            const analysis = await this.analyzeImageWithBackend(this.currentScreenshotData, query);
            this.showScreenshotResponse(analysis);
            this.logFeatureUsage('SCREENSHOT');
            console.log(`✅ [SCREENSHOT] Received response from backend API.`);
        } catch (error) {
            this.showStatus('❌ AI analysis failed: ' + error.message, 'error');
        }
    }

    async handleQuickScreenshotAnalysis() {
        if (!this.currentScreenshotData) {
            await this.captureScreenshot();
            return;
        }
        
        await this.analyzeScreenshotWithAI(this.currentScreenshotData, 'Analyze this screenshot and describe what you see. Focus on text content, layout, colors, and important visual elements.');
    }

    async analyzeScreenshotWithAI(dataUrl, query) {
        this.showStatus('🤖 Analyzing with AI...', 'info');
    
    try {
        const analysis = await this.analyzeImageWithBackend(dataUrl, query);
            this.showScreenshotResponse(analysis);
        } catch (error) {
            this.showStatus('❌ AI analysis failed: ' + error.message, 'error');
        }
    }

    showScreenshotResponse(analysis) {
        const responseContainer = document.getElementById('screenshot-response');
        const formattedAnalysis = this.formatAIResponse(analysis);
        
        const isOCR = false;
        const ttsManager = new ResponseVoiceReader('screenshot-response');

        // Store the raw response text for the event listener
        const rawResponseText = analysis;

        responseContainer.style.display = 'block';
        responseContainer.innerHTML = `
            <div class="response-header">
                <h4>🔍 AI Analysis</h4>
                <div class="response-actions">
                    ${ttsManager.renderControl()}
                    <button class="copy-btn" id="screenshot-copy-btn">📋 Copy</button>
                </div>
            </div>
            <div class="response-content">${formattedAnalysis}</div>
        `;
        ttsManager.attachListeners(analysis, isOCR);
        
        // Use an event listener to copy the stored raw text
        document.getElementById('screenshot-copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(rawResponseText)
                .then(() => sidePanelInstance.showStatus('✓ Copied to clipboard', 'success'))
                .catch(e => sidePanelInstance.showStatus('❌ Failed to copy: ' + e.message, 'error'));
        });
        
        // **SCROLL TO RESPONSE**
        this._scrollToResponse('screenshot-response');
    }

async analyzeImageWithBackend(imageDataUrl, query) {
    const response = await fetch(`http://localhost:5000/api/multimodal/analyze-image`, {
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

    // === AUTH METHODS (UPDATED) ===
    getAuthCredentials() {
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value.trim();
        return { email, password };
    }

    async handleGuestLogin() {
        userId = 'anonymous';
        currentProfile = null; // Ensure guest starts with no active profile
        accessibilityMode = false;

        // Use 'anonymous' as the user ID for guest mode. This bypasses backend registration/login.
        await chrome.storage.local.set({ 
            userId: 'anonymous', 
            accessibilityProfile: null // No profile saved for guest
        });

        document.getElementById('accessibility-mode-toggle').checked = false;
        this.updateCurrentProfile();
        this.applyAccessibilityStylesToPopup(null);
        
        // --- START OF GUEST-SPECIFIC FIX ---
        // 1. Ensure Accessibility Mode is OFF
        accessibilityMode = false;
        // 2. Explicitly hide the profile selection section
        document.getElementById('profile-section').style.display = 'none';
        // --- END OF GUEST-SPECIFIC FIX ---

        this.showMainContent();
        this.showStatus('Welcome, Guest! Functionality is limited. Log in to save preferences.', 'info');
    }

    async handleAuth(action) {
        const { email, password } = this.getAuthCredentials();
        const messageEl = document.getElementById('auth-message');
        messageEl.textContent = '';

        if (!email || !password) {
            messageEl.textContent = 'Please enter both email and password.';
            return;
        }

        const endpoint = action === 'login' ? 'login' : 'register';
        const button = document.getElementById(`${action}-btn`);
        button.disabled = true;
        messageEl.textContent = 'Processing...';

        try {
            const response = await fetch(`http://localhost:5000/api/auth/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();

            if (data.success) {
                userId = data.userId; 
                await chrome.storage.local.set({ userId: userId });
                
                // CRITICAL PRIVACY FIX: loadProfileFromBackend will now only check local storage
                this.loadProfileFromBackend(userId); 
                
                this.showMainContent();
                document.getElementById('profile-section').style.display = 'none';
                this.applyAccessibilityStylesToPopup(null);
                
                this.showStatus(`Welcome, ${userId}!`, 'success');
            } else {
                messageEl.textContent = data.error || `Authentication failed for ${action}.`;
            }
        } catch (error) {
            messageEl.textContent = 'Network error. Is the Flask backend running?';
            console.error('Auth network error:', error);
        } finally {
            button.disabled = false;
        }
    }

    async logoutUser() {
        userId = 'anonymous';
        currentProfile = null;
        accessibilityMode = false;
        
        await chrome.storage.local.set({ userId: 'anonymous', accessibilityProfile: null });
        
        document.getElementById('accessibility-mode-toggle').checked = false;
        document.getElementById('profile-section').style.display = 'none';
        
        this.applyAccessibilityStylesToPopup(null);
        // Removed: this.applyProfileToContent(null); -> This is now handled by the storage listener in content.js
        
        this.showAuthSection();
        this.showStatus('Logged out successfully.', 'info');
    }

    // === FEATURE ACTIVATION (UNCHANGED) ===
    async activateFeature(feature) {
        this.showStatus(`Activating ${feature}...`, 'success');
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        try {
            await chrome.tabs.sendMessage(tab.id, {
                type: `ACTIVATE_${feature}`,
                data: { profile: currentProfile, accessibilityMode, userId }
            });
            
            this.logFeatureUsage(feature);
        } catch (error) {
            this.showStatus('Error: ' + error.message, 'error');
        }
    }

    async showInsights() {
        try {
            this.showStatus('Loading insights...', 'success');
            
            const response = await fetch(`http://localhost:5000/api/analytics/insights/${userId}`);
            const data = await response.json();
            
            if (data.success) {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                
                await chrome.tabs.sendMessage(tab.id, {
                    type: 'SHOW_INSIGHTS',
                    insights: data.insights,
                    sessionCount: data.session_count
                });
                
            } else {
                this.showStatus('Failed to load insights: ' + (data.error || 'Unknown error from backend'), 'error');
            }
        } catch (error) {
            this.showStatus('Error: ' + error.message, 'error');
        }
    }

    // === PROFILE MANAGEMENT (UPDATED) ===
    updateCurrentProfile() {
        const profileEl = document.getElementById('current-profile');
        if (currentProfile) {
            const names = {
                'dyslexia': 'Dyslexia Support',
                'adhd': 'ADHD Focus',
                'visual_impairment': 'Visual Support',
                // Removed: 'non_native': 'Language Learner'
            };
            profileEl.textContent = `Active: ${names[currentProfile]}`;
            profileEl.style.display = 'block';
            
            document.querySelectorAll('.profile-btn').forEach(btn => {
                if (btn.dataset.profile === currentProfile) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            
        } else {
            profileEl.style.display = 'none';
            document.querySelectorAll('.profile-btn').forEach(btn => btn.classList.remove('active'));
        }
        
        this.applyProfileToContent(currentProfile); 
    }

    // CRITICAL FIX: Implement logic to disable/enable toggle based on ADHD state
    updateReadingLineToggle() {
        const readingLineToggle = document.getElementById('reading-line-toggle');
        
        if (!readingLineToggle) return;
        
        const isADHDActive = accessibilityMode && currentProfile === 'adhd';
        
        // 1. Lock/Unlock the toggle
        readingLineToggle.disabled = !isADHDActive;
        
        // 2. If ADHD is NOT active, force state off and tell content script to remove the line.
        if (!isADHDActive) {
            // Only uncheck if it's currently checked, to send message only when necessary
            if (readingLineToggle.checked) {
                readingLineToggle.checked = false;
                
                // Send message to content script to remove the line
                chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                    if (tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: 'TOGGLE_READING_LINE',
                            enabled: false
                        }).catch(() => {});
                    }
                });
            }
            this.showStatus('Reading Line is disabled when not in ADHD Mode.', 'info');
        } else {
            // If ADHD is active, show status based on current toggle state
            if (readingLineToggle.checked) {
                this.showStatus('Reading Line is currently ENABLED.', 'success');
            } else {
                this.showStatus('ADHD profile active. Reading Line is available.', 'info');
            }
        }
    }


    async applyProfileToContent(profileName) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        try {
            await chrome.tabs.sendMessage(tab.id, {
                type: 'APPLY_PROFILE',
                profile: profileName 
            });
        } catch (error) {
            console.warn('Could not send APPLY_PROFILE message:', error.message);
        }
    }

    // CRITICAL PRIVACY FIX: Retained for profile persistence in local storage only
    async saveProfileToBackend(profile) {
        // This function is now responsible only for setting local storage.
        await chrome.storage.local.set({ accessibilityProfile: profile });
    }

    // CRITICAL PRIVACY FIX: loadProfileFromBackend now only checks local storage
    async loadProfileFromBackend(user_id) {
        const result = await chrome.storage.local.get(['accessibilityProfile']);

        if (result.accessibilityProfile) {
            currentProfile = result.accessibilityProfile;
            accessibilityMode = true;
            document.getElementById('accessibility-mode-toggle').checked = true;
            this.updateCurrentProfile();
            // User feedback changed from 'cloud' to 'local storage'
            this.showStatus('Profile loaded from local storage.', 'info');
        } else {
            currentProfile = null;
            accessibilityMode = false;
        }
        
        // Apply styling based on whatever was found/defaulted
        if (accessibilityMode) {
            this.applyAccessibilityStylesToPopup(currentProfile);
        } else {
            this.applyAccessibilityStylesToPopup(null); 
        }

        // NOTE: The name loadProfileFromBackend is retained to minimize code refactoring, 
        // but its functionality is local-only.
    }


    // === LOGGING/ANALYTICS (UNCHANGED) ===
    async logFeatureUsage(feature) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // 🐛 FIX 1: Safely extract hostname, defaulting to 'extension' if URL is unavailable or invalid.
            let documentType = 'extension_internal'; 
            if (tab && tab.url && tab.url.startsWith('http')) {
                try {
                    documentType = new URL(tab.url).hostname;
                } catch (e) {
                    documentType = 'invalid_url';
                }
            }

            const response = await fetch(`http://localhost:5000/api/analytics/session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    documentType: documentType,
                    featuresUsed: [feature],
                    accessibilityMode: currentProfile
                })
            });
            
            if (response.ok) {
                console.log(`✅ [Analytics] Session log for '${feature}' sent successfully to backend.`);
            } else {
                console.error(`❌ [Analytics] Failed to log usage for ${feature}: Backend status ${response.status}`);
            }

        } catch (error) {
            console.error(`❌ [Analytics] Failed to log usage for ${feature}:`, error);
        }
    }

    // === UTILITY METHODS (UPDATED) ===
    showStatus(message, type = '') {
        // Create a simple status display
        console.log(`${type}: ${message}`);
        
        // You can also show status in the side panel UI if you add a status element
        const statusElement = document.getElementById('pdf-status'); // Using pdf-status as general status
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `status-message ${type}`;
            setTimeout(() => {
                statusElement.textContent = '';
            }, 3000);
        }
    }

    applyAccessibilityStylesToPopup(profileName) { // Used for sidepanel styling
        const body = document.body;
        
        body.style.fontFamily = ''; 
        body.style.lineHeight = '';
        body.style.letterSpacing = '';
        
        body.classList.remove('accessibility-dyslexia', 'accessibility-adhd', 'accessibility-visual_impairment', 'accessibility-non_native');

        if (profileName === 'dyslexia') {
            body.style.fontFamily = "'OpenDyslexic', 'Comic Sans MS', sans-serif";
        }
    }

    // === FEATURE INTERFACE MANAGEMENT (UPDATED) ===
    showFeatureInterface(featureName) {
        // Hide main content
        document.getElementById('main-content').style.display = 'none';
        
        // Hide all feature interfaces
        document.querySelectorAll('.feature-interface').forEach(el => el.style.display = 'none');
        
        // Show the specific feature interface
        const interfaceElement = document.getElementById(`${featureName}-interface`);
        if (interfaceElement) {
            interfaceElement.style.display = 'block';
            
            // Load content for the feature (e.g. default selected text)
            this.loadFeatureContent(featureName);
        }
    }
    
    // Helper to load content when interface is switched
    loadFeatureContent(featureName) {
        // Only load if it's a content-dependent feature
        if (['proofread', 'summarize', 'translate', 'simplify', 'voice-reader'].includes(featureName)) {
            // Default to selected text source
            this.switchTextSource(featureName, 'selected');
        } else if (featureName === 'ocr-translate') {
            this.initializeOCRInterface();
        } else if (featureName === 'screenshot') {
            this.initializeScreenshotInterface();
        } else if (featureName === 'insights') {
            this.loadInsights();
        }
    }
    
    hideFeatureInterface(featureName) {
        const interfaceElement = document.getElementById(`${featureName}-interface`);
        if (interfaceElement) {
            interfaceElement.style.display = 'none';
        }
        this.showMainContent();
    }
    
    // ============================================
    // NEW: External Feature Handler (Context Menu FIX)
    // ============================================
    /**
     * Handles activation from background script (e.g., context menu click).
     * @param {string} featureName - The feature to open ('translate', 'simplify', etc.).
     * @param {string} selectionText - The text selected by the user.
     */
    handleExternalFeatureOpen(featureName, selectionText) {
        this.showFeatureInterface(featureName);
        
        // Pre-fill the selected text if available
        const text = selectionText?.trim() || '';
        const defaultText = 'No text selected. Please select text on the webpage first.';
        
        // Map feature to preview element ID
        const previewElementMap = {
            'proofread': 'proofread-preview',
            'summarize': 'summarize-preview',
            'translate': 'translate-preview',
            'simplify': 'simplify-preview',
            'voice-reader': 'voice-reader-preview'
        };
        
        const previewElementId = previewElementMap[featureName];
        if (previewElementId) {
            const previewEl = document.getElementById(previewElementId);
            if (previewEl) {
                previewEl.textContent = text || defaultText;
                
                // CRITICAL FIX: Ensure source button reflects "Selected Text" and is active
                const selectedBtn = document.getElementById(`${featureName}-selected-btn`);
                const pageBtn = document.getElementById(`${featureName}-page-btn`);

                if (selectedBtn) selectedBtn.classList.add('active');
                if (pageBtn) pageBtn.classList.remove('active');
                
                // CRITICAL FIX: Enable the submit button since content is pre-loaded (if applicable)
                const submitBtnId = `${featureName.replace('-', '')}-submit`;
                const submitBtn = document.getElementById(submitBtnId);
                
                if (submitBtn && text.length > 0) {
                    submitBtn.disabled = false;
                    this.showStatus(`Text pre-loaded from selection. Click '${submitBtn.textContent}' to process.`, 'info');
                } else if (submitBtn) {
                     submitBtn.disabled = true;
                     this.showStatus(defaultText, 'error');
                }
            }
        } else {
             this.showStatus(`Feature '${featureName}' activated. Ready for input.`, 'info');
        }
    }
    

    // === FEATURE HANDLERS ===
    async handlePromptSubmit() {
        const prompt = document.getElementById('prompt-input').value.trim();
        if (!prompt) {
            this.showStatus('Please enter a prompt.', 'error');
            return;
        }

        const responseContainer = document.getElementById('prompt-response');
        responseContainer.innerHTML = `
            <div class="loading-container">
                <div class="loader"></div>
                <p>🤖 Processing with AI...</p>
            </div>
        `;
        responseContainer.style.display = 'block';
        
        // **SCROLL TO LOADER**
        this._scrollToResponse('prompt-response');

        this.showStatus('🤖 Processing with AI...', 'info');
        
        // 🐛 FIX 2: Add log for prompt submission
        console.log(`🧠 [PROMPT] Sending prompt to content script...`);
        
        try {
            // REROUTE TO CONTENT SCRIPT'S CALLAI
            const response = await this.callContentScriptAI('PROMPT', {
                prompt: prompt,
                accessibilityMode: currentProfile,
                userId: userId
            });

            if (response.success) {
                this.showPromptResponse(response.response);
                this.logFeatureUsage('PROMPT');
                console.log(`✅ [PROMPT] Received response from content script.`);
            } else {
                this.showStatus('Error: ' + response.error, 'error');
            }
        } catch (error) {
            this.showStatus('Error: ' + error.message, 'error');
            responseContainer.style.display = 'none';
        }
    }

    showPromptResponse(response) {
        const responseContainer = document.getElementById('prompt-response');
        const formattedResponse = this.formatAIResponse(response);
        
        const isOCR = false;
        const ttsManager = new ResponseVoiceReader('prompt-response');

        // Store the raw response text for the event listener
        const rawResponseText = response;

        responseContainer.style.display = 'block';
        responseContainer.innerHTML = `
            <div class="response-header">
                <h4>🤖 AI Response</h4>
                <div class="response-actions">
                    ${ttsManager.renderControl()} 
                    <button class="copy-btn" id="prompt-copy-btn">📋 Copy</button>
                </div>
            </div>
            <div class="response-content">${formattedResponse}</div>
        `;
        ttsManager.attachListeners(response, isOCR);
        
        // Use an event listener to copy the stored raw text
        document.getElementById('prompt-copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(rawResponseText)
                .then(() => sidePanelInstance.showStatus('✓ Copied to clipboard', 'success'))
                .catch(e => sidePanelInstance.showStatus('❌ Failed to copy: ' + e.message, 'error'));
        });
        
        this._scrollToResponse('prompt-response');
    }

    // Proofread
    async handleProofreadSubmit() {
        const previewElement = document.getElementById('proofread-preview');
        const textToProofread = previewElement.textContent.trim();
        
        if (!textToProofread || textToProofread.includes('No text selected')) {
            this.showStatus('Please select text on the webpage first.', 'error');
            return;
        }

        const responseContainer = document.getElementById('proofread-response');
        responseContainer.innerHTML = `
            <div class="loading-container">
                <div class="loader"></div>
                <p>🔍 Checking grammar and style...</p>
            </div>
        `;
        responseContainer.style.display = 'block';

        // **SCROLL TO LOADER**
        this._scrollToResponse('proofread-response');

        this.showStatus('🔍 Checking grammar...', 'info');
        
        // 🐛 FIX 3: Add log for proofread submission
        console.log(`🔤 [PROOFREAD] Sending proofreading request to content script...`);
        
        try {
            // REROUTE TO CONTENT SCRIPT'S CALLAI
            const prompt = `Proofread the following text for grammar, spelling, punctuation, and style improvements. Provide the corrected version and highlight any major issues found:\n\nSelected text: ${textToProofread}`;
            
            const response = await this.callContentScriptAI('PROOFREAD', {
                prompt: prompt,
                accessibilityMode: currentProfile,
                userId: userId
            });

            if (response.success) {
                this.showProofreadResponse(response.response);
                this.logFeatureUsage('PROOFREAD');
                console.log(`✅ [PROOFREAD] Received response from content script.`);
            } else {
                this.showStatus('Error: ' + response.error, 'error');
            }
        } catch (error) {
            this.showStatus('Error: ' + error.message, 'error');
            responseContainer.style.display = 'none';
        }
    }

    showProofreadResponse(response) {
        const responseContainer = document.getElementById('proofread-response');
        const formattedResponse = this.formatAIResponse(response);
        
        const isOCR = false;
        const ttsManager = new ResponseVoiceReader('proofread-response');

        // Store the raw response text for the event listener
        const rawResponseText = response;

        responseContainer.style.display = 'block';
        responseContainer.innerHTML = `
            <div class="response-header">
                <h4>🔤 Proofreading Results</h4>
                <div class="response-actions">
                    ${ttsManager.renderControl()}
                    <button class="copy-btn" id="proofread-copy-btn">📋 Copy</button>
                </div>
            </div>
            <div class="response-content">${formattedResponse}</div>
        `;
        ttsManager.attachListeners(response, isOCR);
        
        // Use an event listener to copy the stored raw text
        document.getElementById('proofread-copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(rawResponseText)
                .then(() => sidePanelInstance.showStatus('✓ Copied to clipboard', 'success'))
                .catch(e => sidePanelInstance.showStatus('❌ Failed to copy: ' + e.message, 'error'));
        });
        
        // **SCROLL TO RESPONSE**
        this._scrollToResponse('proofread-response');
    }

    // Summarize
    async handleSummarizeSubmit() {
        const previewElement = document.getElementById('summarize-preview');
        const textToSummarize = previewElement.textContent.trim();
        
        if (!textToSummarize || textToSummarize.includes('No text selected')) {
            this.showStatus('Please select text on the webpage first.', 'error');
            return;
        }

        const summaryLength = document.getElementById('summary-length').value;
        const responseContainer = document.getElementById('summarize-response');
        responseContainer.innerHTML = `
            <div class="loading-container">
                <div class="loader"></div>
                <p>📄 Summarizing content...</p>
            </div>
        `;
        responseContainer.style.display = 'block';

        // **SCROLL TO LOADER**
        this._scrollToResponse('summarize-response');

        this.showStatus('📄 Summarizing content...', 'info');

        // 🐛 FIX 4: Add log for summarize submission
        console.log(`📄 [SUMMARIZE] Sending summarization request to content script...`);

        try {
            // REROUTE TO CONTENT SCRIPT'S CALLAI
            const prompt = `Summarize the following document making sure that the output should in the same language as the Document text into a ${summaryLength} summary:\n\nDocument text: ${textToSummarize}`;
            
            const response = await this.callContentScriptAI('SUMMARIZE', {
                prompt: prompt,
                accessibilityMode: currentProfile,
                userId: userId
            });

            if (response.success) {
                this.showSummarizeResponse(response.response);
                this.logFeatureUsage('SUMMARIZE');
                console.log(`✅ [SUMMARIZE] Received response from content script.`);
            } else {
                this.showStatus('Error: ' + response.error, 'error');
                responseContainer.style.display = 'none';
            }
        } catch (error) {
            this.showStatus('Error: ' + error.message, 'error');
            responseContainer.style.display = 'none';
        }
    }

    showSummarizeResponse(response) {
        const responseContainer = document.getElementById('summarize-response');
        const formattedResponse = this.formatAIResponse(response);
        
        const isOCR = false;
        const ttsManager = new ResponseVoiceReader('summarize-response');

        // Store the raw response text for the event listener
        const rawResponseText = response;

        responseContainer.style.display = 'block';
        responseContainer.innerHTML = `
            <div class="response-header">
                <h4>📄 Summary</h4>
                <div class="response-actions">
                    ${ttsManager.renderControl()}
                    <button class="copy-btn" id="summarize-copy-btn">📋 Copy</button>
                </div>
            </div>
            <div class="response-content">${formattedResponse}</div>
        `;
        ttsManager.attachListeners(response, isOCR);
        
        // Use an event listener to copy the stored raw text
        document.getElementById('summarize-copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(rawResponseText)
                .then(() => sidePanelInstance.showStatus('✓ Copied to clipboard', 'success'))
                .catch(e => sidePanelInstance.showStatus('❌ Failed to copy: ' + e.message, 'error'));
        });
        
        this._scrollToResponse('summarize-response');
    }

    // Translate
    async handleTranslateSubmit() {
        const previewElement = document.getElementById('translate-preview');
        const textToTranslate = previewElement.textContent.trim();
        
        if (!textToTranslate || textToTranslate.includes('No text selected')) {
            this.showStatus('Please select text on the webpage first.', 'error');
            return;
        }

        const targetLanguage = document.getElementById('target-language').value;
        const responseContainer = document.getElementById('translate-response');
        responseContainer.innerHTML = `
            <div class="loading-container">
                <div class="loader"></div>
                <p>🌐 Translating to ${targetLanguage}...</p>
            </div>
        `;
        responseContainer.style.display = 'block';

        // **SCROLL TO LOADER**
        this._scrollToResponse('translate-response');

        this.showStatus('🌐 Translating...', 'info');
        
        // 🐛 FIX 5: Add log for translate submission
        console.log(`🌐 [TRANSLATE] Sending translation request to content script...`);

        try {
            // REROUTE TO CONTENT SCRIPT'S CALLAI
            const prompt = `Translate the following text to ${targetLanguage}. Provide only the translation:\n\n${textToTranslate}`;
            
            const response = await this.callContentScriptAI('TRANSLATE', {
                prompt: prompt,
                accessibilityMode: currentProfile,
                userId: userId
            });

            if (response.success) {
                this.showTranslateResponse(response.response);
                this.logFeatureUsage('TRANSLATE');
                console.log(`✅ [TRANSLATE] Received response from content script.`);
            } else {
                this.showStatus('Error: ' + response.error, 'error');
                responseContainer.style.display = 'none';
            }
        } catch (error) {
            this.showStatus('Error: ' + error.message, 'error');
            responseContainer.style.display = 'none';
        }
    }

    showTranslateResponse(response) {
        const responseContainer = document.getElementById('translate-response');
        const formattedResponse = this.formatAIResponse(response);
        
        const isOCR = false;
        const ttsManager = new ResponseVoiceReader('translate-response');

        // Store the raw response text for the event listener
        const rawResponseText = response;

        responseContainer.style.display = 'block';
        responseContainer.innerHTML = `
            <div class="response-header">
                <h4>🌐 Translation</h4>
                <div class="response-actions">
                    ${ttsManager.renderControl()}
                    <button class="copy-btn" id="translate-copy-btn">📋 Copy</button>
                </div>
            </div>
            <div class="response-content">${formattedResponse}</div>
        `;
        ttsManager.attachListeners(response, isOCR);
        
        // Use an event listener to copy the stored raw text
        document.getElementById('translate-copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(rawResponseText)
                .then(() => sidePanelInstance.showStatus('✓ Copied to clipboard', 'success'))
                .catch(e => sidePanelInstance.showStatus('❌ Failed to copy: ' + e.message, 'error'));
        });
        
        this._scrollToResponse('translate-response');
    }

    // Simplify
    async handleSimplifySubmit() {
        const previewElement = document.getElementById('simplify-preview');
        const textToSimplify = previewElement.textContent.trim();
        
        if (!textToSimplify || textToSimplify.includes('No text selected')) {
            this.showStatus('Please select text on the webpage first.', 'error');
            return;
        }

        const simplifyLevel = document.getElementById('simplify-level').value;
        const responseContainer = document.getElementById('simplify-response');
        responseContainer.innerHTML = `
            <div class="loading-container">
                <div class="loader"></div>
                <p>📝 Simplifying text (${simplifyLevel})...</p>
            </div>
        `;
        responseContainer.style.display = 'block';

        // **SCROLL TO LOADER**
        this._scrollToResponse('simplify-response');

        this.showStatus('📝 Simplifying text...', 'info');
        
        // 🐛 FIX 6: Add log for simplify submission
        console.log(`📝 [SIMPLIFY] Sending simplification request to content script...`);

        try {
            // REROUTE TO CONTENT SCRIPT'S CALLAI
            const response = await this.callContentScriptAI('SIMPLIFY', {
                text: textToSimplify,
                level: simplifyLevel,
                accessibilityMode: currentProfile,
                userId: userId
            });

            if (response.success) {
                this.showSimplifyResponse(response.response);
                this.logFeatureUsage('SIMPLIFY');
                console.log(`✅ [SIMPLIFY] Received response from content script.`);
            } else {
                this.showStatus('Error: ' + response.error, 'error');
                responseContainer.style.display = 'none';
            }
        } catch (error) {
            this.showStatus('Error: ' + error.message, 'error');
            responseContainer.style.display = 'none';
        }
    }

    showSimplifyResponse(response) {
        const responseContainer = document.getElementById('simplify-response');
        const formattedResponse = this.formatAIResponse(response);
        
        const isOCR = false;
        const ttsManager = new ResponseVoiceReader('simplify-response');

        // Store the raw response text for the event listener
        const rawResponseText = response;

        responseContainer.style.display = 'block';
        responseContainer.innerHTML = `
            <div class="response-header">
                <h4>📝 Simplified Text</h4>
                <div class="response-actions">
                    ${ttsManager.renderControl()}
                    <button class="copy-btn" id="simplify-copy-btn">📋 Copy</button>
                </div>
            </div>
            <div class="response-content">${formattedResponse}</div>
        `;
        ttsManager.attachListeners(response, isOCR);

        // Use an event listener to copy the stored raw text
        document.getElementById('simplify-copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(rawResponseText)
                .then(() => sidePanelInstance.showStatus('✓ Copied to clipboard', 'success'))
                .catch(e => sidePanelInstance.showStatus('❌ Failed to copy: ' + e.message, 'error'));
        });

        // **SCROLL TO RESPONSE**
        this._scrollToResponse('simplify-response');
    }

        // ============================================
    // SIMPLIFY WEB HANDLERS
    // ============================================
    
    async handleSimplifyWebSubmit() {
        const simplifyLevel = document.getElementById('simplify-web-level').value;
        const statusEl = document.getElementById('simplify-web-status');
        const submitBtn = document.getElementById('simplify-web-submit');
        const restoreBtn = document.getElementById('restore-original-btn');
        
        submitBtn.disabled = true;
        statusEl.style.display = 'block';
        statusEl.style.background = '#e3f2fd';
        statusEl.style.color = '#1976d2';
        statusEl.textContent = 'Extracting webpage content...';
        
        this.showStatus('Extracting webpage content...', 'info');
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            const contentResponse = await this.sendMessageToContentScript(tab.id, {
                type: 'GET_PAGE_TEXT'
            });
            
            const pageContent = contentResponse?.text?.trim();
            
            if (!pageContent || pageContent.length < 100) {
                statusEl.style.background = '#ffebee';
                statusEl.style.color = '#c62828';
                statusEl.textContent = 'Not enough content found on this page.';
                submitBtn.disabled = false;
                return;
            }
            
            const wordCount = Math.round(pageContent.length / 5);
            statusEl.textContent = `Simplifying ${wordCount} words with AI...`;
            this.showStatus('Simplifying content with AI...', 'info');
            
            const response = await this.callContentScriptAI('SIMPLIFY', {
                text: pageContent,
                level: simplifyLevel,
                accessibilityMode: currentProfile,
                userId: userId
            });

            console.log('AI Response:', response);
            console.log('Response keys:', Object.keys(response));

            if (response.success) {
             // Check both possible response formats
            const simplifiedText = response.response || response.simplified || response;
    
              console.log('Simplified content length:', simplifiedText?.length);
    
                 await chrome.tabs.sendMessage(tab.id, {
                 type: 'REPLACE_PAGE_CONTENT',
                 simplifiedContent: simplifiedText,
                 level: simplifyLevel
             });
            
           
                
                statusEl.style.background = '#e8f5e9';
                statusEl.style.color = '#2e7d32';
                statusEl.textContent = '✓ Page simplified successfully!';
                restoreBtn.style.display = 'block';
                this.showStatus('Page simplified successfully!', 'success');
                this.logFeatureUsage('SIMPLIFY_WEB');
            } else {
                throw new Error(response.error || 'AI simplification failed');
            }
            
        } catch (error) {
            statusEl.style.background = '#ffebee';
            statusEl.style.color = '#c62828';
            statusEl.textContent = `Error: ${error.message}`;
            this.showStatus(`Error: ${error.message}`, 'error');
        } finally {
            submitBtn.disabled = false;
        }
    }
    
    async handleRestoreOriginal() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.tabs.sendMessage(tab.id, { type: 'RESTORE_ORIGINAL_CONTENT' });
            
            document.getElementById('restore-original-btn').style.display = 'none';
            const statusEl = document.getElementById('simplify-web-status');
            statusEl.style.background = '#e8f5e9';
            statusEl.style.color = '#2e7d32';
            statusEl.style.display = 'block';
            statusEl.textContent = '✓ Original page restored!';
            this.showStatus('Original page restored!', 'success');
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
        }
    }


    async handleVoiceReadSubmit() {
        const previewElement = document.getElementById('voice-reader-preview');
        let textToRead = previewElement?.textContent.trim() || '';

        const speed = parseFloat(document.getElementById('voice-speed').value);
        const pitch = parseFloat(document.getElementById('voice-pitch').value);
        const volume = parseFloat(document.getElementById('voice-volume').value);

        const statusEl = document.getElementById('voice-reader-status');
        if (statusEl) statusEl.textContent = '';
        
        // Log feature usage
        this.logFeatureUsage('VOICE_READER'); 
        console.log(`🔊 [VOICE_READER] Initiating reading attempt and logging usage.`); 

        // 1. FIX: Ensure content is loaded, especially for 'Whole Page' if preview is empty
        if (!textToRead || textToRead.includes('No text available')) {
            const selectedBtn = document.getElementById('voice-selected-btn');
            const pageBtn = document.getElementById('voice-page-btn');
            let source = 'selected';
            if (pageBtn && pageBtn.classList.contains('active')) {
                source = 'page';
            }
            // Force a content load/refresh. This is crucial for 'Whole Page' to read the full content.
            await this.switchTextSource('voice-reader', source);
            textToRead = previewElement?.textContent.trim() || '';
        }
        
        if (!textToRead || textToRead.includes('No text available')) {
            this.showStatus('No readable content found.', 'error');
            if (statusEl) statusEl.textContent = 'No text to read.';
            return;
        }

        // 2. Language Detection and Voice Selection Disabling
        let detectedLangTag = this._detectLanguage(textToRead);
        const isEnglish = detectedLangTag && detectedLangTag.startsWith('en');
        const voiceSelect = document.getElementById('voice-select');
        
        if (!isEnglish) {
            voiceSelect.value = 'auto'; // Force to auto
            voiceSelect.disabled = true; // Disable voice selection
            const langName = detectedLangTag.split('-')[0];
            this.showStatus(`Detected language: ${langName}. Voice selection disabled.`, 'warning');
            if (statusEl) statusEl.textContent = `Reading in ${langName} (Auto Voice)...`;
        } else {
            voiceSelect.disabled = false; // Enable if English
        }

        // 3. Start reading with the now-available text and adjusted voice settings
        this.showStatus('🔊 Starting voice reading...', 'info');
        if (statusEl) statusEl.textContent = 'Reading...';
        try {
            this._startUtterance(textToRead, { speed, pitch, volume });
        } catch (error) {
            this.showStatus('Error: ' + error.message, 'error');
        }
    }

    handleVoiceStop() {
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
            this.showStatus('⏹️ Voice reading stopped.', 'info');
            document.getElementById('voice-pause-btn').disabled = true;
            document.getElementById('voice-stop-btn').disabled = true;
            document.getElementById('voice-read-submit').disabled = false;
            this.isVoicePaused = false;
        }
    }

    // Internal Speech Utterance Helper
    _startUtterance(text, { speed = 1.0, pitch = 1.0, volume = 1.0 } = {}, options = {}) {
        if (!('speechSynthesis' in window)) {
            this.showStatus('Speech synthesis not supported in this browser.', 'error');
            return;
        }

        try {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = speed;
            utterance.pitch = pitch;
            utterance.volume = volume;

            const voiceSelect = document.getElementById('voice-select');
            
            const selectedVoiceName = voiceSelect ? voiceSelect.value : 'auto';
            
            if (selectedVoiceName === 'auto') {
                // When 'auto' is selected, rely on the browser's engine for best voice/language.
                // Use language detection helper to give the browser a strong hint for quick start/accurate reading.
                const detectedLang = this._detectLanguage(text); 
                utterance.lang = detectedLang; 
                utterance.voice = null; // Let the browser choose the best voice for the detected lang
            } else {
                // If a specific voice is selected (must be English):
                const voices = speechSynthesis.getVoices();
                const selectedVoice = voices.find(v => v.name === selectedVoiceName);
                if (selectedVoice) {
                    utterance.voice = selectedVoice;
                    // Force lang to the voice's language (English)
                    utterance.lang = selectedVoice.lang || 'en-US'; 
                } else {
                    // Fallback to auto/detected lang if the selected voice is unavailable
                    const detectedLang = this._detectLanguage(text);
                    utterance.voice = null;
                    utterance.lang = detectedLang;
                }
            }
            // --- END NEW LOGIC ---

            utterance.onstart = () => {
                this.showStatus('🔊 Reading aloud...', 'success');
                const pauseBtn = document.getElementById('voice-pause-btn');
                const stopBtn = document.getElementById('voice-stop-btn');
                const readBtn = document.getElementById('voice-read-submit');
                if (pauseBtn) pauseBtn.disabled = false;
                if (stopBtn) stopBtn.disabled = false;
                if (readBtn) readBtn.disabled = true;
            };

            utterance.onend = () => {
                if (!speechSynthesis.speaking) {
                    this.showStatus('✅ Reading completed.', 'success');
                    const pauseBtn = document.getElementById('voice-pause-btn');
                    const stopBtn = document.getElementById('voice-stop-btn');
                    const readBtn = document.getElementById('voice-read-submit');
                    if (pauseBtn) pauseBtn.disabled = true;
                    if (stopBtn) stopBtn.disabled = true;
                    if (readBtn) readBtn.disabled = false;
                    this.isVoicePaused = false;
                }
            };

            utterance.onerror = (e) => {
                this.showStatus('Error during speech: ' + (e.error || e.message || 'unknown'), 'error');
                const pauseBtn = document.getElementById('voice-pause-btn');
                const stopBtn = document.getElementById('voice-stop-btn');
                const readBtn = document.getElementById('voice-read-submit');
                if (pauseBtn) pauseBtn.disabled = true;
                if (stopBtn) stopBtn.disabled = true;
                if (readBtn) readBtn.disabled = false;
            };

            if (options.queue) {
                setTimeout(() => speechSynthesis.speak(utterance), 200);
            } else {
                // Ensure quick start by cancelling previous speech
                speechSynthesis.cancel(); 
                speechSynthesis.speak(utterance);
            }

            this.currentUtterance = utterance;
        } catch (err) {
            console.error('Failed to start utterance:', err);
            this.showStatus('Error starting speech: ' + (err.message || err), 'error');
        }
    }

    // OCR Translate
    async handleOCRTranslateSubmit() {
        const imageInput = document.getElementById('ocr-image-input');
        const uploadSection = document.getElementById('ocr-upload-section');
        const screenshotSection = document.getElementById('ocr-screenshot-section');
        
        let imageData = null;
        
        // Determine source
        if (uploadSection.style.display !== 'none' && imageInput.files && imageInput.files.length > 0) {
            // Upload mode
            const file = imageInput.files[0];
            imageData = await this.fileToBase64(file);
        } else if (screenshotSection.style.display !== 'none' && this.currentOCRScreenshot) {
            // Screenshot mode
            imageData = this.currentOCRScreenshot;
        } else {
            this.showStatus('Please upload an image or take a screenshot first.', 'error');
            return;
        }

        const targetLanguage = document.getElementById('ocr-target-language').value;
        const responseContainer = document.getElementById('ocr-translate-response');
        const responseContentEl = document.getElementById('ocr-response-content');
        if (responseContentEl) responseContentEl.textContent = '';
        responseContainer.style.display = 'block';
        // show loader at top of response container
        responseContainer.insertAdjacentHTML('afterbegin', `
            <div class="loading-container ocr-loader">
                <div class="loader"></div>
                <p>🖼️ Extracting and translating to ${targetLanguage}...</p>
            </div>
        `);

        // **SCROLL TO LOADER**
        this._scrollToResponse('ocr-translate-response');
        
        this.showStatus('🖼️ Extracting and translating text...', 'info');

        // 🐛 FIX 7: Add log for OCR submission
        console.log(`🖼️ [OCR] Sending OCR/Translate request to backend API...`);

        try {
            const response = await this.callBackendAPI('/api/multimodal/ocr-translate', {
                image: imageData,
                targetLanguage: targetLanguage,
                userId: userId
            });

            // Remove loader
            const loaderEl = responseContainer.querySelector('.ocr-loader');
            if (loaderEl) loaderEl.remove();

            if (response.success) {
                this.showOCRTranslateResponse(response.result);
                this.logFeatureUsage('OCR_TRANSLATE');
                console.log(`✅ [OCR] Received response from backend API.`);
            } else {
                this.showStatus('Error: ' + response.error, 'error');
            }
        } catch (error) {
            // Remove loader on error
            const loaderEl = responseContainer.querySelector('.ocr-loader');
            if (loaderEl) loaderEl.remove();
            this.showStatus('Error: ' + error.message, 'error');
        }
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    handleOCRImageUpload(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const previewImg = document.getElementById('ocr-preview-img');
                previewImg.src = e.target.result;
                
                document.getElementById('ocr-upload-area').style.display = 'none';
                document.getElementById('ocr-image-preview').style.display = 'block';
                document.getElementById('ocr-translate-submit').disabled = false;
            };
            reader.readAsDataURL(file);
        }
    }

    removeOCRImage() {
        document.getElementById('ocr-image-input').value = '';
        document.getElementById('ocr-upload-area').style.display = 'block';
        document.getElementById('ocr-image-preview').style.display = 'none';
        document.getElementById('ocr-translate-submit').disabled = true;
    }

    // === OCR SCREENSHOT FUNCTIONALITY (UNCHANGED) ===
    async captureOCRImage() {
        try {
            this.showStatus('📸 Capturing screenshot...', 'info');
            
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    type: 'CAPTURE_SCREENSHOT'
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve(response);
                });
            });

            if (response && response.success) {
                this.showOCRScreenshotPreview(response.dataUrl);
                this.showStatus('✅ Screenshot captured!', 'success');
            } else {
                const errorMsg = response ? response.error : 'Unknown error';
                this.showStatus('❌ Failed to capture screenshot: ' + errorMsg, 'error');
            }
        } catch (error) {
            console.error('❌ Screenshot error:', error);
            this.showStatus('❌ Screenshot error: ' + error.message, 'error');
        }
    }

    showOCRScreenshotPreview(dataUrl) {
        const previewImg = document.getElementById('ocr-screenshot-img');
        const previewDiv = document.getElementById('ocr-screenshot-preview');
        
        previewImg.src = dataUrl;
        previewDiv.style.display = 'block';
        
        // Enable the submit button
        document.getElementById('ocr-translate-submit').disabled = false;
        
        // Store the screenshot data
        this.currentOCRScreenshot = dataUrl;
    }

    removeOCRScreenshot() {
        const previewDiv = document.getElementById('ocr-screenshot-preview');
        previewDiv.style.display = 'none';
        document.getElementById('ocr-translate-submit').disabled = true;
        this.currentOCRScreenshot = null;
    }

    initializeOCRInterface() { // Used in loadFeatureContent
        // Reset OCR interface
        document.getElementById('ocr-upload-section').style.display = 'block';
        document.getElementById('ocr-screenshot-section').style.display = 'none';
        document.getElementById('ocr-image-preview').style.display = 'none';
        document.getElementById('ocr-screenshot-preview').style.display = 'none';
        document.getElementById('ocr-translate-submit').disabled = true;
        
        // Reset source buttons
        document.getElementById('ocr-upload-btn').classList.add('active');
        document.getElementById('ocr-screenshot-btn').classList.remove('active');
    }
    
    // === RESPONSE DISPLAY METHODS (UPDATED WITH SCROLL AND COPY FIX) ===
    showProofreadResponse(response) {
        const responseContainer = document.getElementById('proofread-response');
        const formattedResponse = this.formatAIResponse(response);
        
        const isOCR = false;
        const ttsManager = new ResponseVoiceReader('proofread-response');

        // Store the raw response text for the event listener
        const rawResponseText = response;

        responseContainer.style.display = 'block';
        responseContainer.innerHTML = `
            <div class="response-header">
                <h4>🔤 Proofreading Results</h4>
                <div class="response-actions">
                    ${ttsManager.renderControl()}
                    <button class="copy-btn" id="proofread-copy-btn">📋 Copy</button>
                </div>
            </div>
            <div class="response-content">${formattedResponse}</div>
        `;
        ttsManager.attachListeners(response, isOCR);
        
        // Use an event listener to copy the stored raw text
        document.getElementById('proofread-copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(rawResponseText)
                .then(() => sidePanelInstance.showStatus('✓ Copied to clipboard', 'success'))
                .catch(e => sidePanelInstance.showStatus('❌ Failed to copy: ' + e.message, 'error'));
        });
        
        // **SCROLL TO RESPONSE**
        this._scrollToResponse('proofread-response');
    }

    showSummarizeResponse(response) {
        const responseContainer = document.getElementById('summarize-response');
        const formattedResponse = this.formatAIResponse(response);
        
        const isOCR = false;
        const ttsManager = new ResponseVoiceReader('summarize-response');

        // Store the raw response text for the event listener
        const rawResponseText = response;

        responseContainer.style.display = 'block';
        responseContainer.innerHTML = `
            <div class="response-header">
                <h4>📄 Summary</h4>
                <div class="response-actions">
                    ${ttsManager.renderControl()}
                    <button class="copy-btn" id="summarize-copy-btn">📋 Copy</button>
                </div>
            </div>
            <div class="response-content">${formattedResponse}</div>
        `;
        ttsManager.attachListeners(response, isOCR);
        
        // Use an event listener to copy the stored raw text
        document.getElementById('summarize-copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(rawResponseText)
                .then(() => sidePanelInstance.showStatus('✓ Copied to clipboard', 'success'))
                .catch(e => sidePanelInstance.showStatus('❌ Failed to copy: ' + e.message, 'error'));
        });
        
        this._scrollToResponse('summarize-response');
    }

    showTranslateResponse(response) {
        const responseContainer = document.getElementById('translate-response');
        const formattedResponse = this.formatAIResponse(response);
        
        const isOCR = false;
        const ttsManager = new ResponseVoiceReader('translate-response');

        // Store the raw response text for the event listener
        const rawResponseText = response;

        responseContainer.style.display = 'block';
        responseContainer.innerHTML = `
            <div class="response-header">
                <h4>🌐 Translation</h4>
                <div class="response-actions">
                    ${ttsManager.renderControl()}
                    <button class="copy-btn" id="translate-copy-btn">📋 Copy</button>
                </div>
            </div>
            <div class="response-content">${formattedResponse}</div>
        `;
        ttsManager.attachListeners(response, isOCR);
        
        // Use an event listener to copy the stored raw text
        document.getElementById('translate-copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(rawResponseText)
                .then(() => sidePanelInstance.showStatus('✓ Copied to clipboard', 'success'))
                .catch(e => sidePanelInstance.showStatus('❌ Failed to copy: ' + e.message, 'error'));
        });
        
        this._scrollToResponse('translate-response');
    }

    showSimplifyResponse(response) {
        const responseContainer = document.getElementById('simplify-response');
        const formattedResponse = this.formatAIResponse(response);
        
        const isOCR = false;
        const ttsManager = new ResponseVoiceReader('simplify-response');

        // Store the raw response text for the event listener
        const rawResponseText = response;

        responseContainer.style.display = 'block';
        responseContainer.innerHTML = `
            <div class="response-header">
                <h4>📝 Simplified Text</h4>
                <div class="response-actions">
                    ${ttsManager.renderControl()}
                    <button class="copy-btn" id="simplify-copy-btn">📋 Copy</button>
                </div>
            </div>
            <div class="response-content">${formattedResponse}</div>
        `;
        ttsManager.attachListeners(response, isOCR);

        // Use an event listener to copy the stored raw text
        document.getElementById('simplify-copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(rawResponseText)
                .then(() => sidePanelInstance.showStatus('✓ Copied to clipboard', 'success'))
                .catch(e => sidePanelInstance.showStatus('❌ Failed to copy: ' + e.message, 'error'));
        });

        // **SCROLL TO RESPONSE**
        this._scrollToResponse('simplify-response');
    }

    showOCRTranslateResponse(response) {
        const responseContainer = document.getElementById('ocr-translate-response');
        const responseContent = document.getElementById('ocr-response-content');
        const formattedResponse = this.formatAIResponse(response);

        const isOCR = true;
        const ttsManager = new ResponseVoiceReader('ocr-translate-response');
        
        responseContainer.style.display = 'block';
        responseContent.innerHTML = formattedResponse; // Set the content first

        const header = responseContainer.querySelector('.response-header');
        if (header) {
            const actionsDiv = header.querySelector('.response-actions');
            if (actionsDiv) {
                const existing = actionsDiv.querySelector('.tts-container');
                if (existing) existing.remove();
                
                actionsDiv.insertAdjacentHTML('afterbegin', ttsManager.renderControl()); 
            }
        }
        
        ttsManager.attachListeners(response, isOCR);
        
        this._scrollToResponse('ocr-translate-response');
    }

    copyOCRResponse() {
        const responseContent = document.getElementById('ocr-response-content');
        if (responseContent) {
            // Note: This function is still needed as it is wired directly to the OCR copy button in initializeEventListeners
            navigator.clipboard.writeText(responseContent.textContent)
                .then(() => this.showStatus('✓ OCR text copied to clipboard!', 'success'))
                .catch(e => this.showStatus('❌ Failed to copy: ' + e.message, 'error'));
        }
    }

    clearOCRResponse() {
        const responseContainer = document.getElementById('ocr-translate-response');
        responseContainer.style.display = 'none';
        this.showStatus('🗑️ OCR response cleared.', 'info');
    }

    // === UTILITY METHODS (Direct Backend Calls for Multimodal) (UNCHANGED) ===
    async callBackendAPI(endpoint, data) {
        try {
            const response = await fetch(`${BACKEND_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            if (!response.ok) {
                throw new Error(`Backend error: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Backend API call failed:', error);
            throw error;
        }
    }

    // === NEW UTILITY METHOD: Reroute to Content Script's callAI (UNCHANGED) ===
    async callContentScriptAI(feature, data) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || !tab.id) {
            // This error will be thrown to the catch block in the handlers
            throw new Error('No active tab found. Please reload the webpage.'); 
        }

        // Use the robust message sender
        const response = await this.sendMessageToContentScript(tab.id, {
            type: 'SIDE_PANEL_CALL_AI', // New message type for content script listener
            feature: feature,
            data: data
        });

        if (response.success) {
            return { success: true, response: response.response };
        } else {
            throw new Error(response.error || 'Content script AI execution failed.');
        }
    }

    // === TEXT SOURCE MANAGEMENT (MODIFIED) (UNCHANGED) ===
    async switchTextSource(featureName, source) {
        try {
            // Try multiple id patterns to support 'voice-selected-btn' vs 'voice-reader-selected-btn'
            const bases = [featureName, featureName.split('-')[0]];

            let selectedBtn = null;
            let pageBtn = null;
            for (const b of bases) {
                if (!selectedBtn) selectedBtn = document.getElementById(`${b}-selected-btn`) || document.getElementById(`${b}-selected`);
                if (!pageBtn) pageBtn = document.getElementById(`${b}-page-btn`) || document.getElementById(`${b}-page`);
            }

            if (!selectedBtn) {
                console.error('Source buttons not found for feature:', featureName);
                return;
            }
            
            // Only toggle the active class if the 'page' button exists (i.e., for features like Voice Reader)
            if (pageBtn) {
                selectedBtn.classList.toggle('active', source === 'selected');
                pageBtn.classList.toggle('active', source === 'page');
            } else {
                 // For Proofread/Summarize/Translate (only Selected Text exists now), ensure it's active
                 selectedBtn.classList.add('active');
                 source = 'selected'; // Force source back to selected
            }
            

            // Load appropriate text
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                console.error('No active tab found');
                return;
            }

            let text = '';
            let response = null;

            // --- MODIFIED CALLS TO USE THE ROBUST MESSAGE SENDER ---
            if (source === 'selected') {
                response = await this.sendMessageToContentScript(tab.id, { type: 'GET_SELECTED_TEXT' });
            } else {
                response = await this.sendMessageToContentScript(tab.id, { type: 'GET_PAGE_TEXT' });
            }
            // --------------------------------------------------------
            
            text = response?.text || '';

            // Support multiple preview id patterns as well
            const previewCandidates = [`${featureName}-preview`, `${featureName.split('-')[0]}-preview`, `${featureName}-text-preview`];
            let previewElement = null;
            for (const id of previewCandidates) {
                const el = document.getElementById(id);
                if (el) { previewElement = el; break; }
            }

            if (previewElement) {
                previewElement.textContent = text || `No ${source} text available.`;
                
                // Also check if the submit button needs to be enabled/disabled
                const submitBtnId = `${featureName.replace('-', '')}-submit`;
                const submitBtn = document.getElementById(submitBtnId);
                
                if (submitBtn) {
                    if (text && text.length > 0 && !text.includes('No text available')) {
                        submitBtn.disabled = false;
                    } else {
                        submitBtn.disabled = true;
                    }
                }
                
            } else {
                console.error('Preview element not found for feature:', featureName);
            }
        } catch (error) {
            console.warn('Could not switch text source:', error);
            // Show a user-friendly error in the UI
            const previewElement = document.getElementById(`${featureName}-preview`);
            if (previewElement) {
                previewElement.textContent = `Error loading text content. Please try again. (Detail: ${error.message})`;
                this.showStatus('❌ Text loading failed. Try reloading the page.', 'error');
            }
        }
    }

    // === OCR SOURCE MANAGEMENT (UNCHANGED) ===
    switchOCRSource(source) {
        const uploadBtn = document.getElementById('ocr-upload-btn');
        const screenshotBtn = document.getElementById('ocr-screenshot-btn');
        const uploadSection = document.getElementById('ocr-upload-section');
        const screenshotSection = document.getElementById('ocr-screenshot-section');
        
        uploadBtn.classList.toggle('active', source === 'upload');
        screenshotBtn.classList.toggle('active', source === 'screenshot');
        
        uploadSection.style.display = source === 'upload' ? 'block' : 'none';
        screenshotSection.style.display = source === 'screenshot' ? 'block' : 'none';
    }

    // === VOICE READER ENHANCEMENTS (UNCHANGED) ===
    initializeVoiceReader() {
        // Populate voice options
        const voiceSelect = document.getElementById('voice-select');
        
        // Load available voices and filter to English
        const loadVoices = () => {
            const voices = speechSynthesis.getVoices();
            
            // Clear previous options except 'Auto'
            // The default 'auto' option is maintained in sidepanel.html, so we only need to append.
            voiceSelect.innerHTML = '<option value="auto">Auto (Best Available)</option>';
            
            // Filter voices to English (starts with 'en') as requested
            const englishVoices = voices.filter(voice => voice.lang.startsWith('en'));
            
            // Sort English voices: Google/High-Quality first, then others
            englishVoices.sort((a, b) => {
                if (a.name.includes('Google') && !b.name.includes('Google')) return -1;
                if (!a.name.includes('Google') && b.name.includes('Google')) return 1;
                return a.name.localeCompare(b.name);
            });

            englishVoices.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.name;
                option.textContent = `${voice.name} (${voice.lang})`;
                voiceSelect.appendChild(option);
            });
        };
        
        // Load voices immediately and whenever they change (fixes the "not reading" issue if voices load late)
        loadVoices();
        if (speechSynthesis.onvoiceschanged !== loadVoices) {
            speechSynthesis.onvoiceschanged = loadVoices;
        }
    }

    updateVoiceControl(type, value) {
        const valueElement = document.getElementById(`voice-${type}-value`);
        if (valueElement) {
            if (type === 'volume') {
                valueElement.textContent = Math.round(value * 100) + '%';
            } else if (type === 'speed') {
                valueElement.textContent = value + 'x';
            } else {
                valueElement.textContent = value;
            }
        }
    }

    async handleVoicePause() {
        if (this.isVoicePaused) {
            // Resume
            if (this.currentUtterance) {
                speechSynthesis.resume();
                this.isVoicePaused = false;
                document.getElementById('voice-pause-btn').textContent = '⏸️ Pause';
                this.showStatus('🔊 Resumed reading...', 'success');
            }
        } else {
            // Pause
            if (this.currentUtterance) {
                speechSynthesis.pause();
                this.isVoicePaused = true;
                document.getElementById('voice-pause-btn').textContent = '▶️ Resume';
                this.showStatus('⏸️ Paused reading...', 'info');
            }
        }
    }

    // === INSIGHTS FUNCTIONALITY (UPDATED WITH GUEST CHECK) ===
    async loadInsights() {
        const loadingDiv = document.getElementById('insights-loading');
        const contentDiv = document.getElementById('insights-content');
        
        loadingDiv.style.display = 'block';
        contentDiv.style.display = 'none';

        // **SCROLL TO LOADER**
        this._scrollToResponse('insights-interface');
        
        // --- START: NEW LOGIC FOR GUEST CHECK ---
        if (!userId || userId === 'anonymous') {
            loadingDiv.style.display = 'none';
            contentDiv.style.display = 'block';
            
            const message = "Access to personalized insights is for registered users only. Please log in or register to view your learning patterns.";
            
            this.displayInsights(
                message, 
                0,
                true 
            );
            
            this.showStatus('Please log in or register to view insights.', 'warning');
            return;
        }
        // --- END: NEW LOGIC FOR GUEST CHECK ---

        try {
            const response = await fetch(`http://localhost:5000/api/analytics/insights/${userId}`);
            const data = await response.json();
            
            if (data.success) {
                this.displayInsights(data.insights, data.session_count);
            } else {
                this.showInsightsError(data.error || 'Failed to load insights');
            }
        } catch (error) {
            this.showInsightsError('Error: ' + error.message);
        } finally {
            loadingDiv.style.display = 'none';
            contentDiv.style.display = 'block';
            
            // **SCROLL TO RESPONSE (Final scroll after content is fully displayed)**
            this._scrollToResponse('insights-content');
        }
    }

    // Modified to handle the locked message
    displayInsights(insights, sessionCount, isMessage = false) {
        const sessionInfo = document.getElementById('insights-session-info');
        const insightsText = document.getElementById('insights-text');
        
        if (isMessage) {
            sessionInfo.textContent = 'Feature Locked (Login Required)';
            insightsText.innerHTML = `<p style="text-align: center; font-style: italic; color: #ef4444; padding: 20px; border: 1px solid #ef4444; border-radius: 8px;">
                <strong>🔐 Access Denied:</strong> ${insights}
                <br><br>
                
            </p>`;
        } else {
            sessionInfo.textContent = `Sessions Analyzed: ${sessionCount}`;
            insightsText.innerHTML = this.formatAIResponse(insights); // Format the response
        }
    }

    showInsightsError(error) {
        const sessionInfo = document.getElementById('insights-session-info');
        const insightsText = document.getElementById('insights-text');
        
        sessionInfo.textContent = 'Error Loading Insights';
        insightsText.textContent = error;
    }
}

// Inject CSS for TTS controls into the sidepanel environment
const ttsStyles = `
    .tts-container {
        position: relative;
        display: inline-block; 
        z-index: 10; 
    }
    .tts-main-btn {
        background: #764ba2;
        padding: 6px 10px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        font-weight: 600;
        min-width: 32px;
        justify-content: center;
        /* Inherited styles adjusted */
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 4px;
    }
    .tts-main-btn:hover {
        background: #6b3e94;
    }
    .tts-main-btn .icon {
        font-size: 18px !important; 
    }
    /* Menu styles removed */
`;

// Initialize the side panel when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Helper to populate language selects for the sidepanel UI (FIX for parity)
    const populateLanguageSelects = () => {
        const createOptionsHtml = (selectElementId, defaultValue) => {
            const selectElement = document.getElementById(selectElementId);
            if (!selectElement) return;

            selectElement.innerHTML = standardLanguageOptions.map(lang => 
                `<option value="${lang.value}" ${lang.value.toLowerCase() === defaultValue.toLowerCase() ? 'selected' : ''}>${lang.label}</option>`
            ).join('');
        };
        
        createOptionsHtml('target-language', 'Spanish'); // Translate
        createOptionsHtml('ocr-target-language', 'English'); // OCR Translate
    };

    populateLanguageSelects();

    const styleTag = document.createElement('style');
    styleTag.textContent = ttsStyles;
    document.head.appendChild(styleTag);
    // ASSIGN TO GLOBAL VARIABLE
    sidePanelInstance = new ChromeAISidePanel(); 
});

// === MESSAGE LISTENER (UPDATED TO USE GLOBAL INSTANCE) ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.type === 'OPEN_SIDE_PANEL_FEATURE') {
        // FIX: Use the single existing instance to handle the request
        if (sidePanelInstance) { 
            // CRITICAL FIX: Pass the selected text from the background script
            sidePanelInstance.handleExternalFeatureOpen(request.feature, request.selectionText);
            sendResponse({ success: true });
        } else {
             console.error('❌ SidePanel instance not ready when message received.');
             sendResponse({ success: false, error: 'SidePanel not fully initialized.' });
        }
        return true;
    }

    // Enhanced PDF AI functionality (unchanged event handlers moved from DOMContentLoaded)
    // The following listeners handle PDF/DOCX process logic which lives in this script
    if (request.type === 'PDF_PROCESS_ACTION') {
        // ... (PDF logic remains here, but since the original PDF logic was added to the DOMContentLoaded handler,
        // we'll leave it in the DOMContentLoaded for simplicity and instead ensure this file continues to
        // contain all the PDF logic, assuming it was meant to be refactored out.)
        return false;
    }

    return false;
});


// Enhanced PDF AI functionality (unchanged) - Kept outside the class definition as a utility bundle
document.addEventListener('DOMContentLoaded', () => {
  const pdfFileInput = document.getElementById('pdf-file-input');
  const pdfUploadBtn = document.getElementById('pdf-upload-btn');
  const pdfProcessBtn = document.getElementById('pdf-process-btn');
  const pdfCancelBtn = document.getElementById('pdf-cancel-btn');
  const pdfStatus = document.getElementById('pdf-status');
  const pdfResult = document.getElementById('pdf-result');
  const resultContent = document.getElementById('result-content');
  const copyResultBtn = document.getElementById('copy-result-btn');
  
  // New elements
  const fileUploadArea = document.getElementById('file-upload-area');
  const uploadedFileInfo = document.getElementById('uploaded-file-info');
  const fileName = document.getElementById('file-name');
  const fileSize = document.getElementById('file-size');
  const removeFileBtn = document.getElementById('remove-file-btn');
  const optionButtons = document.querySelectorAll('.option-btn');

  let uploadedFilename = null;
  let selectedAction = 'summarize';
  let currentRequest = null; // To track the current fetch request

  // --- Utility Functions (Defined locally to keep scope clean and consistent with original structure) ---

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function handleFileSelection(file) {
    // Check if file is PDF or Word document
    const isValidFile = file.type === 'application/pdf' || 
                      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                      file.name.toLowerCase().endsWith('.pdf') ||
                      file.name.toLowerCase().endsWith('.docx');
    
    if (!isValidFile) {
      sidePanelInstance.showStatus('Please select a valid PDF or Word document.', 'error');
      return;
    }

    // Show file info
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    
    fileUploadArea.style.display = 'none';
    uploadedFileInfo.style.display = 'flex';
    
    const fileType = file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'Word document';
    // NOTE: Using sidePanelInstance.showStatus
    sidePanelInstance.showStatus(`${fileType} file selected. Click "Upload Document" to proceed.`, 'info');
  }

  function resetFileUpload() {
    pdfFileInput.value = '';
    uploadedFilename = null;
    
    fileUploadArea.style.display = 'block';
    uploadedFileInfo.style.display = 'none';
    
    pdfProcessBtn.disabled = true;
    pdfResult.style.display = 'none';
    pdfStatus.textContent = '';
    pdfStatus.className = 'status-message';
  }

  // --- End Utility Functions ---

  // File upload area click handler
  if (fileUploadArea) {
    fileUploadArea.addEventListener('click', () => {
      pdfFileInput.click();
    });

    // Drag and drop functionality
    fileUploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileUploadArea.classList.add('dragover');
    });

    fileUploadArea.addEventListener('dragleave', () => {
      fileUploadArea.classList.remove('dragover');
    });

    fileUploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      fileUploadArea.classList.remove('dragover');
      
      const files = e.dataTransfer.files;
      if (files.length > 0 && (files[0].type === 'application/pdf' || files[0].name.toLowerCase().endsWith('.docx'))) {
        pdfFileInput.files = files;
        handleFileSelection(files[0]);
      } else {
        sidePanelInstance.showStatus('Please select a valid PDF or Word document.', 'error');
      }
    });
  }

  // File input change handler
  if (pdfFileInput) {
    pdfFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleFileSelection(e.target.files[0]);
      }
    });
  }

  // Option button handlers
  optionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      optionButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedAction = btn.dataset.action;
    });
  });

  // Remove file handler
  if (removeFileBtn) {
    removeFileBtn.addEventListener('click', () => {
      resetFileUpload();
    });
  }

  // Copy result handler
  if (copyResultBtn) {
    copyResultBtn.addEventListener('click', () => {
      if (resultContent) {
        // Use a function that gets innerText for content copy
        navigator.clipboard.writeText(resultContent.textContent); 
        sidePanelInstance.showStatus('Results copied to clipboard!', 'success');
      }
    });
  }

  // Upload button handler
  if (pdfUploadBtn) {
    pdfUploadBtn.addEventListener('click', async () => {
      const files = pdfFileInput.files;
      if (!files || files.length === 0) {
        sidePanelInstance.showStatus('Please select a document first.', 'error');
        return;
      }
      
      const file = files[0];
      const fileType = file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'Word document';
      sidePanelInstance.showStatus(`Uploading ${fileType}...`, 'info');
      
      try {
        const form = new FormData();
        form.append('file', file);
        const resp = await fetch(`http://localhost:5000/upload`, {
          method: 'POST',
          body: form
        });

        const ct = (resp.headers.get('content-type') || '').toLowerCase();
        let body;
        if (ct.includes('application/json')) {
          body = await resp.json();
        } else {
          body = { raw: await resp.text() };
        }

        if (resp.ok) {
          if (body.filename) {
            uploadedFilename = body.filename;
          } else if (body.raw) {
            uploadedFilename = body.raw.trim();
          }
          if (uploadedFilename) {
            sidePanelInstance.showStatus('Document uploaded successfully! Ready to process.', 'success');
            pdfProcessBtn.disabled = false;
            pdfCancelBtn.disabled = false;
          } else {
            sidePanelInstance.showStatus('Uploaded but no filename returned.', 'error');
          }
        } else {
          const errMsg = body.error || body.raw || resp.statusText || 'Upload failed';
          sidePanelInstance.showStatus('Upload failed: ' + errMsg, 'error');
        }
      } catch (err) {
        sidePanelInstance.showStatus('Upload error: ' + (err && err.message ? err.message : err), 'error');
      }
    });
  }

  // Process button handler
  if (pdfProcessBtn) {
    pdfProcessBtn.addEventListener('click', async () => {
      if (!uploadedFilename) {
        sidePanelInstance.showStatus('No uploaded document found.', 'error');
        return;
      }
      
      const actionText = {
        'summarize': 'Summarizing',
        'proofread': 'Proofreading', 
        'both': 'Processing (Summarize + Proofread)'
      }[selectedAction];
      
      sidePanelInstance.showStatus(`${actionText} your document with AI...`, 'info');
      pdfResult.style.display = 'none';
      
      try {
        // Create abort controller for cancellation
        const abortController = new AbortController();
        currentRequest = abortController;
        
        const resp = await fetch(`http://localhost:5000/process-document`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            filename: uploadedFilename,
            action: selectedAction
          }),
          signal: abortController.signal
        });
        
        // --- START FIX: Robust error handling for non-JSON response ---
        let j;
        if (resp.ok) {
          j = await resp.json();
        } else {
          // If status is not ok (e.g., 500), try to read as JSON for error object, else read as text.
          try {
            j = await resp.json();
          } catch (e) {
            const errorText = await resp.text();
            // Throw a custom error that includes the status and a snippet of the HTML content
            throw new Error(`Server processing failed (Status ${resp.status}). Detail: ${errorText.substring(0, 100)}...`);
          }
          // If we got here, j is a JSON error object: throw its message.
          throw new Error(j.error || resp.statusText);
        }
        // --- END FIX ---
        
        if (resp.ok) { 
          let resultText = '';
          
          if (j.summary) {
            resultText += '📄 SUMMARY\n';
            resultText += '='.repeat(40) + '\n\n';
            resultText += j.summary + '\n\n';
          }
          
          if (j.proofread) {
            resultText += '🔤 PROOFREAD RESULTS\n';
            resultText += '='.repeat(40) + '\n\n';
            resultText += j.proofread + '\n\n';
          }
          
          // Use the global instance for formatting
          if (sidePanelInstance) {
             resultContent.innerHTML = sidePanelInstance.formatAIResponse(resultText); 
          } else {
             // Fallback to basic HTML conversion if the class isn't ready.
             resultContent.innerHTML = resultText.replace(/\n/g, '<br>');
          }

          pdfResult.style.display = 'block';
          sidePanelInstance.showStatus('AI processing completed successfully!', 'success');
        } else {
          sidePanelInstance.showStatus('Processing failed: ' + (j.error || resp.statusText), 'error');
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          sidePanelInstance.showStatus('Processing cancelled.', 'info');
        } else {
          sidePanelInstance.showStatus('Processing error: ' + (err && err.message ? err.message : err), 'error');
        }
      } finally {
        currentRequest = null;
      }
    });
  }

  // Cancel button handler
  if (pdfCancelBtn) {
    pdfCancelBtn.addEventListener('click', () => {
      if (currentRequest) {
        currentRequest.abort();
        currentRequest = null;
        sidePanelInstance.showStatus('Processing cancelled.', 'info');
        pdfProcessBtn.disabled = false;
        pdfCancelBtn.disabled = true;
      } else {
        // Reset everything if no active request
        resetFileUpload();
        sidePanelInstance.showStatus('Cancelled. Upload a new document to start again.', 'info');
      }
    });
  }

  function resetFileUpload() {
    uploadedFilename = null;
    pdfFileInput.value = '';
    pdfProcessBtn.disabled = true;
    pdfCancelBtn.disabled = true;
    pdfResult.style.display = 'none';
    fileUploadArea.style.display = 'block';
    uploadedFileInfo.style.display = 'none';
  }
});