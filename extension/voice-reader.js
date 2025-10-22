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
        this.synth.addEventListener('voiceschanged', () => {
            const voices = this.synth.getVoices();
            
            // Prefer high-quality English voices
            const preferredVoices = [
                'Google US English',
                'Microsoft David Desktop',
                'Microsoft Zira Desktop',
                'Alex',
                'Samantha'
            ];
            
            for (const preferred of preferredVoices) {
                const voice = voices.find(v => v.name.includes(preferred));
                if (voice) {
                    this.selectedVoice = voice;
                    break;
                }
            }
            
            if (!this.selectedVoice) {
                this.selectedVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
            }
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
        const mode = this.readingMode;
        
        if (mode === 'selection') {
            const selection = window.getSelection().toString();
            if (!selection) {
                this.updateStatus('Please select text first');
                this.announce('Please select text to read');
                return;
            }
            this.contentArray = [selection];
        } else if (mode === 'sentence') {
            this.contentArray = this.extractSentences();
        } else if (mode === 'paragraph') {
            this.contentArray = this.extractParagraphs();
        } else {
            this.contentArray = [this.extractMainContent()];
        }
        
        if (this.contentArray.length === 0 || !this.contentArray[0]) {
            this.updateStatus('No content found to read');
            this.announce('No readable content found on this page');
            return;
        }
        
        this.currentIndex = 0;
        this.readCurrent();
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
        utterance.voice = this.selectedVoice;
        utterance.rate = this.readingSpeed;
        utterance.pitch = this.readingPitch;
        utterance.volume = this.volume;
        utterance.lang = 'en-US';
        
        utterance.onstart = () => {
            this.isReading = true;
            this.isPaused = false;
            this.highlightCurrentText(text);
        };
        
        utterance.onend = () => {
            this.removeHighlight();
            
            if (this.readingMode !== 'automatic') {
                this.currentIndex++;
                if (this.currentIndex < this.contentArray.length) {
                    setTimeout(() => this.readCurrent(), 500);
                } else {
                    this.stop();
                }
            } else {
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
        // 1. Google Docs
        if (this.documentType === 'google-docs') {
            console.log('📄 Extracting Google Docs content');
            return this.extractGoogleDocsContent();
        }
        
        // 2. PDF
        if (this.documentType === 'pdf') {
            console.log('📑 Extracting PDF content');
            return this.extractPDFContent();
        }
        
        // 3. Office Online
        if (this.documentType === 'office-online') {
            console.log('📝 Extracting Office Online content');
            return this.extractOfficeContent();
        }
        
        // 4. Regular web pages
        console.log('🌐 Extracting web page content');
        const selectors = ['article', 'main', '[role="main"]', '.content', '#content', '.post-content'];
        
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.innerText.trim().length > 100) {
                return this.cleanText(element.innerText);
            }
        }
        
        // Fallback to body
        return this.cleanText(document.body.innerText);
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
        const mainContent = this.extractMainContent();
        
        // Split by double newlines or long single newlines
        const paragraphs = mainContent
            .split(/\n\n+|\n{3,}/)
            .map(p => p.trim())
            .filter(p => p.length > 10);
        
        return paragraphs.length > 0 ? paragraphs : [mainContent];
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
        return text
            .replace(/\s+/g, ' ')
            .replace(/[\r\n]+/g, ' ')
            .replace(/\s+([.,!?;:])/g, '$1')
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
