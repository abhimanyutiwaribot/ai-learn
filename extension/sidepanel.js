const BACKEND_URL = 'http://localhost:5000';
let currentProfile = null;
let accessibilityMode = false;
let userId = null; 

class ChromeAISidePanel {
    constructor() {
        this.initializeEventListeners();
        this.loadUserSettings();
    }

    async loadUserSettings() {
        const result = await chrome.storage.local.get(['userId', 'accessibilityProfile', 'settings']);
        
        if (result.userId && result.userId !== 'anonymous') {
            userId = result.userId;
            this.showMainContent();
            
            if (userId) {
                await this.loadProfileFromBackend(userId);
            }
            
        } else {
            this.showAuthSection();
            return;
        }
        
        // Load Accessibility Profile status
        if (currentProfile) {
            accessibilityMode = true;
            document.getElementById('accessibility-mode-toggle').checked = true;
            this.updateCurrentProfile();
        } else {
            currentProfile = null;
            accessibilityMode = false;
            document.getElementById('accessibility-mode-toggle').checked = false;
        }

        // Hide profile selection initially
        document.getElementById('profile-section').style.display = 'none';
        
        // Load Quick Settings
        if (result.settings) {
            this.applySettings(result.settings);
        }
    }

    showAuthSection() {
        document.getElementById('auth-section').style.display = 'block';
        document.getElementById('main-content').style.display = 'none';
    }

    showMainContent() {
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';
    }

