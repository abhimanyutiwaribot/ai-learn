const BACKEND_URL = 'http://localhost:5000';
let userId = null;
let currentProfile = null;
let sessionStartTime = Date.now();

(async function init() {
    const result = await chrome.storage.local.get(['userId', 'accessibilityProfile']);
    userId = result.userId || 'anonymous';
    currentProfile = result.accessibilityProfile || null;
    
    if (currentProfile) {
        applyAccessibilitySettings();
    }
})();

window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    
    const { type, data } = event.data;
    
    switch(type) {
        case 'ACTIVATE_PROMPT':
            showPromptInterface(data);
            break;
        case 'ACTIVATE_PROOFREAD':
            activateProofreader(data);
            break;
        case 'ACTIVATE_SUMMARIZE':
            showSummarizerOptions(data);
            break;
        case 'ACTIVATE_TRANSLATE':
            showTranslatorInterface(data);
            break;
        case 'ACTIVATE_SCREENSHOT':
            captureAndAnalyzeScreenshot(data);
            break;
        case 'ACTIVATE_OCR_TRANSLATE':
            activateOCRTranslate(data);
            break;
        case 'ACTIVATE_SIMPLIFY':
            simplifyPageContent(data);
            break;
        case 'ACTIVATE_VOICE_READER':
            if (window.voiceReader) {
                window.voiceReader.show();
                window.voiceReader.startReading();
            }
            break;
        case 'ACTIVATE_FOCUS_MODE':
            enableFocusMode(data);
            break;
    }
});

chrome.runtime.onMessage.addListener(async (message) => {
    const { type, text } = message;
    
    switch(type) {
        case 'TRANSLATE_SELECTION':
            await handleContextMenuTranslation(text);
            break;
        case 'PROOFREAD_SELECTION':
            await handleSelectionProofreading(text);
            break;
        case 'SIMPLIFY_SELECTION':
            await simplifySelectedText(text);
            break;
        case 'READ_ALOUD_SELECTION':
            if (window.voiceReader) {
                window.voiceReader.show();
                window.voiceReader.contentArray = [text];
                window.voiceReader.currentIndex = 0;
                window.voiceReader.readCurrent();
            }
            break;
        case 'ACTIVATE_SCREENSHOT':
            captureAndAnalyzeScreenshot({ profile: currentProfile });
            break;
    }
});

// ============================================
// PROMPT API
// ============================================

