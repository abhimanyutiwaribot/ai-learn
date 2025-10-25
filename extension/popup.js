const BACKEND_URL = 'http://localhost:5000';
let currentProfile = null;
let accessibilityMode = false;
let userId = null; 

document.addEventListener('DOMContentLoaded', async () => {
    await loadUserSettings();
    setupEventListeners();
});

async function loadUserSettings() {
    const result = await chrome.storage.local.get(['userId', 'accessibilityProfile', 'settings']);
    
    if (result.userId && result.userId !== 'anonymous') {
        userId = result.userId;
        showMainContent();
        
        if (userId) {
            await loadProfileFromBackend(userId);
        }
        
    } else {
        showAuthSection();
        return;
    }
    
    // Load Accessibility Profile status
    if (currentProfile) {
        accessibilityMode = true;
        document.getElementById('accessibility-mode-toggle').checked = true;
        updateCurrentProfile();
    } else {
        currentProfile = null;
        accessibilityMode = false;
        document.getElementById('accessibility-mode-toggle').checked = false;
    }

    // CRITICAL FIX 1: Explicitly hide the profile selection grid to restore the default look
    document.getElementById('profile-section').style.display = 'none';
    
    // CRITICAL FIX 2: Ensure no accessibility style is applied to the popup body initially
    applyAccessibilityStylesToPopup(null); 

    // Load Quick Settings
    if (result.settings) {
        applySettings(result.settings);
    }
}

function showAuthSection() {
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('main-content').style.display = 'none';
}

function showMainContent() {
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
}

function setupEventListeners() {
    // --- Auth Listeners ---
    document.getElementById('login-btn').addEventListener('click', () => handleAuth('login'));
    document.getElementById('register-btn').addEventListener('click', () => handleAuth('register'));
    document.getElementById('logout-btn')?.addEventListener('click', () => logoutUser());
    document.getElementById('show-tutorial-btn')?.addEventListener('click', () => openTutorial());
    
    // --- Accessibility Listeners ---
    document.getElementById('accessibility-mode-toggle').addEventListener('change', (e) => {
        accessibilityMode = e.target.checked;
        document.getElementById('profile-section').style.display = accessibilityMode ? 'block' : 'none';
        
        if (!accessibilityMode) {
            currentProfile = null;
            updateCurrentProfile();
            applyAccessibilityStylesToPopup(null); // Reset all styles when OFF
        } else if (currentProfile) {
            // If profile is enabled AND one is selected (from memory/storage)
            updateCurrentProfile(); // Re-sends the active profile to the content script
            applyAccessibilityStylesToPopup(currentProfile);
        }
    });
    
    document.querySelectorAll('.profile-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!userId || userId === 'anonymous') {
                setStatus('Please log in to save your profile.', 'warning');
                return;
            }
            const profile = btn.dataset.profile;
            currentProfile = profile;
            
            document.querySelectorAll('.profile-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            updateCurrentProfile(); // FIX: Now calls the function that sends the message
            await chrome.storage.local.set({ accessibilityProfile: profile });
            await saveProfileToBackend(profile); 
            
            // CRITICAL: Apply the new style only on selection
            applyAccessibilityStylesToPopup(profile);
            
            setStatus('Profile saved: ' + profile, 'success');
        });
    });
    
    // --- Feature Listeners (All unchanged) ---
    document.getElementById('prompt-btn').addEventListener('click', () => activateFeature('PROMPT'));
    document.getElementById('proofread-btn').addEventListener('click', () => activateFeature('PROOFREAD'));
    document.getElementById('summarize-btn').addEventListener('click', () => activateFeature('SUMMARIZE'));
    document.getElementById('translate-btn').addEventListener('click', () => activateFeature('TRANSLATE'));
    document.getElementById('screenshot-btn').addEventListener('click', () => activateFeature('SCREENSHOT'));
    document.getElementById('ocr-translate-btn').addEventListener('click', () => activateFeature('OCR_TRANSLATE'));
    document.getElementById('simplify-btn').addEventListener('click', () => activateFeature('SIMPLIFY'));
    document.getElementById('voice-reader-btn').addEventListener('click', () => activateFeature('VOICE_READER'));
    // Removed: document.getElementById('focus-mode-btn').addEventListener('click', () => activateFeature('FOCUS_MODE'));
    document.getElementById('insights-btn').addEventListener('click', () => showInsights());
    
    // --- Quick Settings Listeners ---
    document.getElementById('dyslexia-font').addEventListener('change', (e) => {
        updateSettings({ dyslexiaFont: e.target.checked });
        setStatus(e.target.checked ? 'Dyslexia-friendly font enabled' : 'Dyslexia-friendly font disabled', 'success');
    });
    document.getElementById('high-contrast').addEventListener('change', (e) => {
        updateSettings({ highContrast: e.target.checked });
        setStatus(e.target.checked ? 'High contrast mode enabled' : 'High contrast mode disabled', 'success');
    });
    document.getElementById('reduce-motion').addEventListener('change', (e) => {
        updateSettings({ reduceMotion: e.target.checked });
        setStatus(e.target.checked ? 'Motion reduction enabled' : 'Motion reduction disabled', 'success');
    });
    document.getElementById('text-size').addEventListener('input', (e) => {
        const size = e.target.value;
        document.getElementById('text-size-value').textContent = size + 'px';
        updateSettings({ textSize: size });
        setStatus(`Text size set to ${size}px`, 'success');
    });
}

