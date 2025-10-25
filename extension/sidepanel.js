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
        
        // --- Feature Listeners (from popup) ---
        document.getElementById('prompt-btn').addEventListener('click', () => this.activateFeature('PROMPT'));
        document.getElementById('proofread-btn').addEventListener('click', () => this.activateFeature('PROOFREAD'));
        document.getElementById('summarize-btn').addEventListener('click', () => this.activateFeature('SUMMARIZE'));
        document.getElementById('translate-btn').addEventListener('click', () => this.activateFeature('TRANSLATE'));
        document.getElementById('screenshot-btn').addEventListener('click', () => this.handleScreenshotDirect());
        document.getElementById('ocr-translate-btn').addEventListener('click', () => this.activateFeature('OCR_TRANSLATE'));
        document.getElementById('simplify-btn').addEventListener('click', () => this.activateFeature('SIMPLIFY'));
        document.getElementById('voice-reader-btn').addEventListener('click', () => this.activateFeature('VOICE_READER'));
        document.getElementById('insights-btn').addEventListener('click', () => this.showInsights());
        
        // --- Quick Settings Listeners ---
        document.getElementById('dyslexia-font').addEventListener('change', (e) => {
            this.updateSettings({ dyslexiaFont: e.target.checked });
            this.showStatus(e.target.checked ? 'Dyslexia-friendly font enabled' : 'Dyslexia-friendly font disabled', 'success');
        });
        document.getElementById('high-contrast').addEventListener('change', (e) => {
            this.updateSettings({ highContrast: e.target.checked });
            this.showStatus(e.target.checked ? 'High contrast mode enabled' : 'High contrast mode disabled', 'success');
        });
        document.getElementById('reduce-motion').addEventListener('change', (e) => {
            this.updateSettings({ reduceMotion: e.target.checked });
            this.showStatus(e.target.checked ? 'Motion reduction enabled' : 'Motion reduction disabled', 'success');
        });
        document.getElementById('text-size').addEventListener('input', (e) => {
            const size = e.target.value;
            document.getElementById('text-size-value').textContent = size + 'px';
            this.updateSettings({ textSize: size });
            this.showStatus(`Text size set to ${size}px`, 'success');
        });
    }

    // === SCREENSHOT FUNCTIONALITY (DIRECT SIDE PANEL) ===
    async handleScreenshotDirect() {
        this.showStatus('📸 Capturing screenshot...', 'success');
        
        try {
            // Get screenshot from background script
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
            this.showStatus('✅ Screenshot captured! Analyzing with AI...', 'success');
            
            // Create screenshot preview in the side panel
            this.showScreenshotPreview(response.dataUrl);
            
            }   else {
            const errorMsg = response ? response.error : 'Unknown error';
            this.showStatus('❌ Failed to capture screenshot: ' + errorMsg, 'error');
        }
    }  catch (error) {
            console.error('❌ Screenshot error:', error);
            this.showStatus('❌ Screenshot error: ' + error.message, 'error');
        }
    }

    showScreenshotPreview(dataUrl) {
        const resultContent = document.getElementById('resultContent');
        resultContent.innerHTML = `
            <div style="text-align: center; margin-bottom: 15px;">
                <img src="${dataUrl}" style="max-width: 100%; border-radius: 8px; border: 2px solid #e5e7eb;">
                <p style="font-size: 0.8em; color: #666; margin-top: 8px;">📸 Captured Screenshot</p>
            </div>
            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #4f46e5;">
                <strong>🔍 What would you like to know about this screenshot?</strong><br><br>
                <textarea id="screenshotQuery" placeholder="Describe what you see, ask questions about the content, or request analysis..." style="width: 100%; height: 80px; padding: 10px; border: 2px solid #e0e0e0; border-radius: 6px; font-size: 14px; margin-bottom: 10px;"></textarea>
                <button id="analyzeScreenshotBtn" style="width: 100%; padding: 12px; background: #4caf50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                    🤖 Analyze with AI
                </button>
                <button id="simpleAnalyzeBtn" style="width: 100%; padding: 10px; background: #2196f3; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; margin-top: 8px;">
                    🔍 Quick Analysis
                </button>
            </div>
        `;
        
        // Show the results section
        document.getElementById('resultsSection').style.display = 'block';
        document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
        
        // Store the screenshot data for later use
        this.currentScreenshotData = dataUrl;
        
        // Add event listeners for the buttons
        document.getElementById('analyzeScreenshotBtn').addEventListener('click', async () => {
            const query = document.getElementById('screenshotQuery').value.trim();
            await this.analyzeScreenshotWithAI(dataUrl, query || 'Analyze this screenshot and describe what you see in detail.');
        });
        
        document.getElementById('simpleAnalyzeBtn').addEventListener('click', async () => {
            await this.analyzeScreenshotWithAI(dataUrl, 'Analyze this screenshot and describe what you see. Focus on text content, layout, colors, and important visual elements.');
        });
    }

    async analyzeScreenshotWithAI(dataUrl, query) {
    this.showStatus('🤖 Analyzing with AI...', 'success');
    
    try {
        // Use your backend API instead of Chrome local AI
        const analysis = await this.analyzeImageWithBackend(dataUrl, query);
        
        const resultContent = document.getElementById('resultContent');
        if (resultContent) {
            resultContent.innerHTML = `
                <div style="text-align: center; margin-bottom: 15px;">
                    <img src="${dataUrl}" style="max-width: 100%; border-radius: 8px; border: 2px solid #e5e7eb;">
                    <p style="font-size: 0.8em; color: #666; margin-top: 8px;">📸 Captured Screenshot</p>
                </div>
                <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #4f46e5;">
                    <strong>🔍 AI Analysis:</strong><br><br>
                    <div style="white-space: pre-wrap; line-height: 1.6; background: white; padding: 15px; border-radius: 6px; border: 1px solid #e0e0e0;">${analysis}</div>
                    <div style="display: flex; gap: 10px; margin-top: 15px;">
                        <button id="copyAnalysisBtn" style="flex: 1; padding: 10px; background: #4caf50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                            📋 Copy Analysis
                        </button>
                        <button id="newAnalysisBtn" style="flex: 1; padding: 10px; background: #2196f3; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                            🔄 New Analysis
                        </button>
                    </div>
                </div>
            `;
            
            // Add event listeners for the new buttons
            document.getElementById('copyAnalysisBtn').addEventListener('click', () => {
                navigator.clipboard.writeText(analysis);
                this.showStatus('✓ Analysis copied to clipboard!', 'success');
            });
            
            document.getElementById('newAnalysisBtn').addEventListener('click', () => {
                this.showScreenshotPreview(this.currentScreenshotData);
            });
        }
        
    } catch (error) {
        this.showStatus('❌ AI analysis failed: ' + error.message, 'error');
    }
}