function showPromptInterface(data) {
    removeExistingOverlays();
    
    const overlay = document.createElement('div');
    overlay.id = 'ai-prompt-overlay';
    overlay.innerHTML = `
        <div class="ai-prompt-container">
            <div class="ai-prompt-header">
                <h3>💭 AI Assistant${data.accessibilityMode ? ' (Accessibility Mode)' : ''}</h3>
                <button class="ai-close-btn" aria-label="Close">✕</button>
            </div>
            <div class="ai-prompt-input-area">
                <textarea id="ai-prompt-input" placeholder="Ask me anything..." rows="3" aria-label="AI prompt input"></textarea>
                ${data.profile ? `<div class="profile-indicator">📌 ${getProfileName(data.profile)} Mode</div>` : ''}
                <button id="ai-prompt-submit">Generate</button>
            </div>
            <div id="ai-prompt-output" class="ai-prompt-output" role="region" aria-live="polite"></div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    overlay.querySelector('.ai-close-btn').addEventListener('click', () => overlay.remove());
    
    overlay.querySelector('#ai-prompt-submit').addEventListener('click', async () => {
        const input = overlay.querySelector('#ai-prompt-input').value;
        const output = overlay.querySelector('#ai-prompt-output');
        
        if (!input.trim()) {
            output.innerHTML = '<p class="error">Please enter a prompt</p>';
            return;
        }
        
        output.innerHTML = '<p class="loading">Generating response...</p>';
        
        try {
            if (window.ai && window.ai.languageModel) {
                const capabilities = await window.ai.languageModel.capabilities();
                
                if (capabilities.available === 'readily') {
                    const session = await window.ai.languageModel.create({
                        systemPrompt: data.profile ? getAccessibilitySystemPrompt(data.profile) : undefined
                    });
                    
                    const result = await session.prompt(input);
                    output.innerHTML = `<div class="result-text">${formatResultForAccessibility(result, data.profile)}</div>`;
                    session.destroy();
                } else {
                    throw new Error('Use cloud');
                }
            } else {
                throw new Error('Use cloud');
            }
        } catch (error) {
            try {
                const response = await fetch(`${BACKEND_URL}/api/hybrid/prompt`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: input,
                        useCloud: true,
                        userId,
                        accessibilityMode: data.profile
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    output.innerHTML = `
                        <div class="cloud-badge">☁️ Cloud AI</div>
                        <div class="result-text">${formatResultForAccessibility(result.response, data.profile)}</div>
                    `;
                }
            } catch (cloudError) {
                output.innerHTML = `<p class="error">Error: ${cloudError.message}</p>`;
            }
        }
    });
    
    overlay.querySelector('#ai-prompt-input').focus();
}

// ============================================
// PROOFREADER
// ============================================

async function activateProofreader(data) {
    try {
        const selection = window.getSelection().toString();
        
        if (!selection) {
            showToast('Please select some text to proofread', 'error');
            return;
        }
        
        if (!window.ai || !window.ai.proofreader) {
            showToast('Proofreader API not available', 'error');
            return;
        }
        
        showToast('🔤 Proofreading text...');
        
        const proofreader = await window.ai.proofreader.create({
            includeCorrectionTypes: true,
            includeCorrectionExplanations: true
        });
        
        const result = await proofreader.proofread(selection);
        showProofreadResults(result, selection, data.profile);
        proofreader.destroy();
        
    } catch (error) {
        showToast('Proofreading error: ' + error.message, 'error');
    }
}

function showProofreadResults(result, originalText, profile) {
    removeExistingOverlays();
    
    const correctionsList = result.corrections && result.corrections.length > 0 ? 
        result.corrections.map((correction, index) => {
            const originalPart = originalText.substring(correction.startIndex, correction.endIndex);
            return `
                <div class="proofread-correction">
                    <strong>Correction ${index + 1}:</strong><br>
                    <span style="text-decoration: line-through; color: #d32f2f;">${originalPart}</span> → 
                    <span style="color: #388e3c;">${correction.correction}</span>
                    ${correction.explanation ? `<br><em style="font-size: 11px;">💡 ${correction.explanation}</em>` : ''}
                </div>
            `;
        }).join('') : '<p style="text-align: center; color: #4caf50; padding: 20px;">✓ Perfect! No corrections needed</p>';
    
    const overlay = document.createElement('div');
    overlay.id = 'ai-proofread-overlay';
    overlay.innerHTML = `
        <div class="ai-prompt-container">
            <div class="ai-prompt-header">
                <h3>🔤 Proofreader Results</h3>
                <button class="ai-close-btn">✕</button>
            </div>
            <div class="ai-prompt-output">
                <div class="proofread-section">
                    <h4>Original:</h4>
                    <p>${originalText}</p>
                </div>
                <div class="proofread-section">
                    <h4>Corrections Found: ${result.corrections ? result.corrections.length : 0}</h4>
                    ${correctionsList}
                </div>
                <div class="proofread-section">
                    <h4>Corrected Text:</h4>
                    <p>${result.corrected || result.correctedInput || originalText}</p>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    overlay.querySelector('.ai-close-btn').addEventListener('click', () => overlay.remove());
}

// ============================================
// SUMMARIZER
// ============================================