// PDF upload + process handlers - safe DOMContentLoaded wrapper
document.addEventListener('DOMContentLoaded', () => {
  const pdfFileInput = document.getElementById('pdf-file-input');
  const pdfUploadBtn = document.getElementById('pdf-upload-btn');
  const pdfProcessBtn = document.getElementById('pdf-process-btn');
  const pdfCancelBtn = document.getElementById('pdf-cancel-btn');
  const pdfActionSelect = document.getElementById('pdf-action-select');
  const pdfStatus = document.getElementById('pdf-status');
  const pdfResult = document.getElementById('pdf-result');
  const openSidepanelBtn = document.getElementById('open-sidepanel-btn');

  let uploadedFilename = null;
  let currentRequest = null; // To track the current fetch request

  if (pdfUploadBtn) {
    pdfUploadBtn.addEventListener('click', async () => {
      const files = pdfFileInput.files;
      if (!files || files.length === 0) {
        pdfStatus.textContent = 'Select a document first.';
        return;
      }
      const file = files[0];
      pdfStatus.textContent = 'Uploading...';
      pdfResult.textContent = '';
      try {
        const form = new FormData();
        form.append('file', file);
        const resp = await fetch('http://localhost:5000/upload', {
          method: 'POST',
          body: form
        });

        // Robust response parsing to avoid "Unexpected token '<'" when server returns HTML
        const ct = (resp.headers.get('content-type') || '').toLowerCase();
        let body;
        if (ct.includes('application/json')) {
          body = await resp.json();
        } else {
          body = { raw: await resp.text() };
        }

        if (resp.ok) {
          // prefer structured filename, fallback to raw body text
          if (body.filename) {
            uploadedFilename = body.filename;
          } else if (body.raw) {
            uploadedFilename = body.raw.trim();
          }
          if (uploadedFilename) {
            pdfStatus.textContent = 'Uploaded: ' + uploadedFilename;
            pdfProcessBtn.disabled = false;
            pdfCancelBtn.disabled = false;
          } else {
            pdfStatus.textContent = 'Uploaded but no filename returned.';
          }
        } else {
          const errMsg = body.error || body.raw || resp.statusText || 'Upload failed';
          pdfStatus.textContent = 'Upload failed: ' + errMsg;
        }
      } catch (err) {
        pdfStatus.textContent = 'Upload error: ' + (err && err.message ? err.message : err);
      }
    });
  }

  if (pdfProcessBtn) {
    pdfProcessBtn.addEventListener('click', async () => {
      if (!uploadedFilename) {
        pdfStatus.textContent = 'No uploaded document.';
        return;
      }
      
      const action = pdfActionSelect.value;
      const actionText = {
        'summarize': 'Summarizing',
        'proofread': 'Proofreading', 
        'both': 'Processing (Summarize + Proofread)'
      }[action];
      
      pdfStatus.textContent = actionText + '...';
      pdfResult.textContent = '';
      
      try {
        // Create abort controller for cancellation
        const abortController = new AbortController();
        currentRequest = abortController;
        
        const resp = await fetch('http://localhost:5000/process-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            filename: uploadedFilename,
            action: action
          }),
          signal: abortController.signal
        });
        const j = await resp.json();
        
        if (resp.ok) {
          let resultText = '';
          
          if (j.summary) {
            resultText += '📄 SUMMARY:\n' + '='.repeat(50) + '\n';
            resultText += j.summary + '\n\n';
          }
          
          if (j.proofread) {
            resultText += '🔤 PROOFREAD:\n' + '='.repeat(50) + '\n';
            resultText += j.proofread + '\n\n';
          }
          
          pdfResult.textContent = resultText;
          pdfStatus.textContent = 'Processing complete.';
        } else {
          pdfStatus.textContent = 'Processing failed: ' + (j.error || resp.statusText);
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          pdfStatus.textContent = 'Processing cancelled.';
        } else {
          pdfStatus.textContent = 'Processing error: ' + (err && err.message ? err.message : err);
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
        pdfStatus.textContent = 'Processing cancelled.';
        pdfProcessBtn.disabled = false;
        pdfCancelBtn.disabled = true;
      } else {
        // Reset everything if no active request
        uploadedFilename = null;
        pdfFileInput.value = '';
        pdfProcessBtn.disabled = true;
        pdfCancelBtn.disabled = true;
        pdfResult.textContent = '';
        pdfStatus.textContent = 'Cancelled. Upload a new document to start again.';
      }
    });
  }

  // open sidepanel (fallback: open sidepanel page in a new tab for debugging)
  if (openSidepanelBtn) {
    openSidepanelBtn.addEventListener('click', () => {
      // Try to open the extension side panel; if API not available, open sidepanel.html in a new tab
      try {
        if (chrome.sidePanel && chrome.sidePanel.setOptions) {
          // setOptions doesn't open it; we just ensure path present; user can open from UI
          chrome.sidePanel.setOptions({ path: 'sidepanel.html' });
          pdfStatus.textContent = 'Side panel configured. Open Chrome side panel UI to view it.';
        } else {
          chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });
        }
      } catch (e) {
        chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });
      }
    });
  }
});