// Add this method to call your backend API
async analyzeImageWithBackend(imageDataUrl, query) {
    console.log('🌐 Calling backend for image analysis...');
    
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
            statusElement.className = `status-${type}`;
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
      if (files.length > 0 && files[0].type === 'application/pdf') {
        pdfFileInput.files = files;
        handleFileSelection(files[0]);
      } else {
        showStatus('Please select a valid PDF file.', 'error');
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
    if (file.type !== 'application/pdf') {
      showStatus('Please select a valid PDF file.', 'error');
      return;
    }

    // Show file info
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    
    fileUploadArea.style.display = 'none';
    uploadedFileInfo.style.display = 'flex';
    
    showStatus('PDF file selected. Click "Upload PDF" to proceed.', 'info');
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
        showStatus('Please select a PDF file first.', 'error');
        return;
      }
      
      const file = files[0];
      showStatus('Uploading PDF...', 'info');
      
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
            showStatus('PDF uploaded successfully! Ready to process.', 'success');
            pdfProcessBtn.disabled = false;
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
        showStatus('No uploaded PDF found.', 'error');
        return;
      }
      
      const actionText = {
        'summarize': 'Summarizing',
        'proofread': 'Proofreading', 
        'both': 'Processing (Summarize + Proofread)'
      }[selectedAction];
      
      showStatus(`${actionText} your PDF with AI...`, 'info');
      pdfResult.style.display = 'none';
      
      try {
        const resp = await fetch('http://localhost:5000/process-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            filename: uploadedFilename,
            action: selectedAction
          })
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
          
          resultContent.textContent = resultText;
          pdfResult.style.display = 'block';
          showStatus('AI processing completed successfully!', 'success');
        } else {
          showStatus('Processing failed: ' + (j.error || resp.statusText), 'error');
        }
      } catch (err) {
        showStatus('Processing error: ' + (err && err.message ? err.message : err), 'error');
      }
    });
  }
});