    initializeEventListeners() {
        // --- Auth Listeners ---
        document.getElementById('login-btn').addEventListener('click', () => this.handleAuth('login'));
        document.getElementById('register-btn').addEventListener('click', () => this.handleAuth('register'));
        document.getElementById('logout-btn').addEventListener('click', () => this.logoutUser());

        // Password Toggle Listeners
        document.getElementById('auth-password-toggle').addEventListener('click', () => this.togglePasswordVisibility('auth-password'));
        document.getElementById('new-password-toggle').addEventListener('click', () => this.togglePasswordVisibility('new-password'));
        document.getElementById('confirm-password-toggle').addEventListener('click', () => this.togglePasswordVisibility('confirm-password'));
        
        // Password Reset Listeners
        document.getElementById('forgot-password-btn').addEventListener('click', () => this.showResetRequestForm());
        document.getElementById('request-reset-btn').addEventListener('click', () => this.handlePasswordResetRequest());
        document.getElementById('reset-password-btn').addEventListener('click', () => this.handlePasswordReset());
        document.getElementById('cancel-reset-request-btn').addEventListener('click', () => this.showLoginForm());
        document.getElementById('cancel-reset-password-btn').addEventListener('click', () => this.showLoginForm());
        
        // Password validation listeners
        document.getElementById('auth-password').addEventListener('input', () => this.validatePassword('auth-password'));
        document.getElementById('new-password').addEventListener('input', () => {
            this.validatePassword('new-password');
            this.checkPasswordsMatch();
        });
        document.getElementById('confirm-password').addEventListener('input', () => this.checkPasswordsMatch());
        
        // --- Accessibility Listeners ---
        document.getElementById('accessibility-mode-toggle').addEventListener('change', (e) => {
            accessibilityMode = e.target.checked;
            document.getElementById('profile-section').style.display = accessibilityMode ? 'block' : 'none';
            
            if (!accessibilityMode) {
                currentProfile = null;
                this.updateCurrentProfile();
                this.applyAccessibilityStylesToPopup(null);
            } else if (currentProfile) {
                this.updateCurrentProfile();
                this.applyAccessibilityStylesToPopup(currentProfile);
            }
        });
        
        // --- Profile Listeners ---
        document.querySelectorAll('.profile-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!userId || userId === 'anonymous') {
                    this.showStatus('Please log in to save your profile.', 'warning');
                    return;
                }
                const profile = btn.dataset.profile;
                currentProfile = profile;
                
                document.querySelectorAll('.profile-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                this.updateCurrentProfile();
                await chrome.storage.local.set({ accessibilityProfile: profile });
                await this.saveProfileToBackend(profile); 
                
                this.applyAccessibilityStylesToPopup(profile);
                this.showStatus('Profile saved: ' + profile, 'success');
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
        document.getElementById('voice-reader-btn').addEventListener('click', () => this.showFeatureInterface('voice-reader'));
        document.getElementById('insights-btn').addEventListener('click', () => this.showFeatureInterface('insights'));
        
        // --- Back Button Listeners ---
        document.getElementById('prompt-back-btn').addEventListener('click', () => this.hideFeatureInterface('prompt'));
        document.getElementById('proofread-back-btn').addEventListener('click', () => this.hideFeatureInterface('proofread'));
        document.getElementById('summarize-back-btn').addEventListener('click', () => this.hideFeatureInterface('summarize'));
        document.getElementById('translate-back-btn').addEventListener('click', () => this.hideFeatureInterface('translate'));
        document.getElementById('simplify-back-btn').addEventListener('click', () => this.hideFeatureInterface('simplify'));
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
        // REMOVED: document.getElementById('summarize-page-btn').addEventListener('click', () => this.switchTextSource('summarize', 'page'));
        
        // Translator source buttons
        document.getElementById('translate-selected-btn').addEventListener('click', () => this.switchTextSource('translate', 'selected'));
        // REMOVED: document.getElementById('translate-page-btn').addEventListener('click', () => this.switchTextSource('translate', 'page'));
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
            return `<pre style="background:#f8f8f8; padding: 10px; border-radius: 6px; overflow-x: auto; margin: 10px 0; font-family: monospace;"><code>${p1.trim()}</code></pre>`;
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

    // === SCREENSHOT FUNCTIONALITY ===
    initializeScreenshotInterface() {
        // Reset screenshot interface
        const previewDiv = document.getElementById('screenshot-preview');
        const responseDiv = document.getElementById('screenshot-response');
        const queryInput = document.getElementById('screenshot-query');
        const analyzeBtn = document.getElementById('analyze-screenshot-btn');
        const quickAnalyzeBtn = document.getElementById('quick-analyze-btn');
    const captureBtn = document.getElementById('capture-screenshot-main') || document.getElementById('capture-screenshot-btn');
        
        if (previewDiv) previewDiv.style.display = 'none';
        if (responseDiv) responseDiv.style.display = 'none';
        if (queryInput) queryInput.value = '';
        if (analyzeBtn) analyzeBtn.disabled = true;
        if (quickAnalyzeBtn) quickAnalyzeBtn.disabled = true;
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

        await this.analyzeScreenshotWithAI(this.currentScreenshotData, query);
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
        // NOTE: Screenshot responses might use Markdown, so we apply formatting.
        const formattedAnalysis = this.formatAIResponse(analysis);
        responseContainer.style.display = 'block';
        responseContainer.innerHTML = `
            <div class="response-header">
                <h4>🔍 AI Analysis</h4>
                <div class="response-actions">
                    <button class="copy-btn" onclick="navigator.clipboard.writeText('${analysis.replace(/'/g, "\\'")}')">📋 Copy</button>
                </div>
            </div>
            <div class="response-content">${formattedAnalysis}</div>
        `;
    }

async analyzeImageWithBackend(imageDataUrl, query) {
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

    // === AUTH METHODS ===
    getAuthCredentials() {
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value.trim();
        return { email, password };
    }

    // === Password Reset Methods ===
    showResetRequestForm() {
        document.getElementById('auth-form-container').style.display = 'none';
        document.getElementById('reset-request-form').style.display = 'block';
        document.getElementById('reset-password-form').style.display = 'none';
    }

    showResetPasswordForm() {
        document.getElementById('auth-form-container').style.display = 'none';
        document.getElementById('reset-request-form').style.display = 'none';
        document.getElementById('reset-password-form').style.display = 'block';
    }

    showLoginForm() {
        document.getElementById('auth-form-container').style.display = 'block';
        document.getElementById('reset-request-form').style.display = 'none';
        document.getElementById('reset-password-form').style.display = 'none';
        // Clear messages
        document.getElementById('auth-message').textContent = '';
        document.getElementById('reset-request-message').textContent = '';
        document.getElementById('reset-password-message').textContent = '';
    }

    async handlePasswordResetRequest() {
        const email = document.getElementById('reset-email').value.trim();
        const messageEl = document.getElementById('reset-request-message');
        messageEl.textContent = '';

        if (!email) {
            messageEl.textContent = 'Please enter your email address.';
            return;
        }

        try {
            const response = await fetch(`${BACKEND_URL}/api/auth/reset-password-request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const data = await response.json();

            if (data.success) {
                // In development, show the reset token
                if (data.dev_token) {
                    messageEl.textContent = `Reset token for development: ${data.dev_token}`;
                    this.showResetPasswordForm();
                } else {
                    messageEl.textContent = data.message;
                }
                messageEl.className = 'auth-message success';
            } else {
                messageEl.textContent = data.error || 'Failed to request password reset.';
                messageEl.className = 'auth-message error';
            }
        } catch (error) {
            messageEl.textContent = 'Network error. Is the backend running?';
            messageEl.className = 'auth-message error';
            console.error('Password reset request error:', error);
        }
    }

    async handlePasswordReset() {
        const email = document.getElementById('reset-email').value.trim();
        const token = document.getElementById('reset-token').value.trim();
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        const messageEl = document.getElementById('reset-password-message');
        messageEl.textContent = '';

        if (!email || !token || !newPassword || !confirmPassword) {
            messageEl.textContent = 'Please fill in all fields.';
            return;
        }

        if (newPassword !== confirmPassword) {
            messageEl.textContent = 'Passwords do not match.';
            return;
        }

        if (!this.validatePassword('new-password')) {
            return;
        }

        try {
            const response = await fetch(`${BACKEND_URL}/api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    token,
                    new_password: newPassword
                })
            });

            const data = await response.json();

            if (data.success) {
                messageEl.textContent = data.message;
                messageEl.className = 'auth-message success';
                // After successful reset, show login form after a delay
                setTimeout(() => this.showLoginForm(), 2000);
            } else {
                messageEl.textContent = data.error || 'Failed to reset password.';
                messageEl.className = 'auth-message error';
            }
        } catch (error) {
            messageEl.textContent = 'Network error. Is the backend running?';
            messageEl.className = 'auth-message error';
            console.error('Password reset error:', error);
        }
    }