function getAuthCredentials() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    return { email, password };
}

async function handleAuth(action) {
    const { email, password } = getAuthCredentials();
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
            
            await loadProfileFromBackend(userId); 
            
            showMainContent();
            
            // CRITICAL FIX: Explicitly hide the profile section upon successful login/register
            document.getElementById('profile-section').style.display = 'none';
            applyAccessibilityStylesToPopup(null); // Ensure clean UI on successful login
            
            setStatus(`Welcome, ${userId}!`, 'success');
            
            // Show tutorial for new users
            await showTutorialIfNeeded();
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

async function logoutUser() {
    userId = 'anonymous';
    currentProfile = null;
    accessibilityMode = false;
    
    await chrome.storage.local.set({ userId: 'anonymous', accessibilityProfile: null });
    
    // Reset UI
    document.getElementById('accessibility-mode-toggle').checked = false;
    document.getElementById('profile-section').style.display = 'none';
    
    applyAccessibilityStylesToPopup(null); // Ensure styles are removed on logout
    applyProfileToContent(null); // FIX: Ensure styles are removed from the content page
    
    showAuthSection();
    setStatus('Logged out successfully.', 'info');
}

function applySettings(settings) {
    if (settings.dyslexiaFont) document.getElementById('dyslexia-font').checked = true;
    if (settings.highContrast) document.getElementById('high-contrast').checked = true;
    if (settings.reduceMotion) document.getElementById('reduce-motion').checked = true;
    if (settings.textSize) {
        document.getElementById('text-size').value = settings.textSize;
        document.getElementById('text-size-value').textContent = settings.textSize + 'px';
    }
}

async function activateFeature(feature) {
    setStatus(`Activating ${feature}...`, 'success');
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    try {
        await chrome.tabs.sendMessage(tab.id, {
            type: `ACTIVATE_${feature}`,
            data: { profile: currentProfile, accessibilityMode, userId }
        });
        
        logFeatureUsage(feature);
        window.close();
    } catch (error) {
        setStatus('Error: ' + error.message, 'error');
    }
}

async function showInsights() {
    try {
        setStatus('Loading insights...', 'success');
        
        const response = await fetch(`${BACKEND_URL}/api/analytics/insights/${userId}`);
        const data = await response.json();
        
        if (data.success) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // FIX: Use sendMessage to send data to the content script for display
            await chrome.tabs.sendMessage(tab.id, {
                type: 'SHOW_INSIGHTS', // The content script is already listening for this
                insights: data.insights,
                sessionCount: data.session_count
            });
            
            window.close();
        } else {
            setStatus('Failed to load insights: ' + (data.error || 'Unknown error from backend'), 'error');
        }
    } catch (error) {
        setStatus('Error: ' + error.message, 'error');
    }
}