function showSummarizerOptions(data) {
    removeExistingOverlays();
    
    const overlay = document.createElement('div');
    overlay.id = 'ai-summarizer-overlay';
    overlay.innerHTML = `
        <div class="ai-prompt-container">
            <div class="ai-prompt-header">
                <h3>📄 Summarizer</h3>
                <button class="ai-close-btn">✕</button>
            </div>
            <div class="ai-summarizer-options">
                <button class="option-btn" id="summarize-inline">Summarize This Page</button>
                <button class="option-btn" id="summarize-docs">Export to Google Docs</button>
            </div>
            <div id="ai-summarizer-output" class="ai-prompt-output"></div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    overlay.querySelector('.ai-close-btn').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#summarize-inline').addEventListener('click', () => summarizeCurrentPage(overlay, data));
    overlay.querySelector('#summarize-docs').addEventListener('click', () => exportToGoogleDocs(data));
}

async function summarizeCurrentPage(overlay, data) {
    const output = overlay.querySelector('#ai-summarizer-output');
    output.innerHTML = '<p class="loading">Summarizing content...</p>';
    
    try {
        const pageContent = extractMainContent();
        
        if (window.ai && window.ai.summarizer) {
            const summarizer = await window.ai.summarizer.create({
                type: 'tldr',
                length: 'short'
            });
            
            const summary = await summarizer.summarize(pageContent);
            output.innerHTML = `<div class="result-text">${formatResultForAccessibility(summary, data.profile)}</div>`;
            summarizer.destroy();
        } else {
            throw new Error('Summarizer API not available');
        }
    } catch (error) {
        output.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    }
}

async function exportToGoogleDocs(data) {
    try {
        const pageContent = extractMainContent();
        const pageUrl = window.location.href;
        const pageTitle = document.title;
        
        let summary = 'Summary generation in progress...';
        
        if (window.ai && window.ai.summarizer) {
            const summarizer = await window.ai.summarizer.create({ type: 'tldr', length: 'medium' });
            summary = await summarizer.summarize(pageContent);
            summarizer.destroy();
        }
        
        const docsContent = `# Summary: ${pageTitle}\n\n**Source:** ${pageUrl}\n**Generated:** ${new Date().toLocaleString()}\n\n## Summary\n\n${summary}\n\n---\n*Generated by ChromeAI Plus*`;
        
        navigator.clipboard.writeText(docsContent);
        window.open('https://docs.google.com/document/create', '_blank');
        showToast('📄 Content copied! Paste it in Google Docs');
        
    } catch (error) {
        showToast('Export error: ' + error.message, 'error');
    }
}

// ============================================
// TRANSLATOR
// ============================================

