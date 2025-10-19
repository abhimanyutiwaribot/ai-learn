// ChromeAI Plus Content Script - COMPLETE VERSION
console.log('🚀 ChromeAI Plus content script loaded');

let currentProfile = null;
let userId = null;
let isProcessing = false;
let aiSession = null;

const BACKEND_URL = 'http://localhost:5000';
let backendAvailable = false;

// ============================================
// CHECK BACKEND ON LOAD
// ============================================

async function checkBackend() {
    try {
        const response = await fetch(`${BACKEND_URL}/health`, { 
            method: 'GET',
            signal: AbortSignal.timeout(3000)
        });
        if (response.ok) {
            const data = await response.json();
            backendAvailable = data.gemini_enabled;
            console.log('✅ Backend connected:', data);
        }
    } catch (e) {
        backendAvailable = false;
        console.log('⚠️ Backend not running - limited features available');
    }
}

checkBackend();

// ============================================
// MESSAGE LISTENER
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📨 Content script received:', message.type);
    
    if (message.type === 'PING') {
        sendResponse({ status: 'ready' });
        return true;
    }
    
    if (isProcessing && message.type.startsWith('ACTIVATE_')) {
        console.log('⚠️ Already processing, please wait');
        sendResponse({ status: 'busy' });
        return true;
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
    
    if (message.type === 'SHOW_INSIGHTS') {
        displayInsightsOverlay(message.insights, message.sessionCount);
        sendResponse({ status: 'insights_shown' });
        return true;
    }
    
    return true;
});

