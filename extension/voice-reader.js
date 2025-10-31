// ============================================
// CONFIGURATION
// ============================================

// LOCAL TESTING
const BACKEND_URL = 'http://localhost:5000';

// PRODUCTION: Uncomment and update
// const BACKEND_URL = 'https://YOUR-APP-NAME.onrender.com';

// ============================================
// ADVANCED VOICE READER - MULTI-FORMAT SUPPORT
// ============================================

class VoiceReader {
    constructor() {
        this.synth = window.speechSynthesis;
        this.currentUtterance = null;
        this.isReading = false;
        this.isPaused = false;
        this.readingSpeed = 0.9;
        this.readingPitch = 1.0;
        this.volume = 1.0;
        this.selectedVoice = null;
        this.highlightedElement = null;
        this.readingMode = 'automatic';
        this.currentIndex = 0;
        this.contentArray = [];
        this.documentType = 'webpage'; // Track document type
        
        this.loadSettings();
        this.initializeVoices();
        this.detectDocumentType();
    }


    _findMainContentElement() {
        // Priority list of content containers, including Wikipedia-specific IDs
        const selectors = [
            'article', 
            'main', 
            '[role="main"]', 
            '#mw-content-text', 
            '#bodyContent',      
            '[class*="article-body"]', 
            '[class*="story-body"]',
            '.content', 
            '#content', 
            '.post-content'
        ];
        
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            // Check if the element exists and is visible and has significant text
            if (element && element.offsetParent !== null && element.innerText.trim().length > 500) { 
                console.log(`🌐 Found main content element: ${selector}`);
                return element;
            }
        }
        