function showTranslatorInterface(data) {
    removeExistingOverlays();
    
    const overlay = document.createElement('div');
    overlay.id = 'ai-translator-overlay';
    overlay.innerHTML = `
        <div class="ai-prompt-container">
            <div class="ai-prompt-header">
                <h3>🌐 Translator</h3>
                <button class="ai-close-btn">✕</button>
            </div>
            <div class="ai-translator-controls">
                <select id="target-language">
                    <option value="">Select language</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="ja">Japanese</option>
                    <option value="ko">Korean</option>
                    <option value="zh">Chinese</option>
                    <option value="ar">Arabic</option>
                    <option value="hi">Hindi</option>
                </select>
                <button id="translate-page-btn">Translate Page</button>
                <button id="translate-selection-btn">Translate Selection</button>
            </div>
            <div id="ai-translator-output" class="ai-prompt-output"></div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    overlay.querySelector('.ai-close-btn').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#translate-page-btn').addEventListener('click', () => translatePage(overlay));
    overlay.querySelector('#translate-selection-btn').addEventListener('click', () => translateSelection(overlay));
}

async function translatePage(overlay) {
    const output = overlay.querySelector('#ai-translator-output');
    const targetLang = overlay.querySelector('#target-language').value;
    
    if (!targetLang) {
        output.innerHTML = '<p class="error">Please select a language</p>';
        return;
    }
    
    output.innerHTML = '<p class="loading">Translating page...</p>';
    
    try {
        if (!window.translation || !window.translation.Translator) {
            throw new Error('Translator API not available');
        }
        
        const translator = await window.translation.Translator.create({
            sourceLanguage: 'en',
            targetLanguage: targetLang
        });
        
        const textNodes = getTextNodes(document.body);
        let count = 0;
        
        for (const node of textNodes.slice(0, 50)) {
            if (node.textContent.trim()) {
                const translated = await translator.translate(node.textContent);
                node.textContent = translated;
                count++;
            }
        }
        
        output.innerHTML = `<p class="success">✓ Translated ${count} elements</p>`;
        
    } catch (error) {
        output.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    }
}

async function translateSelection(overlay) {
    const output = overlay.querySelector('#ai-translator-output');
    const targetLang = overlay.querySelector('#target-language').value;
    const selection = window.getSelection().toString();
    
    if (!targetLang) {
        output.innerHTML = '<p class="error">Please select a language</p>';
        return;
    }
    
    if (!selection) {
        output.innerHTML = '<p class="error">Please select text first</p>';
        return;
    }
    
    output.innerHTML = '<p class="loading">Translating...</p>';
    
    try {
        if (!window.translation || !window.translation.Translator) {
            throw new Error('Translator API not available');
        }
        
        const translator = await window.translation.Translator.create({
            sourceLanguage: 'en',
            targetLanguage: targetLang
        });
        
        const translated = await translator.translate(selection);
        
        output.innerHTML = `
            <div class="translation-result">
                <h4>Original:</h4>
                <p>${selection}</p>
                <h4>Translation:</h4>
                <p>${translated}</p>
            </div>
        `;
        
    } catch (error) {
        output.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    }
}

// ============================================
// MULTIMODAL: SCREENSHOT
// ============================================

async function captureAndAnalyzeScreenshot(data) {
    try {
        showToast('📸 Capturing screenshot...');
        
        const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        
        const overlay = document.createElement('div');
        overlay.id = 'screenshot-analysis-overlay';
        overlay.innerHTML = `
            <div class="ai-prompt-container">
                <div class="ai-prompt-header">
                    <h3>📸 Screenshot Analysis</h3>
                    <button class="ai-close-btn">✕</button>
                </div>
                <div class="screenshot-preview">
                    <img src="${screenshot}" alt="Captured screenshot" style="max-width: 100%; border-radius: 8px;">
                </div>
                <div class="ai-prompt-input-area">
                    <input type="text" id="screenshot-query" placeholder="What would you like to know about this image?">
                    <button id="analyze-screenshot-btn">Analyze</button>
                </div>
                <div id="screenshot-output" class="ai-prompt-output"></div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        overlay.querySelector('.ai-close-btn').addEventListener('click', () => overlay.remove());
        
        overlay.querySelector('#analyze-screenshot-btn').addEventListener('click', async () => {
            const query = overlay.querySelector('#screenshot-query').value || 'Analyze this screenshot in detail';
            const output = overlay.querySelector('#screenshot-output');
            
            output.innerHTML = '<p class="loading">Analyzing image with AI...</p>';
            
            try {
                const response = await fetch(`${BACKEND_URL}/api/multimodal/analyze-image`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        image: screenshot,
                        query,
                        userId,
                        accessibilityMode: data.profile
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    output.innerHTML = `
                        <div class="cloud-badge">☁️ Gemini Vision</div>
                        <div class="result-text">${formatResultForAccessibility(result.analysis, data.profile)}</div>
                    `;
                }
            } catch (error) {
                output.innerHTML = `<p class="error">Error: ${error.message}</p>`;
            }
        });
        
    } catch (error) {
        showToast('❌ Screenshot failed: ' + error.message, 'error');
    }
}

// ============================================
// MULTIMODAL: OCR + TRANSLATE
// ============================================

