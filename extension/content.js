(function() {

// ChromeAI Plus Content Script - Complete Version
console.log('🚀 ChromeAI Plus content script loaded');

let currentProfile = null;
let userId = null;
let isProcessing = false;

// The backend URL is assumed to be defined here or globally available
const BACKEND_URL = 'http://localhost:5000'; 

// ============================================
// MESSAGE LISTENER (FIX: Added APPLY_PROFILE)
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📨 Content script received:', message.type);
    
    if (message.type === 'PING') {
        sendResponse({ status: 'ready' });
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
    
    if (message.type === 'APPLY_PROFILE') { // FIX: New listener for profile activation
        applyProfileStyles(message.profile);
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
    
    return false;
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
        case 'PROOFREAD': 
            await activateProofreaderMode();
            break;
        case 'SUMMARIZE': 
            await showSummarizerOptions();
            break;
        case 'TRANSLATE': 
            await showTranslatorInterface();
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

// ============================================
// UNIVERSAL AI HANDLER (HYBRID-FIRST: On-Device Preferred, Cloud Fallback)
// ============================================

/**
 * Calls the appropriate hybrid AI endpoint, defaulting to attempting on-device processing first.
 * The on-device task is delegated to the background script.
 */
async function callAI(prompt, options = {}) {
    console.log('🤖 Calling AI...');
    
    const isSimplifyCall = options.isSimplify || false;
    
    // Helper for making the actual fetch call (used for both hybrid and forced cloud)
    const performFetch = async (forceCloud) => {
        let endpoint = isSimplifyCall ? `${BACKEND_URL}/api/hybrid/simplify` : `${BACKEND_URL}/api/hybrid/prompt`;
        
        console.log(`📡 Fetching from backend (Cloud forced: ${forceCloud})...`);
        
        const requestBody = isSimplifyCall ? {
            text: prompt,
            useCloud: forceCloud, 
            accessibilityMode: currentProfile,
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
            console.log('✅ Backend instructed to use On-Device AI. DELEGATING to Background Service Worker...');

            // --- START: LOCAL AI EXECUTION DELEGATION ---
            try {
                // Send a message to the background service worker to run the local AI task
                const localResponse = await chrome.runtime.sendMessage({
                    type: 'RUN_LOCAL_GEMINI',
                    prompt: prompt
                });

                if (localResponse && localResponse.success) {
                    console.log('✅ Local AI responded from background.');
                    return localResponse.response;
                } else {
                    // Local execution failed (e.g., model not downloaded, background error)
                    throw new Error(localResponse?.error || 'Background local AI execution failed.');
                }
            } catch (backgroundError) {
                console.error('❌ Failed to communicate with background local AI (Local execution failed):', backgroundError);
                console.log('⚠️ Falling through to Cloud Fallback...');
                // Fall through to the Cloud Fallback logic below
            }
            // --- END: DELEGATION FIX ---
            
            // 3. Fallback: Force a cloud call (useCloud: true) if local execution failed
            const cloudData = await performFetch(true); 
            
            if (!cloudData.success) {
                throw new Error(cloudData.error || 'Cloud fallback failed');
            }
            console.log('✅ Cloud AI responded (Fallback)');
            return isSimplifyCall ? cloudData.simplified : cloudData.response;
        }
        
        // 4. If backend executed Cloud (e.g., prompt was too long/auto-forced)
        console.log('✅ AI responded (Cloud executed by backend)');
        return isSimplifyCall ? data.simplified : data.response;

    } catch (error) {
        console.error('❌ AI Error:', error);
        throw new Error(`AI unavailable: ${error.message}. Make sure Flask backend is running on port 5000.`);
    }
}

// ============================================
// OVERLAY CAPTURE UTILITY
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
// OCR + TRANSLATE
// ============================================

async function activateOCRTranslate() {
    console.log('📸 Activating OCR Translate...');
    
    // Use a unique ID for the overlay
    const OVERLAY_ID = 'ocr-translate-overlay';
    // CRITICAL FIX: Ensure createOverlay uses the fixed positioning for centering
    const overlay = createOverlay(OVERLAY_ID, '🔍 OCR + Translate');
    
    const content = `
        <div style="padding: 20px;">
            <p style="margin-bottom: 16px; color: #666; font-size: 14px;">
                Capture text from images and translate it
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
            
            <div id="ocr-result" style="margin-top: 16px; display: none;">
            </div>
        </div>
    `;
    
    overlay.querySelector('.chromeai-modal-body').innerHTML = content;
    document.body.appendChild(overlay);
    
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
        
        try {
            const result = await processOCRWithBackend(currentImageData, targetLanguage);
            console.log('✅ OCR completed');
            
            resultDiv.innerHTML = `
                <div style="padding: 16px; background: #e8f5e9; border-radius: 8px;">
                    <div style="white-space: pre-wrap; line-height: 1.6;">
                        ${formatOCRResult(result)}
                    </div>
                    <button id="copy-result-btn" style="margin-top: 12px; width: 100%; padding: 10px; background: #4caf50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        📋 Copy Translation
                    </button>
                </div>
            `;
            
            document.getElementById('copy-result-btn').onclick = () => {
                navigator.clipboard.writeText(result);
                showNotification('✓ Copied to clipboard', 'success');
            };
            
        } catch (error) {
            console.error('❌ OCR failed:', error);
            resultDiv.innerHTML = `
                <div style="padding: 16px; background: #ffebee; border-radius: 8px; color: #c62828;">
                    <strong>❌ Error:</strong> ${error.message}<br><br>
                    <small>
                        <strong>Troubleshooting:</strong><br>
                        1. Make sure Flask backend is running (python app.py)<br>
                        2. Check Gemini API key in .env file<br>
                        3. Test: <a href="http://localhost:5000/api/test/all" target="_blank" style="color: #1976d2;">http://localhost:5000/api/test/all</a>
                    </small>
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
// SCREENSHOT ANALYSIS
// ============================================

async function captureAndAnalyzeScreenshot() {
    console.log('📷 Activating Screenshot Analysis...');
    
    const OVERLAY_ID = 'screenshot-analyzer-overlay';
    const overlay = createOverlay(OVERLAY_ID, '📷 Screenshot Analyzer');
    
    const content = `
        <div style="padding: 20px;">
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
        
        try {
            const analysis = await analyzeImageWithBackend(capturedImage, query);
            
            resultDiv.innerHTML = `
                <div style="padding: 16px; background: #e8f5e9; border-radius: 8px;">
                    <strong>🤖 AI Analysis:</strong><br><br>
                    <div style="white-space: pre-wrap; line-height: 1.6;">
                        ${analysis}
                    </div>
                </div>
            `;
        } catch (error) {
            resultDiv.innerHTML = `
                <div style="padding: 12px; background: #ffebee; border-radius: 8px; color: #c62828;">
                    <strong>Error:</strong> ${error.message}
                </div>
            `;
        }
    };
    
    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
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
// OTHER FEATURES (Hybrid-First Logic applied)
// ============================================

async function showPromptInterface() {
    const overlay = createOverlay('prompt-overlay', '💭 Ask AI Anything');
    
    overlay.querySelector('.chromeai-modal-body').innerHTML = `
        <div style="padding: 20px;">
            <textarea id="prompt-input" placeholder="Ask me anything..." style="width: 100%; height: 120px; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;"></textarea>
            <button id="prompt-submit" style="width: 100%; margin-top: 12px; padding: 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">✨ Ask AI</button>
            <div id="prompt-response" style="margin-top: 16px; display: none;"></div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    document.getElementById('prompt-submit').onclick = async () => {
        const input = document.getElementById('prompt-input').value.trim();
        if (!input) return;
        
        const responseDiv = document.getElementById('prompt-response');
        responseDiv.style.display = 'block';
        responseDiv.innerHTML = '⏳ Thinking...';
        
        try {
            const response = await callAI(input);
            responseDiv.innerHTML = `<div style="padding: 12px; background: #e8f5e9; border-radius: 8px; white-space: pre-wrap;">${response}</div>`;
        } catch (error) {
            responseDiv.innerHTML = `<div style="padding: 12px; background: #ffebee; border-radius: 8px; color: #c62828;">${error.message}</div>`;
        }
    };
    
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
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
            <div id="proofread-original" style="margin-bottom: 16px; padding: 12px; background: #f0f0f0; border-radius: 8px; font-size: 14px; white-space: pre-wrap;">
                <strong>Original Text:</strong><br>${textForProcessing}
            </div>
            <div id="proofread-result">
                <div style="padding: 12px; background: #e3f2fd; border-radius: 8px;">⏳ Analyzing with AI...</div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    try {
        const prompt = `Proofread the following text for grammar, spelling, and clarity. Respond ONLY with the corrected text, ensuring the output has a smooth flow. Do NOT include any explanations or headers. Selected text: ${textForProcessing}`;
        
        const correctedText = await callAI(prompt);

        document.getElementById('proofread-result').innerHTML = `
            <div style="padding: 16px; background: #e8f5e9; border-radius: 8px;">
                <strong>✅ Corrected Text:</strong><br>
                <div id="corrected-output" style="white-space: pre-wrap; line-height: 1.6; margin-top: 8px;">${correctedText}</div>
                <button id="copy-proofread-btn" style="margin-top: 12px; width: 100%; padding: 10px; background: #4caf50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                    📋 Copy Correction
                </button>
            </div>
        `;
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

    const resultDiv = document.getElementById('summarizer-result');

    // 2. New Event Listener: Wait for the user to click the button
    document.getElementById('summarize-submit-btn').onclick = async () => {
        
        // Show loading state immediately upon click
        resultDiv.innerHTML = `
            <div style="padding: 12px; background: #e3f2fd; border-radius: 8px;">⏳ Summarizing content with AI...</div>
        `;

        try {
            const prompt = `Summarize the following document concisely, clearly, and using bullet points for key takeaways. Document text: ${fullContent}`;
            
            const summary = await callAI(prompt);

            resultDiv.innerHTML = `
                <div style="padding: 16px; background: #e8f5e9; border-radius: 8px;">
                    <strong>🤖 Summary:</strong><br>
                    <div id="summary-output" style="white-space: pre-wrap; line-height: 1.6; margin-top: 8px;">${summary}</div>
                    <button id="copy-summary-btn" style="margin-top: 12px; width: 100%; padding: 10px; background: #4caf50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        📋 Copy Summary
                    </button>
                </div>
            `;
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
    
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
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
            <div id="translate-original" style="margin-bottom: 16px; padding: 12px; background: #f0f0f0; border-radius: 8px; font-size: 14px; max-height: 100px; overflow-y: auto; white-space: pre-wrap;">
                <strong>Selected Text:</strong><br>${selectedText.substring(0, 150)}...
            </div>
            
            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Translate to:</label>
            <select id="translate-target-language" style="width: 100%; padding: 10px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; margin-bottom: 12px;">
                <option value="Spanish">Spanish (Español)</option>
                <option value="French">French (Français)</option>
                <option value="German">German (Deutsch)</option>
                <option value="Hindi">Hindi (हिन्दी)</option>
                <option value="Japanese">Japanese (日本語)</option>
                <option value="Simple English">Simple English (for learners)</option>
            </select>
            
            <button id="translate-submit-btn" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 15px;">
                ✨ Translate
            </button>
            
            <div id="translation-result" style="margin-top: 16px;"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('translate-submit-btn').onclick = async () => {
        const targetLanguage = document.getElementById('translate-target-language').value;
        const resultDiv = document.getElementById('translation-result');
        
        resultDiv.innerHTML = `<div style="padding: 12px; background: #e3f2fd; border-radius: 8px;">⏳ Translating to ${targetLanguage}...</div>`;

        try {
            const prompt = `Translate the following text into ${targetLanguage}. Respond ONLY with the translated text. Selected text: ${selectedText}`;
            
            const translation = await callAI(prompt);

            resultDiv.innerHTML = `
                <div style="padding: 16px; background: #e8f5e9; border-radius: 8px;">
                    <strong>🌐 Translation (${targetLanguage}):</strong><br>
                    <div id="translation-output" style="white-space: pre-wrap; line-height: 1.6; margin-top: 8px;">${translation}</div>
                    <button id="copy-translate-btn" style="margin-top: 12px; width: 100%; padding: 10px; background: #4caf50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        📋 Copy Translation
                    </button>
                </div>
            `;
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

    try {
        const simplifiedText = await callAI(selectedText, { isSimplify: true });
        
        // Display the successful result
        document.getElementById('simplify-result').innerHTML = `
            <div style="padding: 16px; background: #e8f5e9; border-radius: 8px;">
                <strong>✨ Simplified Text:</strong><br>
                <div id="simplified-output" style="white-space: pre-wrap; line-height: 1.6; margin-top: 8px;">${simplifiedText}</div>
                <button id="copy-simplify-btn" style="margin-top: 12px; width: 100%; padding: 10px; background: #4caf50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                    📋 Copy Simplified Text
                </button>
            </div>
        `;
        document.getElementById('copy-simplify-btn').onclick = () => {
            navigator.clipboard.writeText(simplifiedText);
            showNotification('✓ Copied to clipboard', 'success');
        };
        
        document.getElementById('summary-result').innerHTML = `
            <div style="background: #e8f5e9; padding: 12px; border-radius: 8px;">
                <div style="white-space: pre-wrap; line-height: 1.6;">${result}</div>
            </div>
        `;
    } catch (error) {
        document.getElementById('simplify-result').innerHTML = `
            <div style="padding: 12px; background: #ffebee; border-radius: 8px; color: #c62828;">
                <strong>❌ Error:</strong> ${error.message}
            </div>
        `;
    }
    
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
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
// HELPER FUNCTIONS
// ============================================

/**
 * Creates the modal overlay container with fixed positioning for reliable centering.
 */
function createOverlay(id, title) {
    const overlay = document.createElement('div');
    overlay.id = id;
    // CRITICAL FIX: Use 'top/left/transform' centering for stability
    overlay.style.cssText = `
        position: fixed; 
        top: 50%;
        left: 50%;
        transform: translate(-55%, -50%); /* Centering magic */
        
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
    
    // 2. PDF Viewer Detection
    else if (url.endsWith('.pdf') || document.querySelector('.textLayer')) {
        console.log('Extraction: PDF Viewer');
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
        const selectors = ['article', 'main', '[role="main"]', '.content', '#content', '.post-content'];
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
    return text
        .replace(/\s+/g, ' ')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+([.,!?;:])/g, '$1')
        .trim();
}

function applySettingsToPage(settings) {
    if (settings.dyslexiaFont) document.body.style.fontFamily = 'OpenDyslexic, "Comic Sans MS", sans-serif';
    if (settings.textSize) document.body.style.fontSize = settings.textSize + 'px';
    if (settings.highContrast) document.body.style.filter = 'contrast(1.5)';
}

function displayInsightsOverlay(insights, sessionCount) {
    const overlay = createOverlay('insights-overlay', '📊 Your Learning Insights');
    overlay.querySelector('.chromeai-modal-body').innerHTML = `
        <div style="padding: 20px;">
            <div style="background: #e3f2fd; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
                <strong>Sessions Analyzed:</strong> ${sessionCount}
            </div>
            <div style="white-space: pre-wrap; line-height: 1.6;">${insights}</div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

// FIX: New function to apply/remove accessibility profiles on the content page
function applyProfileStyles(profileName) {
    const body = document.body;
    
    // 1. Reset all profile classes and Focus Mode
    body.classList.remove(
        'accessibility-dyslexia', 
        'accessibility-adhd', 
        'accessibility-visual_impairment', 
        'accessibility-non_native',
        'chromeai-focus-mode' // Ensure Focus Mode is off if a profile is selected
    );

    if (profileName) {
        const className = `accessibility-${profileName}`;
        body.classList.add(className);
        console.log(`✅ Applied profile class: ${className}`);
    } else {
        console.log('✅ Removed all accessibility profile classes.');
    }
}

console.log('✅ ChromeAI Plus content script ready');
})();