async function handleActivation(message) {
    const type = message.type.replace('ACTIVATE_', '');
    const data = message.data || {};
    
    currentProfile = data.profile;
    userId = data.userId;
    
    console.log(`✨ Activating ${type} with profile:`, currentProfile);
    
    removeExistingOverlays();
    
    switch(type) {
        case 'PROMPT':
            await showPromptInterface();
            break;
        case 'PROOFREADER':
            await activateProofreader();
            break;
        case 'SUMMARIZER':
            await activateSummarizer();
            break;
        case 'TRANSLATOR':
            await activateTranslator();
            break;
        case 'SCREENSHOT':
            await captureAndAnalyzeScreenshot();
            break;
        case 'OCR_TRANSLATE':
            await activateOCRTranslate();
            break;
        case 'SIMPLIFY':
            await activateSimplify();
            break;
        case 'VOICE_READER':
            await activateVoiceReader();
            break;
        case 'FOCUS_MODE':
            await activateFocusMode();
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

// ============================================
// AI HANDLER
// ============================================

async function initChromeAI() {
    if (aiSession) return aiSession;
    
    if (!('ai' in self) || !self.ai.languageModel) {
        throw new Error('Chrome AI not available. Enable flags at chrome://flags/#prompt-api-for-gemini-nano');
    }
    
    try {
        aiSession = await self.ai.languageModel.create({
            systemPrompt: currentProfile ? 
                `You are an accessibility assistant helping users with ${currentProfile}. Be clear, concise, and supportive.` : 
                undefined
        });
        return aiSession;
    } catch (error) {
        throw new Error('Failed to initialize Chrome AI: ' + error.message);
    }
}

async function callAI(prompt, preferBackend = false) {
    console.log('🤖 Calling AI...', preferBackend ? '(Backend preferred)' : '(Chrome AI)');
    
    // Try backend if available and preferred
    if (preferBackend && backendAvailable) {
        try {
            const response = await fetch(`${BACKEND_URL}/api/hybrid/prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt,
                    useCloud: true,
                    accessibilityMode: currentProfile,
                    userId: userId
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    console.log('✅ Backend AI responded');
                    return data.response;
                }
            }
        } catch (error) {
            console.log('⚠️ Backend failed, trying Chrome AI');
        }
    }
    
    // Fallback to Chrome AI
    try {
        const session = await initChromeAI();
        const response = await session.prompt(prompt);
        console.log('✅ Chrome AI responded');
        return response;
    } catch (error) {
        throw new Error('Both backend and Chrome AI unavailable. ' + error.message);
    }
}

// ============================================
// SCREENSHOT ANALYSIS
// ============================================

async function captureAndAnalyzeScreenshot() {
    console.log('📷 Activating Screenshot Analysis...');
    
    if (!backendAvailable) {
        showNotification('⚠️ Backend required for Screenshot AI. Make sure Flask server is running.', 'warning');
        return;
    }
    
    const overlay = createOverlay('screenshot-overlay', '📷 Screenshot Analyzer');
    
    overlay.querySelector('.chromeai-modal-body').innerHTML = `
        <div style="padding: 20px;">
            <div style="background: #e8f5e9; padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 13px;">
                ✅ Using Gemini Vision API
            </div>
            <button id="capture-btn" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 15px; margin-bottom: 12px;">
                📸 Capture Screenshot
            </button>
            
            <div id="screenshot-preview" style="display: none;">
                <img id="screenshot-img" style="width: 100%; border-radius: 8px; margin-bottom: 12px; border: 2px solid #e0e0e0;">
                <textarea id="screenshot-query" placeholder="What would you like to know about this image?" style="width: 100%; height: 80px; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; margin-bottom: 12px; font-family: inherit;"></textarea>
                <button id="analyze-btn" style="width: 100%; padding: 14px; background: #4caf50; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 15px;">
                    🔍 Analyze with AI
                </button>
            </div>
            
            <div id="screenshot-result" style="margin-top: 16px; display: none;"></div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    let capturedImage = null;
    
    document.getElementById('capture-btn').onclick = async () => {
        try {
            showNotification('📸 Capturing...', 'info');
            const dataUrl = await captureScreenshot();
            capturedImage = dataUrl;
            document.getElementById('screenshot-img').src = dataUrl;
            document.getElementById('screenshot-preview').style.display = 'block';
            showNotification('✅ Screenshot captured!', 'success');
        } catch (error) {
            showNotification('❌ Screenshot failed: ' + error.message, 'error');
        }
    };
    
    document.getElementById('analyze-btn').onclick = async () => {
        const query = document.getElementById('screenshot-query').value.trim() || 'Analyze this image and describe what you see';
        const resultDiv = document.getElementById('screenshot-result');
        
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<div style="padding: 12px; background: #e3f2fd; border-radius: 8px;">⏳ Analyzing with Gemini Vision AI...</div>';
        
        try {
            const response = await fetch(`${BACKEND_URL}/api/multimodal/analyze-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: capturedImage,
                    query: query,
                    accessibilityMode: currentProfile,
                    userId: userId
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                resultDiv.innerHTML = `
                    <div style="padding: 16px; background: #e8f5e9; border-radius: 8px;">
                        <strong style="color: #2e7d32;">🤖 AI Analysis:</strong><br><br>
                        <div style="white-space: pre-wrap; line-height: 1.6;">
                            ${data.analysis}
                        </div>
                    </div>
                `;
            } else {
                throw new Error(data.error || 'Analysis failed');
            }
        } catch (error) {
            resultDiv.innerHTML = `
                <div style="padding: 12px; background: #ffebee; border-radius: 8px; color: #c62828;">
                    <strong>❌ Error:</strong> ${error.message}<br><br>
                    <small>Make sure Flask backend is running: <code>python app.py</code></small>
                </div>
            `;
        }
    };
    
    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
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
                reject(new Error(chrome.runtime.lastError.message));
            } else if (response && response.dataUrl) {
                resolve(response.dataUrl);
            } else {
                reject(new Error('Screenshot capture failed'));
            }
        });
    });
}

// ============================================
// OCR + TRANSLATE
// ============================================

async function activateOCRTranslate() {
    console.log('🖼️ Activating OCR Translate...');
    
    if (!backendAvailable) {
        showNotification('⚠️ Backend required for OCR. Make sure Flask server is running.', 'warning');
        return;
    }
    
    const overlay = createOverlay('ocr-overlay', '🖼️ OCR + Translate');
    
    overlay.querySelector('.chromeai-modal-body').innerHTML = `
        <div style="padding: 20px;">
            <div style="background: #e8f5e9; padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 13px;">
                ✅ Using Gemini Vision API
            </div>
            <p style="margin-bottom: 16px; color: #666; font-size: 14px;">
                Extract text from images and translate it instantly
            </p>
            
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 600;">Translate to:</label>
                <select id="ocr-target-language" style="width: 100%; padding: 10px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">
                    <option value="English">English</option>
                    <option value="Spanish">Spanish (Español)</option>
                    <option value="French">French (Français)</option>
                    <option value="German">German (Deutsch)</option>
                    <option value="Chinese">Chinese (中文)</option>
                    <option value="Japanese">Japanese (日本語)</option>
                    <option value="Korean">Korean (한국어)</option>
                    <option value="Hindi">Hindi (हिन्दी)</option>
                    <option value="Arabic">Arabic (العربية)</option>
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
            
            <div id="ocr-result" style="margin-top: 16px; display: none;"></div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    let currentImageData = null;
    
    // Capture screenshot
    document.getElementById('ocr-capture-btn').onclick = async () => {
        try {
            showNotification('📸 Capturing screenshot...', 'info');
            const dataUrl = await captureScreenshot();
            showOCRPreview(dataUrl);
            showNotification('✅ Screenshot captured!', 'success');
        } catch (error) {
            showNotification('❌ Screenshot failed: ' + error.message, 'error');
        }
    };
    
    // Upload image
    document.getElementById('ocr-upload-btn').onclick = () => {
        document.getElementById('ocr-file-input').click();
    };
    
    document.getElementById('ocr-file-input').onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                showOCRPreview(event.target.result);
            };
            reader.readAsDataURL(file);
        }
    };
    
    function showOCRPreview(dataUrl) {
        currentImageData = dataUrl;
        document.getElementById('ocr-img').src = dataUrl;
        document.getElementById('ocr-preview').style.display = 'block';
    }
    
    // Process OCR + Translate
    document.getElementById('ocr-process-btn').onclick = async () => {
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
        
        try {
            const response = await fetch(`${BACKEND_URL}/api/multimodal/ocr-translate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: currentImageData,
                    targetLanguage: targetLanguage,
                    userId: userId
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                const formattedResult = data.result
                    .replace(/ORIGINAL TEXT:/gi, '<strong style="color: #1976d2; font-size: 16px;">📝 ORIGINAL TEXT:</strong>')
                    .replace(/TRANSLATION:/gi, '<br><br><strong style="color: #388e3c; font-size: 16px;">🌐 TRANSLATION:</strong>')
                    .replace(/\n/g, '<br>');
                
                resultDiv.innerHTML = `
                    <div style="padding: 16px; background: #e8f5e9; border-radius: 8px;">
                        <div style="white-space: pre-wrap; line-height: 1.6;">
                            ${formattedResult}
                        </div>
                        <button id="copy-result-btn" style="margin-top: 12px; width: 100%; padding: 10px; background: #4caf50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                            📋 Copy Translation
                        </button>
                    </div>
                `;
                
                document.getElementById('copy-result-btn').onclick = () => {
                    navigator.clipboard.writeText(data.result);
                    showNotification('✅ Copied to clipboard', 'success');
                };
            } else {
                throw new Error(data.error || 'OCR processing failed');
            }
        } catch (error) {
            resultDiv.innerHTML = `
                <div style="padding: 16px; background: #ffebee; border-radius: 8px; color: #c62828;">
                    <strong>❌ Error:</strong> ${error.message}<br><br>
                    <small>Make sure Flask backend is running: <code>python app.py</code></small>
                </div>
            `;
        }
    };
    
    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
    };
}

// ============================================
// PROMPT INTERFACE
// ============================================

async function showPromptInterface() {
    const overlay = createOverlay('prompt-overlay', '💭 Ask AI Anything');
    
    overlay.querySelector('.chromeai-modal-body').innerHTML = `
        <div style="padding: 20px;">
            <div style="margin-bottom: 12px; padding: 10px; background: #e3f2fd; border-radius: 6px; font-size: 13px;">
                💡 ${backendAvailable ? 'Using Gemini Cloud API' : 'Using Chrome AI'}
            </div>
            <textarea id="prompt-input" placeholder="Ask me anything..." style="width: 100%; height: 120px; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; font-family: inherit;"></textarea>
            <button id="prompt-submit" style="width: 100%; margin-top: 12px; padding: 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">✨ Ask AI</button>
            <div id="prompt-response" style="margin-top: 16px; display: none;"></div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    const inputEl = document.getElementById('prompt-input');
    inputEl.focus();
    
    document.getElementById('prompt-submit').onclick = async () => {
        const input = inputEl.value.trim();
        if (!input) return;
        
        const responseDiv = document.getElementById('prompt-response');
        responseDiv.style.display = 'block';
        responseDiv.innerHTML = '<div style="padding: 12px; background: #e3f2fd; border-radius: 8px;">⏳ Thinking...</div>';
        
        try {
            const response = await callAI(input, true);
            responseDiv.innerHTML = `<div style="padding: 12px; background: #e8f5e9; border-radius: 8px; white-space: pre-wrap; line-height: 1.6;">${response}</div>`;
        } catch (error) {
            responseDiv.innerHTML = `<div style="padding: 12px; background: #ffebee; border-radius: 8px; color: #c62828;">${error.message}</div>`;
        }
    };
    
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            document.getElementById('prompt-submit').click();
        }
    });
    
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

// ============================================
// OTHER FEATURES
// ============================================

async function activateProofreader() {
    const selection = window.getSelection().toString().trim();
    
    if (!selection) {
        showNotification('📝 Please select text to proofread', 'warning');
        return;
    }
    
    const overlay = createOverlay('proofread-overlay', '📝 Proofreader');
    
    overlay.querySelector('.chromeai-modal-body').innerHTML = `
        <div style="padding: 20px;">
            <div style="margin-bottom: 12px; padding: 10px; background: #fff3e0; border-radius: 6px;">
                <strong>Selected text:</strong>
                <div style="margin-top: 8px; font-size: 13px; color: #666;">${selection.substring(0, 100)}${selection.length > 100 ? '...' : ''}</div>
            </div>
            <div id="proofread-result" style="padding: 12px; background: #e3f2fd; border-radius: 8px;">⏳ Analyzing...</div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    try {
        const prompt = `Proofread this text. List any grammar, spelling, or style errors, then provide a corrected version:\n\n${selection}`;
        const result = await callAI(prompt, true);
        
        document.getElementById('proofread-result').innerHTML = `
            <div style="background: #e8f5e9; padding: 12px; border-radius: 8px;">
                <div style="white-space: pre-wrap; line-height: 1.6;">${result}</div>
            </div>
        `;
    } catch (error) {
        document.getElementById('proofread-result').innerHTML = `
            <div style="background: #ffebee; padding: 12px; border-radius: 8px; color: #c62828;">
                ${error.message}
            </div>
        `;
    }
    
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

async function activateSummarizer() {
    const content = extractMainContent();
    
    if (!content || content.length < 100) {
        showNotification('⚠️ Not enough content to summarize', 'warning');
        return;
    }
    
    const overlay = createOverlay('summarize-overlay', '📄 Summarizer');
    
    overlay.querySelector('.chromeai-modal-body').innerHTML = `
        <div style="padding: 20px;">
            <div style="margin-bottom: 12px; padding: 10px; background: #e3f2fd; border-radius: 6px; font-size: 13px;">
                📊 Content length: ${content.length} characters
            </div>
            <div id="summary-result" style="padding: 12px; background: #e3f2fd; border-radius: 8px;">⏳ Summarizing...</div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    try {
        const prompt = `Summarize this content in 3-5 key points:\n\n${content.substring(0, 5000)}`;
        const result = await callAI(prompt, true);
        
        document.getElementById('summary-result').innerHTML = `
            <div style="background: #e8f5e9; padding: 12px; border-radius: 8px;">
                <div style="white-space: pre-wrap; line-height: 1.6;">${result}</div>
            </div>
        `;
    } catch (error) {
        document.getElementById('summary-result').innerHTML = `
            <div style="background: #ffebee; padding: 12px; border-radius: 8px; color: #c62828;">
                ${error.message}
            </div>
        `;
    }
    
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

async function activateTranslator() {
    const selection = window.getSelection().toString().trim();
    
    if (!selection) {
        showNotification('🌐 Please select text to translate', 'warning');
        return;
    }
    
    const overlay = createOverlay('translate-overlay', '🌐 Translator');
    
    overlay.querySelector('.chromeai-modal-body').innerHTML = `
        <div style="padding: 20px;">
            <div style="margin-bottom: 12px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 600;">Translate to:</label>
                <select id="target-language" style="width: 100%; padding: 10px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                    <option value="German">German</option>
                    <option value="Chinese">Chinese</option>
                    <option value="Japanese">Japanese</option>
                    <option value="Hindi">Hindi</option>
                </select>
            </div>
            <button id="translate-btn" style="width: 100%; padding: 14px; background: #2196f3; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">🌐 Translate</button>
            <div id="translate-result" style="margin-top: 16px; display: none;"></div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    document.getElementById('translate-btn').onclick = async () => {
        const targetLang = document.getElementById('target-language').value;
        const resultDiv = document.getElementById('translate-result');
        
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<div style="padding: 12px; background: #e3f2fd; border-radius: 8px;">⏳ Translating...</div>';
        
        try {
            const prompt = `Translate this text to ${targetLang}:\n\n${selection}`;
            const result = await callAI(prompt, true);
            
            resultDiv.innerHTML = `
                <div style="background: #e8f5e9; padding: 12px; border-radius: 8px;">
                    <div style="white-space: pre-wrap; line-height: 1.6;">${result}</div>
                </div>
            `;
        } catch (error) {
            resultDiv.innerHTML = `
                <div style="background: #ffebee; padding: 12px; border-radius: 8px; color: #c62828;">
                    ${error.message}
                </div>
            `;
        }
    };
    
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

async function activateSimplify() {
    const selection = window.getSelection().toString().trim();
    
    if (!selection) {
        showNotification('📝 Please select text to simplify', 'warning');
        return;
    }
    
    const overlay = createOverlay('simplify-overlay', '📝 Simplify Text');
    
    overlay.querySelector('.chromeai-modal-body').innerHTML = `
        <div style="padding: 20px;">
            <div style="margin-bottom: 12px; padding: 10px; background: #fff3e0; border-radius: 6px;">
                <strong>Original:</strong>
                <div style="margin-top: 8px; font-size: 13px; color: #666;">${selection.substring(0, 100)}${selection.length > 100 ? '...' : ''}</div>
            </div>
            <div id="simplify-result" style="padding: 12px; background: #e3f2fd; border-radius: 8px;">⏳ Simplifying...</div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    try {
        const prompt = `Simplify this text for easy reading. Use simple words and short sentences${currentProfile ? ' suitable for someone with ' + currentProfile : ''}:\n\n${selection}`;
        const result = await callAI(prompt, true);
        
        document.getElementById('simplify-result').innerHTML = `
            <div style="background: #e8f5e9; padding: 12px; border-radius: 8px;">
                <strong style="color: #2e7d32;">✅ Simplified:</strong>
                <div style="margin-top: 8px; white-space: pre-wrap; line-height: 1.6;">${result}</div>
            </div>
        `;
    } catch (error) {
        document.getElementById('simplify-result').innerHTML = `
            <div style="background: #ffebee; padding: 12px; border-radius: 8px; color: #c62828;">
                ${error.message}
            </div>
        `;
    }
    
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

async function activateVoiceReader() {
    const text = window.getSelection().toString().trim();
    if (!text) {
        showNotification('📢 Please select text to read aloud', 'warning');
        return;
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
    showNotification('🔊 Reading aloud...', 'success');
}

async function activateFocusMode() {
    const style = document.createElement('style');
    style.id = 'focus-mode-style';
    style.textContent = `
        body * {
            filter: blur(3px) !important;
            pointer-events: none !important;
        }
        article, main, [role="main"], .content {
            filter: none !important;
            pointer-events: auto !important;
        }
    `;
    
    if (document.getElementById('focus-mode-style')) {
        document.getElementById('focus-mode-style').remove();
        showNotification('✅ Focus mode disabled', 'success');
    } else {
        document.head.appendChild(style);
        showNotification('🎯 Focus mode enabled', 'success');
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function createOverlay(id, title) {
    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.6); z-index: 999999;
        display: flex; align-items: center; justify-content: center;
        animation: fadeIn 0.2s;
    `;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: white; border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        max-width: 600px; width: 90%; max-height: 85vh; overflow-y: auto;
    `;
    
    modal.innerHTML = `
        <div style="padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 16px 16px 0 0; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-size: 18px;">${title}</h3>
            <button class="close-btn" style="background: rgba(255,255,255,0.2); border: none; color: white; font-size: 20px; width: 32px; height: 32px; border-radius: 50%; cursor: pointer;">✕</button>
        </div>
        <div class="chromeai-modal-body"></div>
    `;
    
    overlay.appendChild(modal);
    modal.querySelector('.close-btn').onclick = () => overlay.remove();
    
    return overlay;
}

function showNotification(message, type = 'info') {
    const colors = { success: '#4caf50', error: '#f44336', warning: '#ff9800', info: '#2196f3' };
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px; padding: 16px 24px;
        background: ${colors[type]}; color: white; border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 9999999;
        font-weight: 500; animation: slideIn 0.3s; font-family: Arial, sans-serif;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 4000);
}

function extractMainContent() {
    const article = document.querySelector('article, main, [role="main"]');
    return (article || document.body).innerText.substring(0, 10000);
}

function displayInsightsOverlay(insights, sessionCount) {
    const overlay = createOverlay('insights-overlay', '📊 Your Learning Insights');
    
    overlay.querySelector('.chromeai-modal-body').innerHTML = `
        <div style="padding: 20px;">
            <div style="background: #e3f2fd; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
                <strong>Total Sessions:</strong> ${sessionCount}
            </div>
            <div style="white-space: pre-wrap; line-height: 1.6; color: #333;">
                ${insights}
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
    };
}

console.log('✅ ChromeAI Plus content script ready');