        // Fallback to the body
        return document.body;
    }

    // Simple Language Detection Helper
    _detectLanguage(text) {
        // Detect most common languages using simple patterns/character sets
        if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(text)) return 'ko-KR'; 
        if (/[ぁ-ゔァ-ヴー々〆〤ヶ]/.test(text)) return 'ja-JP'; 
        if (/[\u4e00-\u9fff]/.test(text)) return 'zh-CN'; 
        if (/[\u0600-\u06ff]/.test(text)) return 'ar-SA';
        if (/[\u0900-\u097f]/.test(text)) return 'hi-IN'; 
        if (/[áéíóúñÁÉÍÓÚÑ¿¡]/.test(text)) return 'es-ES'; 
        if (/[àâéèêëîïôœùûüÿçÀÂÉÈÊËÎÏÔŒÙÛÜŸÇ]/.test(text)) return 'fr-FR'; 
        if (/[äöüßÄÖÜẞ]/.test(text)) return 'de-DE'; 
        // Default to English 
        return 'en-US';
    }
    
    // ============================================
    // DOCUMENT TYPE DETECTION
    // ============================================
    
    detectDocumentType() {
        if (window.pdfProcessor && window.pdfProcessor.isPDF()) {
            this.documentType = 'pdf';
            console.log('📑 Document Type: PDF');
            return;
        }
        
        const hostname = window.location.hostname;
        const url = window.location.href;
        
        if (hostname === 'docs.google.com') {
            this.documentType = 'google-docs';
            console.log('📄 Document Type: Google Docs');
        } else if (url.endsWith('.pdf') || document.querySelector('.textLayer')) {
            this.documentType = 'pdf';
            console.log('📑 Document Type: PDF');
        } else if (hostname.includes('office.com') || hostname.includes('sharepoint.com')) {
            this.documentType = 'office-online';
            console.log('📝 Document Type: Office Online');
        } else {
            this.documentType = 'webpage';
            console.log('🌐 Document Type: Web Page');
        }
    }
    
    async loadSettings() {
        const result = await chrome.storage.local.get(['voiceReaderSettings']);
        if (result.voiceReaderSettings) {
            const settings = result.voiceReaderSettings;
            this.readingSpeed = settings.speed || 0.9;
            this.readingPitch = settings.pitch || 1.0;
            this.volume = settings.volume || 1.0;
            this.readingMode = settings.mode || 'automatic';
        }
    }
    
    async saveSettings() {
        await chrome.storage.local.set({
            voiceReaderSettings: {
                speed: this.readingSpeed,
                pitch: this.readingPitch,
                volume: this.volume,
                mode: this.readingMode
            }
        });
    }
    
    initializeVoices() {
        // Removed hardcoded English preference. We rely on the browser's default 
        // voice selection based on the language hint set in the speak method.
        this.synth.addEventListener('voiceschanged', () => {
            // No action needed here currently
        });
    }
    
    show() {
        this.createControls();
        const controls = document.getElementById('voice-reader-controls');
        if (controls) {
            controls.style.display = 'block';
            
            // Update document type indicator
            const statusEl = document.getElementById('reading-status');
            if (statusEl) {
                statusEl.textContent = `Ready to read (${this.documentType})`;
            }
            
            this.announce('Voice reader opened. Press Control+Space to play or pause.');
        }
    }
    
    hide() {
        const controls = document.getElementById('voice-reader-controls');
        if (controls) controls.style.display = 'none';
    }
    
    isVisible() {
        const controls = document.getElementById('voice-reader-controls');
        return controls && controls.style.display !== 'none';
    }
    
    createControls() {
        const existing = document.getElementById('voice-reader-controls');
        if (existing) return;
        
        const controls = document.createElement('div');
        controls.id = 'voice-reader-controls';
        controls.setAttribute('role', 'region');
        controls.setAttribute('aria-label', 'Voice Reader Controls');
        controls.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            z-index: 9999999;
            min-width: 340px;
            font-family: Arial, sans-serif;
            display: none;
        `;
        
        controls.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; font-size: 18px; font-weight: 600;">🔊 Voice Reader</h3>
                <button id="voice-reader-close" aria-label="Close" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 20px; font-weight: bold;">×</button>
            </div>
            
            <div style="margin-bottom: 16px;">
                <div id="reading-status" style="background: rgba(255,255,255,0.15); padding: 12px; border-radius: 8px; text-align: center; font-size: 14px; font-weight: 600;">
                    Ready to read
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px;">
                <button id="voice-reader-play" class="voice-control-btn" aria-label="Play">▶️ Play</button>
                <button id="voice-reader-pause" class="voice-control-btn" aria-label="Pause" disabled>⏸️ Pause</button>
                <button id="voice-reader-stop" class="voice-control-btn" aria-label="Stop" disabled>⏹️ Stop</button>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 16px;">
                <button id="voice-reader-previous" class="voice-control-btn" aria-label="Previous">⏮️ Previous</button>
                <button id="voice-reader-next" class="voice-control-btn" aria-label="Next">⏭️ Next</button>
            </div>
            
            <div style="margin-bottom: 12px;">
                <label style="display: block; font-size: 12px; margin-bottom: 6px; font-weight: 600;">
                    Speed: <span id="speed-value">${this.readingSpeed}x</span>
                </label>
                <input type="range" id="voice-reader-speed" min="0.5" max="2.0" step="0.1" value="${this.readingSpeed}" 
                    aria-label="Reading speed" style="width: 100%; cursor: pointer;">
            </div>
            
            <div style="margin-bottom: 12px;">
                <label style="display: block; font-size: 12px; margin-bottom: 6px; font-weight: 600;">
                    Pitch: <span id="pitch-value">${this.readingPitch}</span>
                </label>
                <input type="range" id="voice-reader-pitch" min="0.5" max="2.0" step="0.1" value="${this.readingPitch}" 
                    aria-label="Voice pitch" style="width: 100%; cursor: pointer;">
            </div>
            
            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 12px; margin-bottom: 6px; font-weight: 600;">Reading Mode</label>
                <select id="voice-reader-mode" aria-label="Reading mode" style="width: 100%; padding: 8px; border: none; border-radius: 6px; font-size: 13px;">
                    <option value="automatic" ${this.readingMode === 'automatic' ? 'selected' : ''}>Automatic (Full)</option>
                    <option value="paragraph" ${this.readingMode === 'paragraph' ? 'selected' : ''}>Paragraph by Paragraph</option>
                    <option value="sentence" ${this.readingMode === 'sentence' ? 'selected' : ''}>Sentence by Sentence</option>
                    <option value="selection" ${this.readingMode === 'selection' ? 'selected' : ''}>Selected Text Only</option>
                </select>
            </div>
            
            <div style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 8px; font-size: 11px; margin-top: 12px;">
                <strong>💡 Tip:</strong> Works on web pages, PDFs, Google Docs, and Office Online!
            </div>
            
            <style>
                .voice-control-btn {
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: white;
                    padding: 10px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 600;
                    transition: all 0.2s;
                }
                .voice-control-btn:hover:not(:disabled) {
                    background: rgba(255,255,255,0.3);
                    transform: translateY(-2px);
                }
                .voice-control-btn:active:not(:disabled) {
                    transform: translateY(0);
                }
                .voice-control-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .voice-control-btn:focus {
                    outline: 3px solid white;
                    outline-offset: 2px;
                }
            </style>
        `;
        
        document.body.appendChild(controls);
        this.attachEventListeners();
    }
    
    attachEventListeners() {
        document.getElementById('voice-reader-close').addEventListener('click', () => {
            this.hide();
            this.stop();
        });
        
        document.getElementById('voice-reader-play').addEventListener('click', () => {
            if (this.isPaused) {
                this.resume();
            } else {
                this.startReading();
            }
        });
        
        document.getElementById('voice-reader-pause').addEventListener('click', () => this.pause());
        document.getElementById('voice-reader-stop').addEventListener('click', () => this.stop());
        
        document.getElementById('voice-reader-previous').addEventListener('click', () => this.readPrevious());
        document.getElementById('voice-reader-next').addEventListener('click', () => this.readNext());
        
        document.getElementById('voice-reader-speed').addEventListener('input', (e) => {
            this.readingSpeed = parseFloat(e.target.value);
            document.getElementById('speed-value').textContent = this.readingSpeed + 'x';
            this.saveSettings();
            
            if (this.isReading && !this.isPaused) {
                const currentText = this.currentUtterance?.text;
                if (currentText) {
                    this.synth.cancel();
                    this.speak(currentText);
                }
            }
        });
        
        document.getElementById('voice-reader-pitch').addEventListener('input', (e) => {
            this.readingPitch = parseFloat(e.target.value);
            document.getElementById('pitch-value').textContent = this.readingPitch;
            this.saveSettings();
        });
        
        document.getElementById('voice-reader-mode').addEventListener('change', (e) => {
            this.readingMode = e.target.value;
            this.saveSettings();
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (!this.isVisible()) return;
            
            if (e.key === ' ' && e.ctrlKey) {
                e.preventDefault();
                if (this.isReading && !this.isPaused) {
                    this.pause();
                } else {
                    this.resume();
                }
            } else if (e.key === 'Escape') {
                this.stop();
            } else if (e.key === 'ArrowLeft' && e.ctrlKey) {
                e.preventDefault();
                this.readPrevious();
            } else if (e.key === 'ArrowRight' && e.ctrlKey) {
                e.preventDefault();
                this.readNext();
            }
        });
    }
    
    // ============================================
    // READING CONTROL
    // ============================================
    
    startReading() {
        this.stop(); // Stop any existing reading
        const mode = this.readingMode;

        // 🐛 FIX 10: Log for Voice Reader start
        console.log(`🔊 [Voice Reader] Starting reading in mode: ${mode}`); 

        // 1. Handle Selection mode (always fast and synchronous)
        if (mode === 'selection') {
            const selection = window.getSelection().toString();
            if (!selection) {
                this.updateStatus('Please select text first');
                this.announce('Please select text to read');
                return;
            }
            this.contentArray = [selection];
            this.currentIndex = 0;
            this.readCurrent();
            return;
        }

        // 2. Handle Whole Page / Extended modes (Needs quick start)
        
        // A. Start reading placeholder immediately (instant perceived start)
        const quickText = document.title ? `Starting full page reading. Page title is: ${document.title}.` : "Starting full content reading.";
        this.speak(quickText);
        this.updateStatus(`Preparing full content (${this.documentType})...`);

        // B. Defer the slow, synchronous extraction to the next event loop cycle
        // This allows the browser to start speaking the quickText while extraction runs.
        setTimeout(() => {
            
            // --- Synchronous Extraction (The slow part) ---
            if (mode === 'sentence') {
                this.contentArray = this.extractSentences();
            } else if (mode === 'paragraph') {
                this.contentArray = this.extractParagraphs();
            } else {
                // 'automatic' (Whole Page) mode
                // FIX: Instead of placing the entire page into a single utterance, 
                // chunk it into paragraphs to avoid TTS length limits and timeouts on long pages.
                this.contentArray = this.extractParagraphs(); 
            }
            
            // --- Validation and Restart ---
            if (this.contentArray.length === 0 || !this.contentArray[0] || this.contentArray[0].trim().length === 0) {
                this.synth.cancel();
                this.stop();
                this.updateStatus('No content found to read');
                this.announce('No readable content found on this page');
                return;
            }

            // Since reading has already started with quickText, we must stop it
            // and restart the main content reading from the beginning.
            this.synth.cancel(); 
            this.currentIndex = 0;
            
            // Delay restart slightly to ensure cancel is fully processed (100ms)
            setTimeout(() => this.readCurrent(), 100); 

        }, 50); // Small timeout to defer heavy lifting
    }
    
    readCurrent() {
        if (this.currentIndex >= this.contentArray.length) {
            this.updateStatus('Finished reading');
            this.announce('Finished reading all content');
            this.stop();
            return;
        }
        
        const text = this.contentArray[this.currentIndex];
        if (!text || text.trim().length === 0) {
            this.currentIndex++;
            this.readCurrent();
            return;
        }
        
        this.speak(text);
        
        const position = this.readingMode === 'automatic' ? 
            `Reading ${this.documentType}` : 
            `Reading ${this.currentIndex + 1} of ${this.contentArray.length}`;
        this.updateStatus(position);
        
        document.getElementById('voice-reader-play').disabled = true;
        document.getElementById('voice-reader-pause').disabled = false;
        document.getElementById('voice-reader-stop').disabled = false;
    }
    
    speak(text) {
        this.synth.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        
        // --- Language Detection and Voice Hinting ---
        const detectedLang = this._detectLanguage(text);
        utterance.lang = detectedLang; 
        utterance.voice = null; 
        
        utterance.rate = this.readingSpeed;
        utterance.pitch = this.readingPitch;
        utterance.volume = this.volume;
        // --- END Language Detection ---
        
        utterance.onstart = () => {
            this.isReading = true;
            this.isPaused = false;
            this.highlightCurrentText(text);
        };
        
        utterance.onend = () => {
            this.removeHighlight();
            
            // FIX: Treat 'automatic' mode as chunked reading now that contentArray holds paragraphs.
            if (this.readingMode === 'automatic' || this.readingMode === 'paragraph' || this.readingMode === 'sentence') {
                this.currentIndex++;
                if (this.currentIndex < this.contentArray.length) {
                    setTimeout(() => this.readCurrent(), 500);
                } else {
                    this.stop();
                }
            } else {
                // This covers 'selection' mode, which is typically a single utterance
                this.stop();
            }
        };
        
        utterance.onerror = (error) => {
            console.error('Speech error:', error);
            this.updateStatus('Error: ' + error.error);
            this.stop();
        };
        
        this.currentUtterance = utterance;
        this.synth.speak(utterance);
    }
    
    pause() {
        if (this.isReading && !this.isPaused) {
            this.synth.pause();
            this.isPaused = true;
            this.updateStatus('Paused');
            this.announce('Reading paused');
            
            document.getElementById('voice-reader-play').disabled = false;
            document.getElementById('voice-reader-pause').disabled = true;
        }
    }
    
    resume() {
        if (this.isPaused) {
            this.synth.resume();
            this.isPaused = false;
            this.updateStatus('Reading...');
            this.announce('Reading resumed');
            
            document.getElementById('voice-reader-play').disabled = true;
            document.getElementById('voice-reader-pause').disabled = false;
        }
    }
    
    stop() {
        this.synth.cancel();
        this.isReading = false;
        this.isPaused = false;
        this.removeHighlight();
        this.updateStatus('Stopped');
        this.announce('Reading stopped');
        
        document.getElementById('voice-reader-play').disabled = false;
        document.getElementById('voice-reader-pause').disabled = true;
        document.getElementById('voice-reader-stop').disabled = true;
    }
    
    readNext() {
        if (this.readingMode === 'automatic') return;
        
        this.synth.cancel();
        this.currentIndex++;
        if (this.currentIndex >= this.contentArray.length) {
            this.currentIndex = this.contentArray.length - 1;
            this.announce('Already at last section');
            return;
        }
        this.readCurrent();
    }
    
    readPrevious() {
        if (this.readingMode === 'automatic') return;
        
        this.synth.cancel();
        this.currentIndex--;
        if (this.currentIndex < 0) {
            this.currentIndex = 0;
            this.announce('Already at first section');
            return;
        }
        this.readCurrent();
    }
    
    // ============================================
    // CONTENT EXTRACTION - MULTI-FORMAT SUPPORT
    // ============================================
    
    extractMainContent() {
        // 1. Handle non-webpage types first
        if (this.documentType === 'google-docs') return this.extractGoogleDocsContent();
        if (this.documentType === 'pdf') return this.extractPDFContent();
        if (this.documentType === 'office-online') return this.extractOfficeContent();
        
        // 2. Webpage extraction using the main content element
        const mainElement = this._findMainContentElement();
        
        // Use innerText for standard HTML extraction
        let text = mainElement.innerText;
        
        if (!text || text.trim().length < 100) {
            // Final fallback to body if main content extraction failed
            text = document.body.innerText;
        }

        return this.cleanText(text);
    }
    
    extractGoogleDocsContent() {
        // Google Docs paragraph renderers
        const paragraphs = document.querySelectorAll('.kix-paragraphrenderer');
        if (paragraphs.length > 0) {
            let text = '';
            paragraphs.forEach(p => {
                const content = p.textContent.trim();
                if (content && content.length > 0) {
                    text += content + '\n\n';
                }
            });
            if (text.trim().length > 0) {
                return this.cleanText(text);
            }
        }
        
        // Fallback: page content
        const content = document.querySelector('.kix-page-content');
        if (content && content.textContent.trim().length > 0) {
            return this.cleanText(content.textContent);
        }
        
        // Last resort
        return this.cleanText(document.body.innerText);
    }
    
    extractPDFContent() {
        if (window.pdfProcessor) {
            return window.pdfProcessor.extractText();
        }
        
        // Fallback to original method if pdfProcessor not available
        const textLayers = document.querySelectorAll('.textLayer');
        if (textLayers.length > 0) {
            let text = '';
            textLayers.forEach(layer => {
                const layerText = layer.textContent.trim();
                if (layerText && layerText.length > 0) {
                    text += layerText + '\n\n';
                }
            });
            if (text.trim().length > 0) {
                return this.cleanText(text);
            }
        }
        
        // PDF.js viewer
        const viewer = document.querySelector('#viewer');
        if (viewer && viewer.textContent.trim().length > 0) {
            return this.cleanText(viewer.textContent);
        }
        
        // Fallback
        return this.cleanText(document.body.innerText);
    }
    
    extractOfficeContent() {
        // Office 365 main panels
        const selectors = [
            '#WACViewPanel',
            '.MainContent',
            '[role="document"]',
            '.Office-Content',
            '#canvas'
        ];
        
        for (const selector of selectors) {
            const content = document.querySelector(selector);
            if (content && content.textContent.trim().length > 100) {
                return this.cleanText(content.textContent);
            }
        }
        
        return this.cleanText(document.body.innerText);
    }
    
    extractParagraphs() {
        // 1. Try DOM-based extraction first (Best for large, well-structured pages like Wikipedia)
        const mainElement = this._findMainContentElement();
        const domParagraphs = [];

        // Only attempt DOM extraction if we found a specific content element (not just the body)
        if (mainElement.tagName !== 'BODY') {
            // Find all <p> elements within the main container
            const pElements = mainElement.querySelectorAll('p');
            pElements.forEach(p => {
                const text = p.textContent.trim();
                // Check if the paragraph is not used for copyright, footnotes, etc.
                if (text.length > 50 && !p.closest('.reference')) { 
                    domParagraphs.push(text);
                }
            });
            
            // Ensure a meaningful number of paragraphs were found before trusting this method
            if (domParagraphs.length >= 5) { 
                console.log('✅ DOM-based paragraph extraction successful.');
                return domParagraphs;
            }
        }
        
        // 2. Fallback to InnerText + String Splitting (for all other cases)
        console.log('⚠️ Falling back to InnerText string splitting.');
        const mainContent = this.extractMainContent();
        
        // Split by double newlines (relies on cleanText to provide these)
        const textChunks = mainContent
            .split('\n\n')
            .map(p => p.trim())
            .filter(p => p.length > 10);
        
        return textChunks.length > 0 ? textChunks : [mainContent];
    }
    
    extractSentences() {
        const text = this.extractMainContent();
        
        // Split by sentence endings
        const sentences = text.match(/[^.!?]+[.!?]+[\s"]*/g) || [text];
        
        return sentences
            .map(s => s.trim())
            .filter(s => s.length > 10);
    }
    
    cleanText(text) {
        // Fix: Preserves paragraph breaks and normalizes whitespace for better reading flow.
        return text
            .replace(/\s+/g, ' ')               // Normalize all whitespace to single space
            .replace(/([\n\r]){2,}/g, '\n\n')   // Collapse excessive newlines into two (paragraph break)
            .replace(/\s+([.,!?;:])/g, '$1')    // Remove space before punctuation
            .replace(/\n\s*\n/g, '\n\n')        // Clean up newlines surrounded by spaces
            .trim();
    }
    
    // ============================================
    // VISUAL FEEDBACK
    // ============================================
    
    highlightCurrentText(text) {
        const searchText = text.substring(0, Math.min(50, text.length));
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null
        );
        
        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.includes(searchText)) {
                const parent = node.parentElement;
                if (parent && !parent.id.includes('voice-reader')) {
                    this.highlightedElement = parent;
                    parent.style.backgroundColor = '#ffeb3b';
                    parent.style.outline = '3px solid #ff9800';
                    parent.style.transition = 'all 0.3s ease';
                    parent.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    break;
                }
            }
        }
    }
    
    removeHighlight() {
        if (this.highlightedElement) {
            this.highlightedElement.style.backgroundColor = '';
            this.highlightedElement.style.outline = '';
            this.highlightedElement = null;
        }
    }
    
    updateStatus(message) {
        const status = document.getElementById('reading-status');
        if (status) status.textContent = message;
    }
    
    announce(message) {
        let announcer = document.getElementById('voice-reader-announcer');
        if (!announcer) {
            announcer = document.createElement('div');
            announcer.id = 'voice-reader-announcer';
            announcer.setAttribute('role', 'status');
            announcer.setAttribute('aria-live', 'polite');
            announcer.style.cssText = 'position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;';
            document.body.appendChild(announcer);
        }
        announcer.textContent = message;
    }
}

// ============================================
// INITIALIZE
// ============================================

window.voiceReader = new VoiceReader();

window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data.type === 'ACTIVATE_VOICE_READER') {
        window.voiceReader.show();
        window.voiceReader.startReading();
    }
});

console.log('✅ Voice Reader loaded - Supports web pages, PDFs, Google Docs, and Office Online!');