async function activateOCRTranslate(data) {
    const overlay = document.createElement('div');
    overlay.id = 'ocr-translate-overlay';
    overlay.innerHTML = `
        <div class="ai-prompt-container">
            <div class="ai-prompt-header">
                <h3>🖼️ OCR + Translate</h3>
                <button class="ai-close-btn">✕</button>
            </div>
            <div class="ocr-upload-area">
                <input type="file" id="ocr-image-upload" accept="image/*" style="display: none;">
                <button id="upload-image-btn" class="option-btn">📁 Upload Image</button>
                <button id="screenshot-ocr-btn" class="option-btn">📸 Take Screenshot</button>
            </div>
            <div id="ocr-image-preview"></div>
            <div class="ai-translator-controls">
                <select id="ocr-target-language">
                    <option value="">Select target language</option>
                    <option value="English">English</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                    <option value="German">German</option>
                    <option value="Japanese">Japanese</option>
                    <option value="Korean">Korean</option>
                </select>
                <button id="process-ocr-btn" disabled>Extract & Translate</button>
            </div>
            <div id="ocr-output" class="ai-prompt-output"></div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    let selectedImage = null;
    
    overlay.querySelector('.ai-close-btn').addEventListener('click', () => overlay.remove());
    
    overlay.querySelector('#upload-image-btn').addEventListener('click', () => {
        overlay.querySelector('#ocr-image-upload').click();
    });
    
    overlay.querySelector('#ocr-image-upload').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                selectedImage = event.target.result;
                overlay.querySelector('#ocr-image-preview').innerHTML = 
                    `<img src="${selectedImage}" style="max-width: 100%; max-height: 200px; border-radius: 8px; margin: 12px 0;">`;
                overlay.querySelector('#process-ocr-btn').disabled = false;
            };
            reader.readAsDataURL(file);
        }
    });
    
    overlay.querySelector('#screenshot-ocr-btn').addEventListener('click', async () => {
        try {
            const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
            selectedImage = screenshot;
            overlay.querySelector('#ocr-image-preview').innerHTML = 
                `<img src="${selectedImage}" style="max-width: 100%; max-height: 200px; border-radius: 8px; margin: 12px 0;">`;
            overlay.querySelector('#process-ocr-btn').disabled = false;
        } catch (error) {
            showToast('Screenshot failed: ' + error.message, 'error');
        }
    });
    
    overlay.querySelector('#process-ocr-btn').addEventListener('click', async () => {
        const targetLang = overlay.querySelector('#ocr-target-language').value;
        const output = overlay.querySelector('#ocr-output');
        
        if (!targetLang) {
            output.innerHTML = '<p class="error">Please select a target language</p>';
            return;
        }
        
        output.innerHTML = '<p class="loading">Extracting text and translating...</p>';
        
        try {
            const response = await fetch(`${BACKEND_URL}/api/multimodal/ocr-translate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: selectedImage,
                    targetLanguage: targetLang,
                    userId
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                output.innerHTML = `
                    <div class="cloud-badge">☁️ Gemini Vision</div>
                    <div class="result-text" style="white-space: pre-wrap;">${result.result}</div>
                `;
            }
        } catch (error) {
            output.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        }
    });
}

// ============================================
// ACCESSIBILITY: SIMPLIFY
// ============================================

async function simplifyPageContent(data) {
    try {
        showToast('📝 Simplifying page content...');
        
        const mainContent = extractMainContent();
        
        if (!mainContent) {
            showToast('No content found to simplify', 'error');
            return;
        }
        
        let simplified;
        try {
            if (window.ai && window.ai.summarizer) {
                const summarizer = await window.ai.summarizer.create({
                    type: 'key-points',
                    length: 'short'
                });
                simplified = await summarizer.summarize(mainContent);
                summarizer.destroy();
            } else {
                throw new Error('Use cloud');
            }
        } catch (error) {
            const response = await fetch(`${BACKEND_URL}/api/hybrid/simplify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: mainContent,
                    useCloud: true,
                    userId,
                    accessibilityMode: data.profile
                })
            });
            
            const result = await response.json();
            simplified = result.simplified;
        }
        
        showSimplifiedContent(simplified, data.profile);
        
    } catch (error) {
        showToast('Simplification error: ' + error.message, 'error');
    }
}

async function simplifySelectedText(text) {
    try {
        if (!text || !text.trim()) {
            showToast('Please select text to simplify', 'error');
            return;
        }
        
        showToast('📝 Simplifying text...');
        
        let simplified;
        if (window.ai && window.ai.summarizer) {
            const summarizer = await window.ai.summarizer.create({
                type: 'key-points',
                length: 'short'
            });
            simplified = await summarizer.summarize(text);
            summarizer.destroy();
        } else {
            const response = await fetch(`${BACKEND_URL}/api/hybrid/simplify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    useCloud: true,
                    userId,
                    accessibilityMode: currentProfile
                })
            });
            
            const result = await response.json();
            simplified = result.simplified;
        }
        
        showSimplifiedContent(simplified, currentProfile);
        
    } catch (error) {
        showToast('Simplification error: ' + error.message, 'error');
    }
}