    validatePassword(inputId) {
        const password = document.getElementById(inputId).value;
        const requirements = document.getElementById('password-requirements');
        
        // Show requirements on focus
        if (inputId === 'auth-password') {
            document.getElementById(inputId).addEventListener('focus', () => {
                requirements.style.display = 'block';
            });
            document.getElementById(inputId).addEventListener('blur', () => {
                requirements.style.display = 'none';
            });
        }

        const isValid = 
            password.length >= 8 && 
            /[0-9]/.test(password) && 
            /[!@#$%^&*]/.test(password);

        if (!isValid) {
            const messageEl = inputId === 'auth-password' ? 
                document.getElementById('auth-message') :
                document.getElementById('reset-password-message');
            
            messageEl.textContent = 'Password must be at least 8 characters and include numbers and special characters.';
            messageEl.className = 'auth-message error';
        }

        return isValid;
    }

    checkPasswordsMatch() {
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        const messageEl = document.getElementById('reset-password-message');

        if (confirmPassword) {
            if (newPassword !== confirmPassword) {
                messageEl.textContent = 'Passwords do not match.';
                messageEl.className = 'auth-message error';
                return false;
            } else {
                messageEl.textContent = 'Passwords match.';
                messageEl.className = 'auth-message success';
                return true;
            }
        }
        return false;
    }

    togglePasswordVisibility(inputId) {
        const input = document.getElementById(inputId);
        const button = document.getElementById(`${inputId}-toggle`);
        const eyeIcon = button.querySelector('.eye-icon');

        if (input.type === 'password') {
            input.type = 'text';
            eyeIcon.style.opacity = '1';
        } else {
            input.type = 'password';
            eyeIcon.style.opacity = '0.6';
        }
    }

    async handleAuth(action) {
        const { email, password } = this.getAuthCredentials();
        const messageEl = document.getElementById('auth-message');
        messageEl.textContent = '';

        if (!email || !password) {
            messageEl.textContent = 'Please enter both email and password.';
            return;
        }

        if (action === 'register' && !this.validatePassword('auth-password')) {
            return;
        }

        const endpoint = action === 'login' ? 'login' : 'register';
        const button = document.getElementById(`${action}-btn`);
        button.disabled = true;
        messageEl.textContent = 'Processing...';

        try {
            const response = await fetch(`${BACKEND_URL}/api/auth/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();

            if (data.success) {
                userId = data.userId; 
                await chrome.storage.local.set({ userId: userId });
                
                await this.loadProfileFromBackend(userId); 
                
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
        this.applyProfileToContent(null);
        
        this.showAuthSection();
        this.showStatus('Logged out successfully.', 'info');
    }

    // === FEATURE ACTIVATION ===
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
            
            const response = await fetch(`${BACKEND_URL}/api/analytics/insights/${userId}`);
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

    // === PROFILE MANAGEMENT ===
    updateCurrentProfile() {
        const profileEl = document.getElementById('current-profile');
        if (currentProfile) {
            const names = {
                'dyslexia': 'Dyslexia Support',
                'adhd': 'ADHD Focus',
                'visual_impairment': 'Visual Support',
                'non_native': 'Language Learner'
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

    async saveProfileToBackend(profile) {
        try {
            await fetch(`${BACKEND_URL}/api/accessibility/profile/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    profile: { mode: profile, timestamp: new Date().toISOString() }
                })
            });
        } catch (error) {
            console.error('Failed to save profile:', error);
        }
    }

    // === SETTINGS MANAGEMENT ===
    applySettings(settings) {
        if (settings.dyslexiaFont) document.getElementById('dyslexia-font').checked = true;
        if (settings.highContrast) document.getElementById('high-contrast').checked = true;
        if (settings.reduceMotion) document.getElementById('reduce-motion').checked = true;
        if (settings.textSize) {
            document.getElementById('text-size').value = settings.textSize;
            document.getElementById('text-size-value').textContent = settings.textSize + 'px';
        }
    }

    async updateSettings(newSettings) {
        const result = await chrome.storage.local.get(['settings']);
        const settings = result.settings || {};
        Object.assign(settings, newSettings);
        await chrome.storage.local.set({ settings });
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: this.applySettingsToContent,
            args: [settings]
        });
    }

    applySettingsToContent(settings) {
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

    // === UTILITY METHODS ===
    async logFeatureUsage(feature) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await fetch(`${BACKEND_URL}/api/analytics/session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    documentType: new URL(tab.url).hostname,
                    featuresUsed: [feature],
                    accessibilityMode: currentProfile
                })
            });
        } catch (error) {
            console.error('Failed to log:', error);
        }
    }

    showStatus(message, type = '') {
        // Create a simple status display
        console.log(`${type}: ${message}`);
        
        // You can also show status in the side panel UI if you add a status element
        const statusElement = document.getElementById('status-message');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `status-message ${type}`;
            setTimeout(() => {
                statusElement.textContent = '';
            }, 3000);
        }
    }

    async loadProfileFromBackend(user_id) {
        try {
            const response = await fetch(`${BACKEND_URL}/api/accessibility/profile/get/${user_id}`);
            const data = await response.json();
            
            if (data.success && data.profile && data.profile.mode) {
                currentProfile = data.profile.mode;
                accessibilityMode = true;
                await chrome.storage.local.set({ accessibilityProfile: currentProfile });
                document.getElementById('accessibility-mode-toggle').checked = true;
                this.updateCurrentProfile();
                this.showStatus('Profile loaded from cloud.', 'info');
            } else {
                currentProfile = null;
                accessibilityMode = false;
            }
            
            if (accessibilityMode) {
                this.applyAccessibilityStylesToPopup(currentProfile);
            } else {
                this.applyAccessibilityStylesToPopup(null); 
            }
        } catch (error) {
            console.error('Failed to load profile from backend:', error);
            this.applyAccessibilityStylesToPopup(null); 
        }
    }

    applyAccessibilityStylesToPopup(profileName) {
        const body = document.body;
        
        body.style.fontFamily = ''; 
        body.style.lineHeight = '';
        body.style.letterSpacing = '';
        
        body.classList.remove('accessibility-dyslexia', 'accessibility-adhd', 'accessibility-visual_impairment', 'accessibility-non_native');

        if (profileName === 'dyslexia') {
            body.style.fontFamily = "'OpenDyslexic', 'Comic Sans MS', sans-serif";
        }
    }

    // === FEATURE INTERFACE MANAGEMENT ===
    showFeatureInterface(featureName) {
        // Hide main content
        document.getElementById('main-content').style.display = 'none';
        
        // Show the specific feature interface
        const interfaceElement = document.getElementById(`${featureName}-interface`);
        if (interfaceElement) {
            interfaceElement.style.display = 'block';
            
            // Load content for the feature
            this.loadFeatureContent(featureName);
        }
    }

    hideFeatureInterface(featureName) {
        // Hide the feature interface
        const interfaceElement = document.getElementById(`${featureName}-interface`);
        if (interfaceElement) {
            interfaceElement.style.display = 'none';
        }
        
        // Show main content
        document.getElementById('main-content').style.display = 'block';
    }

    async loadFeatureContent(featureName) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            switch(featureName) {
                case 'prompt':
                    // Prompt interface doesn't need pre-loaded text
                    break;
                    
                case 'proofread':
                case 'summarize':
                case 'translate':
                case 'simplify':
                case 'voice-reader':
                    // Use sendMessageToContentScript for robustness
                    await this.loadTextForFeature(featureName, tab.id);
                    this.initializeVoiceReader();
                    break;
                    
                case 'ocr-translate':
                    // Initialize OCR interface
                    this.initializeOCRInterface();
                    break;
                    
                case 'screenshot':
                    // Initialize screenshot interface
                    this.initializeScreenshotInterface();
                    break;
                    
                case 'insights':
                    // Load insights
                    await this.loadInsights();
                    break;
            }
        } catch (error) {
            console.warn('Could not load content for feature:', featureName, error);
            this.showStatus('❌ Error loading content. Ensure the page is fully loaded.', 'error');
        }
    }

    async loadTextForFeature(featureName, tabId) {
        try {
            // Get selected text first using the robust sender
            const selectedResponse = await this.sendMessageToContentScript(tabId, { type: 'GET_SELECTED_TEXT' });
            const selectedText = selectedResponse?.text || '';
            
            const previewElement = document.getElementById(`${featureName}-preview`);
            if (previewElement) {
                if (selectedText) {
                    // Show selected text by default
                    previewElement.textContent = selectedText;
                } else {
                    // Show placeholder message
                    // Note: Since 'Whole Page' is removed from some features, the text now guides to selection.
                    previewElement.textContent = 'No text selected. Please select text on the webpage.';
                }
            }
        } catch (error) {
            console.warn('Could not load text for feature:', featureName, error);
            const previewElement = document.getElementById(`${featureName}-preview`);
            if (previewElement) {
                previewElement.textContent = `Error loading text content. Please try again. (Detail: ${error.message})`;
            }
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
        
        this.showStatus('🤖 Processing with AI...', 'info');
        
        try {
            // REROUTE TO CONTENT SCRIPT'S CALLAI
            const response = await this.callContentScriptAI('PROMPT', {
                prompt: prompt,
                accessibilityMode: currentProfile,
                userId: userId
            });

            if (response.success) {
                this.showPromptResponse(response.response);
            } else {
                this.showStatus('Error: ' + response.error, 'error');
            }
        } catch (error) {
            this.showStatus('Error: ' + error.message, 'error');
            responseContainer.style.display = 'none';
        }
    }

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

        this.showStatus('🔍 Checking grammar...', 'info');
        
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
            } else {
                this.showStatus('Error: ' + response.error, 'error');
            }
        } catch (error) {
            this.showStatus('Error: ' + error.message, 'error');
            responseContainer.style.display = 'none';
        }
    }

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
        this.showStatus('📄 Summarizing content...', 'info');

        try {
            // REROUTE TO CONTENT SCRIPT'S CALLAI
            const prompt = `Summarize the following document into a ${summaryLength} summary:\n\nDocument text: ${textToSummarize}`;
            
            const response = await this.callContentScriptAI('SUMMARIZE', {
                prompt: prompt,
                accessibilityMode: currentProfile,
                userId: userId
            });

            if (response.success) {
                this.showSummarizeResponse(response.response);
            } else {
                this.showStatus('Error: ' + response.error, 'error');
                responseContainer.style.display = 'none';
            }
        } catch (error) {
            this.showStatus('Error: ' + error.message, 'error');
            responseContainer.style.display = 'none';
        }
    }

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
        this.showStatus('🌐 Translating...', 'info');

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
            } else {
                this.showStatus('Error: ' + response.error, 'error');
                responseContainer.style.display = 'none';
            }
        } catch (error) {
            this.showStatus('Error: ' + error.message, 'error');
            responseContainer.style.display = 'none';
        }
    }

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
        this.showStatus('📝 Simplifying text...', 'info');

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
            } else {
                this.showStatus('Error: ' + response.error, 'error');
                responseContainer.style.display = 'none';
            }
        } catch (error) {
            this.showStatus('Error: ' + error.message, 'error');
            responseContainer.style.display = 'none';
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

        // If no preview text is loaded yet, start reading a quick snippet (selected text or title) immediately
        if (!textToRead || textToRead === 'No text available. Please select text or ensure the page has readable content.') {
            // Try to get selected text quickly, otherwise use document title as a quick-start
            this.showStatus('🔊 Preparing text... starting immediately with a quick snippet.', 'info');
            if (statusEl) statusEl.textContent = 'Preparing: starting with a short preview...';

            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab && tab.id) {
                    // Try get selected text first (fast)
                    chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTED_TEXT' }, (selResp) => {
                        const sel = selResp?.text?.trim();
                        const quickText = sel && sel.length > 20 ? sel : (tab.title || 'Reading page content');
                        // Start quick utterance
                        this._startUtterance(quickText, { speed, pitch, volume });
                    });

                    // Meanwhile, fetch full page text and when received, speak it (append)
                    chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' }, (pageResp) => {
                        const full = pageResp?.text?.trim();
                        if (full && full.length > 0) {
                            // If currently speaking a quick snippet, let it finish then speak full text
                            // Or immediately queue the full text as the next utterance
                            this._startUtterance(full, { speed, pitch, volume }, { queue: true });
                            if (statusEl) statusEl.textContent = 'Reading full page...';
                        } else {
                            if (statusEl) statusEl.textContent = 'No page text available.';
                        }
                    });
                } else {
                    // fallback: speak document title
                    this._startUtterance(document.title || 'Reading content', { speed, pitch, volume });
                }
            } catch (err) {
                this.showStatus('Error preparing text: ' + (err.message || err), 'error');
            }

            return;
        }

        // If preview text exists, start reading it immediately
        if (textToRead && textToRead.length > 0) {
            this.showStatus('🔊 Starting voice reading...', 'info');
            if (statusEl) statusEl.textContent = 'Reading...';
            try {
                this._startUtterance(textToRead, { speed, pitch, volume });
            } catch (error) {
                this.showStatus('Error: ' + error.message, 'error');
            }
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

    // Helper to start a speech utterance. If options.queue is true, will queue after current speech.
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
            if (voiceSelect && voiceSelect.value !== 'auto') {
                const voices = speechSynthesis.getVoices();
                const selectedVoice = voices.find(v => v.name === voiceSelect.value);
                if (selectedVoice) utterance.voice = selectedVoice;
            }

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
                // If queued utterances remain, speechSynthesis will continue; otherwise restore UI
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
                // Add slight delay before enqueuing to ensure ordering
                setTimeout(() => speechSynthesis.speak(utterance), 200);
            } else {
                speechSynthesis.speak(utterance);
            }

            // Keep reference to current utterance
            this.currentUtterance = utterance;
        } catch (err) {
            console.error('Failed to start utterance:', err);
            this.showStatus('Error starting speech: ' + (err.message || err), 'error');
        }
    }

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
        this.showStatus('🖼️ Extracting and translating text...', 'info');

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

    // === RESPONSE DISPLAY METHODS ===
    showPromptResponse(response) {
        const responseContainer = document.getElementById('prompt-response');
        const formattedResponse = this.formatAIResponse(response);
        responseContainer.style.display = 'block';
        responseContainer.innerHTML = `
            <div class="response-header">
                <h4>🤖 AI Response</h4>
                <div class="response-actions">
                    <button class="copy-btn" onclick="navigator.clipboard.writeText('${response.replace(/'/g, "\\'")}')">📋 Copy</button>
                </div>
            </div>
            <div class="response-content">${formattedResponse}</div>
        `;
    }

    showProofreadResponse(response) {
        const responseContainer = document.getElementById('proofread-response');
        const formattedResponse = this.formatAIResponse(response);
        responseContainer.style.display = 'block';
        responseContainer.innerHTML = `
            <div class="response-header">
                <h4>🔤 Proofreading Results</h4>
                <div class="response-actions">
                    <button class="copy-btn" onclick="navigator.clipboard.writeText('${response.replace(/'/g, "\\'")}')">📋 Copy</button>
                </div>
            </div>
            <div class="response-content">${formattedResponse}</div>
        `;
    }

    showSummarizeResponse(response) {
        const responseContainer = document.getElementById('summarize-response');
        const formattedResponse = this.formatAIResponse(response);
        responseContainer.style.display = 'block';
        responseContainer.innerHTML = `
            <div class="response-header">
                <h4>📄 Summary</h4>
                <div class="response-actions">
                    <button class="copy-btn" onclick="navigator.clipboard.writeText('${response.replace(/'/g, "\\'")}')">📋 Copy</button>
                </div>
            </div>
            <div class="response-content">${formattedResponse}</div>
        `;
    }

    showTranslateResponse(response) {
        const responseContainer = document.getElementById('translate-response');
        const formattedResponse = this.formatAIResponse(response);
        responseContainer.style.display = 'block';
        responseContainer.innerHTML = `
            <div class="response-header">
                <h4>🌐 Translation</h4>
                <div class="response-actions">
                    <button class="copy-btn" onclick="navigator.clipboard.writeText('${response.replace(/'/g, "\\'")}')">📋 Copy</button>
                </div>
            </div>
            <div class="response-content">${formattedResponse}</div>
        `;
    }

    showSimplifyResponse(response) {
        const responseContainer = document.getElementById('simplify-response');
        const formattedResponse = this.formatAIResponse(response);
        responseContainer.style.display = 'block';
        responseContainer.innerHTML = `
            <div class="response-header">
                <h4>📝 Simplified Text</h4>
                <div class="response-actions">
                    <button class="copy-btn" onclick="navigator.clipboard.writeText('${response.replace(/'/g, "\\'")}')">📋 Copy</button>
                </div>
            </div>
            <div class="response-content">${formattedResponse}</div>
        `;
    }

    showOCRTranslateResponse(response) {
        const responseContainer = document.getElementById('ocr-translate-response');
        const responseContent = document.getElementById('ocr-response-content');
        
        // Simple newline formatting for OCR output (which is often structured but not full Markdown)
        // const formattedResponse = response.replace(/\r?\n/g, '<br>'); // ORIGINAL LINE
        const formattedResponse = this.formatAIResponse(response); // FIX: Use the full AI formatter for consistent styling and bolding support.
        
        responseContainer.style.display = 'block';
        responseContent.innerHTML = formattedResponse;
    }

    copyOCRResponse() {
        const responseContent = document.getElementById('ocr-response-content');
        if (responseContent) {
            navigator.clipboard.writeText(responseContent.textContent);
            this.showStatus('✓ OCR text copied to clipboard!', 'success');
        }
    }

    clearOCRResponse() {
        const responseContainer = document.getElementById('ocr-translate-response');
        responseContainer.style.display = 'none';
        this.showStatus('🗑️ OCR response cleared.', 'info');
    }

    // === UTILITY METHODS (Direct Backend Calls for Multimodal) ===
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

    // === NEW UTILITY METHOD: Reroute to Content Script's callAI ===
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

    // === TEXT SOURCE MANAGEMENT (Modified) ===
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

    // === OCR SOURCE MANAGEMENT ===
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

    // === OCR SCREENSHOT FUNCTIONALITY ===
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

    initializeOCRInterface() {
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

    // === VOICE READER ENHANCEMENTS ===
    initializeVoiceReader() {
        // Populate voice options
        const voiceSelect = document.getElementById('voice-select');
        voiceSelect.innerHTML = '<option value="auto">Auto (Best Available)</option>';
        
        // Load available voices
        const loadVoices = () => {
            const voices = speechSynthesis.getVoices();
            voices.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.name;
                option.textContent = `${voice.name} (${voice.lang})`;
                voiceSelect.appendChild(option);
            });
        };
        
        // Load voices immediately and when they become available
        loadVoices();
        speechSynthesis.onvoiceschanged = loadVoices;
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

    // === INSIGHTS FUNCTIONALITY ===
    async loadInsights() {
        const loadingDiv = document.getElementById('insights-loading');
        const contentDiv = document.getElementById('insights-content');
        
        loadingDiv.style.display = 'block';
        contentDiv.style.display = 'none';
        
        try {
            const response = await fetch(`${BACKEND_URL}/api/analytics/insights/${userId}`);
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
        }
    }

    displayInsights(insights, sessionCount) {
        const sessionInfo = document.getElementById('insights-session-info');
        const insightsText = document.getElementById('insights-text');
        
        sessionInfo.textContent = `Sessions Analyzed: ${sessionCount}`;
        insightsText.innerHTML = this.formatAIResponse(insights); // Format the response
    }

    showInsightsError(error) {
        const sessionInfo = document.getElementById('insights-session-info');
        const insightsText = document.getElementById('insights-text');
        
        sessionInfo.textContent = 'Error Loading Insights';
        insightsText.textContent = error;
    }
}

// Initialize the side panel when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ChromeAISidePanel();
});

// Enhanced PDF AI functionality
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
        showStatus('Please select a valid PDF or Word document.', 'error');
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
        navigator.clipboard.writeText(resultContent.textContent);
        showStatus('Results copied to clipboard!', 'success');
      }
    });
  }

  function handleFileSelection(file) {
    // Check if file is PDF or Word document
    const isValidFile = file.type === 'application/pdf' || 
                      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                      file.name.toLowerCase().endsWith('.pdf') ||
                      file.name.toLowerCase().endsWith('.docx');
    
    if (!isValidFile) {
      showStatus('Please select a valid PDF or Word document.', 'error');
      return;
    }

    // Show file info
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    
    fileUploadArea.style.display = 'none';
    uploadedFileInfo.style.display = 'flex';
    
    const fileType = file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'Word document';
    showStatus(`${fileType} file selected. Click "Upload Document" to proceed.`, 'info');
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

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function showStatus(message, type) {
    pdfStatus.textContent = message;
    pdfStatus.className = `status-message ${type}`;
  }

  // Upload button handler
  if (pdfUploadBtn) {
    pdfUploadBtn.addEventListener('click', async () => {
      const files = pdfFileInput.files;
      if (!files || files.length === 0) {
        showStatus('Please select a document first.', 'error');
        return;
      }
      
      const file = files[0];
      const fileType = file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'Word document';
      showStatus(`Uploading ${fileType}টিও...`, 'info');
      
      try {
        const form = new FormData();
        form.append('file', file);
        const resp = await fetch('http://localhost:5000/upload', {
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
            showStatus('Document uploaded successfully! Ready to process.', 'success');
            pdfProcessBtn.disabled = false;
            pdfCancelBtn.disabled = false;
          } else {
            showStatus('Uploaded but no filename returned.', 'error');
          }
        } else {
          const errMsg = body.error || body.raw || resp.statusText || 'Upload failed';
          showStatus('Upload failed: ' + errMsg, 'error');
        }
      } catch (err) {
        showStatus('Upload error: ' + (err && err.message ? err.message : err), 'error');
      }
    });
  }

  // Process button handler
  if (pdfProcessBtn) {
    pdfProcessBtn.addEventListener('click', async () => {
      if (!uploadedFilename) {
        showStatus('No uploaded document found.', 'error');
        return;
      }
      
      const actionText = {
        'summarize': 'Summarizing',
        'proofread': 'Proofreading', 
        'both': 'Processing (Summarize + Proofread)'
      }[selectedAction];
      
      showStatus(`${actionText} your document with AI...`, 'info');
      pdfResult.style.display = 'none';
      
      try {
        // Create abort controller for cancellation
        const abortController = new AbortController();
        currentRequest = abortController;
        
        const resp = await fetch('http://localhost:5000/process-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            filename: uploadedFilename,
            action: selectedAction
          }),
          signal: abortController.signal
        });
        const j = await resp.json();
        
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
          
          // Apply formatting to the result before setting the content
          resultContent.innerHTML = new ChromeAISidePanel().formatAIResponse(resultText); 
          pdfResult.style.display = 'block';
          showStatus('AI processing completed successfully!', 'success');
        } else {
          showStatus('Processing failed: ' + (j.error || resp.statusText), 'error');
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          showStatus('Processing cancelled.', 'info');
        } else {
          showStatus('Processing error: ' + (err && err.message ? err.message : err), 'error');
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
        showStatus('Processing cancelled.', 'info');
        pdfProcessBtn.disabled = false;
        pdfCancelBtn.disabled = true;
      } else {
        // Reset everything if no active request
        resetFileUpload();
        showStatus('Cancelled. Upload a new document to start again.', 'info');
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