function updateCurrentProfile() {
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
    
    // FIX: Send the currently active profile (or null) to the content script
    applyProfileToContent(currentProfile); 
}

// FIX: New function to communicate the profile change to the active tab
async function applyProfileToContent(profileName) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    try {
        await chrome.tabs.sendMessage(tab.id, {
            type: 'APPLY_PROFILE',
            profile: profileName 
        });
    } catch (error) {
        // This catches errors if the content script hasn't loaded yet
        console.warn('Could not send APPLY_PROFILE message:', error.message);
    }
}


async function saveProfileToBackend(profile) {
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

async function updateSettings(newSettings) {
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || {};
    Object.assign(settings, newSettings);
    await chrome.storage.local.set({ settings });
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: applySettingsToContent,
        args: [settings]
    });
}

function applySettingsToContent(settings) {
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

async function logFeatureUsage(feature) {
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

function setStatus(message, type = '') {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;
    
    if (type) {
        setTimeout(() => {
            statusEl.textContent = '';
            statusEl.className = 'status';
        }, 3000);
    }
}

async function loadProfileFromBackend(user_id) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/accessibility/profile/get/${user_id}`);
        const data = await response.json();
        
        if (data.success && data.profile && data.profile.mode) {
            currentProfile = data.profile.mode;
            accessibilityMode = true;
            await chrome.storage.local.set({ accessibilityProfile: currentProfile });
            document.getElementById('accessibility-mode-toggle').checked = true;
            updateCurrentProfile();
            setStatus('Profile loaded from cloud.', 'info');
        } else {
            currentProfile = null;
            accessibilityMode = false;
        }
        
        // Final UI cleanup: apply style *only* if the mode is checked.
        if (accessibilityMode) {
            applyAccessibilityStylesToPopup(currentProfile);
        } else {
            applyAccessibilityStylesToPopup(null); 
        }
    } catch (error) {
        console.error('Failed to load profile from backend:', error);
        applyAccessibilityStylesToPopup(null); 
    }
}

// CRITICAL FIX: Function to apply/remove accessibility styles locally in the popup
function applyAccessibilityStylesToPopup(profileName) {
    const body = document.body;
    
    // 1. Reset all styles first
    body.style.fontFamily = ''; 
    body.style.lineHeight = '';
    body.style.letterSpacing = '';
    
    // 2. Clear all conflicting classes (optional, but good practice)
    body.classList.remove('accessibility-dyslexia', 'accessibility-adhd', 'accessibility-visual_impairment', 'accessibility-non_native');

    if (profileName === 'dyslexia') {
        // If Dyslexia is enabled, apply the custom font to the popup body.
        body.style.fontFamily = "'OpenDyslexic', 'Comic Sans MS', sans-serif";
    }
}

// ============================================
// TUTORIAL INTEGRATION
// ============================================

/**
 * Check if tutorial should be shown and display it if needed
 */
async function showTutorialIfNeeded() {
    try {
        const result = await chrome.storage.local.get(['tutorialCompleted', 'userId']);
        
        // Show tutorial if:
        // 1. User is logged in (has userId)
        // 2. Tutorial hasn't been completed yet
        const shouldShow = result.userId && result.userId !== 'anonymous' && !result.tutorialCompleted;
        
        if (shouldShow) {
            // Small delay to let the UI settle
            setTimeout(() => {
                openTutorial();
            }, 1000);
        }
    } catch (error) {
        console.error('Error checking tutorial status:', error);
    }
}

/**
 * Open tutorial in a new window
 */
function openTutorial() {
    try {
        const tutorialUrl = chrome.runtime.getURL('tutorial.html');
        const tutorialWindow = window.open(tutorialUrl, 'tutorial', 'width=900,height=700,scrollbars=yes,resizable=yes');
        
        if (tutorialWindow) {
            // Listen for tutorial completion
            const messageListener = (event) => {
                if (event.data && event.data.type === 'TUTORIAL_COMPLETED') {
                    window.removeEventListener('message', messageListener);
                    tutorialWindow.close();
                    
                    // Show a welcome message
                    setStatus('🎉 Tutorial completed! You\'re ready to use ChromeAI Plus!', 'success');
                }
            };
            
            window.addEventListener('message', messageListener);
            
            // Show status message
            setStatus('📚 Opening tutorial to help you get started...', 'info');
        } else {
            // Fallback: show tutorial in current window
            showTutorialFallback();
        }
    } catch (error) {
        console.error('Error opening tutorial:', error);
        showTutorialFallback();
    }
}

/**
 * Fallback tutorial display (if popup blocker prevents new window)
 */
function showTutorialFallback() {
    setStatus('📚 Welcome! Click "Show Tutorial" below to learn about ChromeAI Plus features.', 'info');
    
    // Add a tutorial button to the main content
    const tutorialBtn = document.createElement('button');
    tutorialBtn.id = 'show-tutorial-btn';
    tutorialBtn.innerHTML = '📚 Show Tutorial';
    tutorialBtn.style.cssText = `
        width: 100%;
        padding: 12px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        margin-top: 10px;
        font-size: 14px;
    `;
    
    tutorialBtn.addEventListener('click', () => {
        // Try to open tutorial again
        openTutorial();
    });
    
    // Insert tutorial button after the features section
    const featuresSection = document.querySelector('.features-section');
    if (featuresSection) {
        featuresSection.parentNode.insertBefore(tutorialBtn, featuresSection.nextSibling);
    }
}

/**
 * Reset tutorial (for testing purposes)
 */
async function resetTutorial() {
    try {
        await chrome.storage.local.remove(['tutorialCompleted', 'tutorialSkipped', 'tutorialCompletedAt']);
        setStatus('Tutorial reset. It will show on next login.', 'info');
    } catch (error) {
        console.error('Error resetting tutorial:', error);
        setStatus('Error resetting tutorial.', 'error');
    }
}

// Add tutorial reset function to global scope for testing
window.resetTutorial = resetTutorial;