function showSimplifiedContent(content, profile) {
    removeExistingOverlays();
    
    const overlay = document.createElement('div');
    overlay.id = 'simplified-content-overlay';
    overlay.innerHTML = `
        <div class="ai-prompt-container">
            <div class="ai-prompt-header">
                <h3>📝 Simplified Content${profile ? ' (' + getProfileName(profile) + ')' : ''}</h3>
                <button class="ai-close-btn">✕</button>
            </div>
            <div class="ai-prompt-output" style="max-height: 500px; overflow-y: auto;">
                <div class="result-text ${profile ? 'accessibility-' + profile : ''}" style="line-height: 1.8;">
                    ${formatResultForAccessibility(content, profile)}
                </div>
            </div>
            <div style="padding: 16px; border-top: 1px solid #e0e0e0; display: flex; gap: 8px;">
                <button id="read-aloud-simplified" class="option-btn" style="flex: 1;">🔊 Read Aloud</button>
                <button id="copy-simplified" class="option-btn" style="flex: 1;">📋 Copy</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    overlay.querySelector('.ai-close-btn').addEventListener('click', () => overlay.remove());
    
    overlay.querySelector('#read-aloud-simplified').addEventListener('click', () => {
        if (window.voiceReader) {
            window.voiceReader.show();
            window.voiceReader.contentArray = [content];
            window.voiceReader.currentIndex = 0;
            window.voiceReader.readCurrent();
        }
    });
    
    overlay.querySelector('#copy-simplified').addEventListener('click', () => {
        navigator.clipboard.writeText(content);
        showToast('✓ Copied to clipboard!');
    });
}

// ============================================
// ACCESSIBILITY: FOCUS MODE
// ============================================

let focusModeActive = false;
let originalStyles = null;

function enableFocusMode(data) {
    if (focusModeActive) {
        if (originalStyles) {
            document.body.style.cssText = originalStyles;
        }
        document.querySelectorAll('.focus-mode-hidden').forEach(el => {
            el.classList.remove('focus-mode-hidden');
            el.style.display = '';
        });
        focusModeActive = false;
        showToast('Focus mode disabled');
        return;
    }
    
    focusModeActive = true;
    originalStyles = document.body.style.cssText;
    
    const selectorsToHide = ['header', 'nav', 'aside', 'footer', '.sidebar', '.ad'];
    
    selectorsToHide.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            el.classList.add('focus-mode-hidden');
            el.style.display = 'none';
        });
    });
    
    const mainContent = document.querySelector('main, article, .content') || document.body;
    mainContent.style.maxWidth = '700px';
    mainContent.style.margin = '0 auto';
    mainContent.style.padding = '40px 20px';
    mainContent.style.fontSize = data.profile === 'dyslexia' ? '18px' : '16px';
    mainContent.style.lineHeight = '1.8';
    
    if (data.profile === 'dyslexia') {
        mainContent.style.fontFamily = 'OpenDyslexic, "Comic Sans MS", sans-serif';
    }
    
    const indicator = document.createElement('div');
    indicator.id = 'focus-mode-indicator';
    indicator.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 20px;
        border-radius: 25px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        z-index: 999999;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
    `;
    indicator.textContent = '🎯 Focus Mode Active - Click to Exit';
    indicator.addEventListener('click', () => {
        enableFocusMode(data);
        indicator.remove();
    });
    
    document.body.appendChild(indicator);
    showToast('🎯 Focus mode enabled');
}

// ============================================
// CONTEXT MENU HANDLERS
// ============================================

async function handleContextMenuTranslation(text) {
    const targetLang = prompt('Enter language code (es, fr, de, ja, ko, zh):');
    if (!targetLang) return;
    
    try {
        const translator = await window.translation.Translator.create({
            sourceLanguage: 'en',
            targetLanguage: targetLang
        });
        
        const translated = await translator.translate(text);
        showQuickTranslation(text, translated, targetLang);
        
    } catch (error) {
        showToast('Translation error: ' + error.message, 'error');
    }
}

