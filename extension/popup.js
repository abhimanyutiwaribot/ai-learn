let currentProfile = null;
let accessibilityMode = false;
let userId = null; 

document.addEventListener('DOMContentLoaded', async () => {
    await loadUserSettings();
    setupEventListeners();
    checkBackendStatus();
});

async function checkBackendStatus() {
    try {
        const response = await fetch(`${window.CHROMEAI_CONFIG.BACKEND.URL}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(window.CHROMEAI_CONFIG.BACKEND.TIMEOUT)
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.gemini_enabled && data.mongodb_enabled) {
                setStatus('✅ All systems ready', 'success');
            } else if (data.gemini_enabled) {
                setStatus('✅ Backend ready (no MongoDB)', 'success');
            } else {
                setStatus('⚠️ Backend running (no Gemini API)', 'warning');
            }
        } else {
            setStatus(`⚠️ Backend error: ${response.status}`, 'warning');
        }
    } catch (error) {
        if (error.name === 'TimeoutError') {
            setStatus('⚠️ Backend timeout - service may be slow', 'warning');
        } else if (error.name === 'AbortError') {
            setStatus('⚠️ Request aborted - please try again', 'warning');
        } else {
            setStatus('⚠️ Backend offline - limited features', 'warning');
        }
        console.error('Backend check error:', error);
    }
}

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
    document.getElementById('proofread-btn').addEventListener('click', () => activateFeature('PROOFREADER'));
    document.getElementById('summarize-btn').addEventListener('click', () => activateFeature('SUMMARIZER'));
    document.getElementById('translate-btn').addEventListener('click', () => activateFeature('TRANSLATOR'));
    document.getElementById('screenshot-btn').addEventListener('click', () => activateFeature('SCREENSHOT'));
    document.getElementById('ocr-translate-btn').addEventListener('click', () => activateFeature('OCR_TRANSLATE'));
    document.getElementById('simplify-btn').addEventListener('click', () => activateFeature('SIMPLIFY'));
    document.getElementById('voice-reader-btn').addEventListener('click', () => activateFeature('VOICE_READER'));
    // Removed: document.getElementById('focus-mode-btn').addEventListener('click', () => activateFeature('FOCUS_MODE'));
    document.getElementById('insights-btn').addEventListener('click', () => showInsights());
    
    // --- Quick Settings Listeners (Unchanged) ---
    document.getElementById('dyslexia-font').addEventListener('change', (e) => {
        updateSettings({ dyslexiaFont: e.target.checked });
    });
    document.getElementById('high-contrast').addEventListener('change', (e) => {
        updateSettings({ highContrast: e.target.checked });
    });
    document.getElementById('reduce-motion').addEventListener('change', (e) => {
        updateSettings({ reduceMotion: e.target.checked });
    });
    document.getElementById('text-size').addEventListener('input', (e) => {
        const size = e.target.value;
        document.getElementById('text-size-value').textContent = size + 'px';
        updateSettings({ textSize: size });
    });
}

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
    console.log('🎯 Activating feature:', feature);
    setStatus(`Activating ${feature}...`, 'info');
    
    try {
        await chrome.tabs.sendMessage(tab.id, {
            type: `ACTIVATE_${feature}`,
            data: { profile: currentProfile, accessibilityMode, userId }
        });
        
        if (!tab?.id) {
            throw new Error('No active tab found');
        }
        
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
            setStatus('❌ Cannot run on Chrome system pages', 'error');
            return;
        }

        // Ensure content script is injected
        const isInjected = await ensureContentScriptInjected(tab.id);
        if (!isInjected) {
            throw new Error('Failed to inject content script');
        }

        const message = {
            type: `ACTIVATE_${feature}`,
            data: {
                profile: currentProfile,
                accessibilityMode: accessibilityMode,
                userId: userId
            }
        };

        // Send message with retry
        let retries = 2;
        while (retries > 0) {
            try {
                const response = await sendMessageToTab(tab.id, message);
                console.log('✅ Feature activated:', response);
                setStatus('✅ Feature activated!', 'success');
                return;
            } catch (error) {
                retries--;
                if (retries === 0) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    } catch (error) {
        console.error('❌ Activation error:', error);
        setStatus('❌ Error: ' + (error.message || 'Failed to communicate with page'), 'error');
    }
}

async function showInsights() {
    try {
        setStatus('Loading insights...', 'info');
        
        const response = await fetch(`${window.CHROMEAI_CONFIG.BACKEND.URL}/api/analytics/insights/${userId}`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
        });
        
        if (!response.ok) {
            throw new Error('Backend not available');
        }
        
        const data = await response.json();
        
        if (data.success) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // FIX: Use sendMessage to send data to the content script for display
            await chrome.tabs.sendMessage(tab.id, {
                type: 'SHOW_INSIGHTS', // The content script is already listening for this
                insights: data.insights,
                sessionCount: data.session_count
            });
            
            setStatus('✅ Insights loaded', 'success');
        } else {
            setStatus('Failed to load insights: ' + (data.error || 'Unknown error from backend'), 'error');
        }
    } catch (error) {
        setStatus('❌ Backend required for insights', 'error');
        console.error('Insights error:', error);
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
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: applySettingsToContent,
            args: [settings]
        });
    } catch (e) {
        console.log('Settings will apply on next page load');
    }
}

function applySettingsToContent(settings) {
    if (settings.dyslexiaFont) {
        document.body.style.fontFamily = 'OpenDyslexic, "Comic Sans MS", sans-serif';
    }
    if (settings.textSize) {
        document.body.style.fontSize = settings.textSize + 'px';
    }
    if (settings.highContrast) {
        document.body.style.filter = 'contrast(1.5)';
    }
}

function setStatus(message, type = '') {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;
    
    if (type && type !== 'info') {
        setTimeout(() => {
            statusEl.textContent = '';
            statusEl.className = 'status';
        }, 4000);
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