async function handleSelectionProofreading(text) {
    try {
        if (!window.ai || !window.ai.proofreader) {
            showToast('Proofreader API not available', 'error');
            return;
        }
        
        const proofreader = await window.ai.proofreader.create({
            includeCorrectionTypes: true,
            includeCorrectionExplanations: true
        });
        
        const result = await proofreader.proofread(text);
        showProofreadResults(result, text, currentProfile);
        proofreader.destroy();
        
    } catch (error) {
        showToast('Proofreading error: ' + error.message, 'error');
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function showQuickTranslation(original, translated, targetLang) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        width: 350px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 999999;
        padding: 20px;
    `;
    
    toast.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
            <strong>Translation (${targetLang})</strong>
            <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; cursor: pointer;">×</button>
        </div>
        <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin-bottom: 8px;">
            <strong>Original:</strong><br>${original}
        </div>
        <div style="background: #e8f5e9; padding: 12px; border-radius: 8px;">
            <strong>Translated:</strong><br>${translated}
        </div>
    `;
    
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 10000);
}

function extractMainContent() {
    const selectors = ['article', 'main', '.content', '#content', '.post'];
    
    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
            return element.innerText.slice(0, 5000);
        }
    }
    
    return document.body.innerText.slice(0, 5000);
}

function getTextNodes(element) {
    const textNodes = [];
    const walk = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.parentElement.tagName)) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );
    
    let node;
    while (node = walk.nextNode()) {
        textNodes.push(node);
    }
    
    return textNodes;
}

function removeExistingOverlays() {
    const overlays = [
        'ai-prompt-overlay',
        'ai-proofread-overlay',
        'ai-summarizer-overlay',
        'ai-translator-overlay',
        'screenshot-analysis-overlay',
        'ocr-translate-overlay',
        'simplified-content-overlay'
    ];
    
    overlays.forEach(id => {
        const existing = document.getElementById(id);
        if (existing) existing.remove();
    });
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'error' ? '#f44336' : '#323232'};
        color: white;
        padding: 12px 24px;
        border-radius: 25px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 9999999;
        font-size: 13px;
        font-weight: 600;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

function getProfileName(profile) {
    const names = {
        'dyslexia': 'Dyslexia',
        'adhd': 'ADHD',
        'visual_impairment': 'Visual',
        'non_native': 'Language Learner'
    };
    return names[profile] || profile;
}

function getAccessibilitySystemPrompt(profile) {
    const prompts = {
        'dyslexia': 'You are helping someone with dyslexia. Use short sentences, simple words, bullet points.',
        'adhd': 'You are helping someone with ADHD. Be concise, use numbered lists, highlight key points.',
        'visual_impairment': 'You are helping someone with visual impairment. Describe visuals, use clear headings.',
        'non_native': 'You are helping an English learner. Use simple vocabulary, define complex terms.'
    };
    return prompts[profile] || '';
}

function formatResultForAccessibility(text, profile) {
    if (!profile) return text;
    
    if (profile === 'dyslexia') {
        text = text.replace(/\.\s/g, '.\n\n');
        text = text.replace(/\b([A-Z]{3,})\b/g, '<strong style="color: #667eea;">$1</strong>');
    }
    
    if (profile === 'adhd') {
        text = text.replace(/KEY POINT:/g, '<strong style="color: #ff9800;">🎯 KEY POINT:</strong>');
        text = text.replace(/IMPORTANT:/g, '<strong style="color: #f44336;">⚠️ IMPORTANT:</strong>');
    }
    
    return text;
}

function applyAccessibilitySettings() {
    if (currentProfile === 'dyslexia') {
        document.body.style.fontFamily = 'OpenDyslexic, "Comic Sans MS", sans-serif';
    }
}

window.addEventListener('beforeunload', async () => {
    const duration = Math.floor((Date.now() - sessionStartTime) / 1000);
    
    try {
        await fetch(`${BACKEND_URL}/api/analytics/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                documentType: window.location.hostname,
                duration,
                accessibilityMode: currentProfile
            })
        });
    } catch (error) {
        // Fail silently
        console.log(error)
    }
});
