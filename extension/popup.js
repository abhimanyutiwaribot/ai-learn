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
    
    if (!result.userId) {
        userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        await chrome.storage.local.set({ userId });
    } else {
        userId = result.userId;
    }
    
    if (result.accessibilityProfile) {
        currentProfile = result.accessibilityProfile;
        accessibilityMode = true;
        document.getElementById('accessibility-mode-toggle').checked = true;
        document.getElementById('profile-section').style.display = 'block';
        updateCurrentProfile();
    }
    
    if (result.settings) {
        applySettings(result.settings);
    }
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

function setupEventListeners() {
    document.getElementById('accessibility-mode-toggle').addEventListener('change', (e) => {
        accessibilityMode = e.target.checked;
        document.getElementById('profile-section').style.display = accessibilityMode ? 'block' : 'none';
        if (!accessibilityMode) {
            currentProfile = null;
            updateCurrentProfile();
        }
    });
    
    document.querySelectorAll('.profile-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const profile = btn.dataset.profile;
            currentProfile = profile;
            
            document.querySelectorAll('.profile-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            updateCurrentProfile();
            await chrome.storage.local.set({ accessibilityProfile: profile });
            await saveProfileToBackend(profile);
            setStatus('Profile saved: ' + profile, 'success');
        });
    });
    
    document.getElementById('prompt-btn').addEventListener('click', () => activateFeature('PROMPT'));
    document.getElementById('proofread-btn').addEventListener('click', () => activateFeature('PROOFREAD'));
    document.getElementById('summarize-btn').addEventListener('click', () => activateFeature('SUMMARIZE'));
    document.getElementById('translate-btn').addEventListener('click', () => activateFeature('TRANSLATE'));
    document.getElementById('screenshot-btn').addEventListener('click', () => activateFeature('SCREENSHOT'));
    document.getElementById('ocr-translate-btn').addEventListener('click', () => activateFeature('OCR_TRANSLATE'));
    document.getElementById('simplify-btn').addEventListener('click', () => activateFeature('SIMPLIFY'));
    document.getElementById('voice-reader-btn').addEventListener('click', () => activateFeature('VOICE_READER'));
    document.getElementById('focus-mode-btn').addEventListener('click', () => activateFeature('FOCUS_MODE'));
    document.getElementById('insights-btn').addEventListener('click', () => showInsights());
    
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

async function activateFeature(feature) {
    setStatus(`Activating ${feature}...`, 'success');
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: sendMessageToContent,
            args: [feature, { profile: currentProfile, accessibilityMode }]
        });
        
        logFeatureUsage(feature);
        window.close();
    } catch (error) {
        setStatus('Error: ' + error.message, 'error');
    }
}

function sendMessageToContent(feature, data) {
    window.postMessage({ type: `ACTIVATE_${feature}`, data }, '*');
}

async function showInsights() {
    try {
        setStatus('Loading insights...', 'success');
        
        const response = await fetch(`${BACKEND_URL}/api/analytics/insights/${userId}`);
        const data = await response.json();
        
        if (data.success) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: displayInsights,
                args: [data.insights, data.session_count]
            });
            
            window.close();
        } else {
            setStatus('Failed to load insights', 'error');
        }
    } catch (error) {
        setStatus('Error: ' + error.message, 'error');
    }
}

function displayInsights(insights, sessionCount) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 60px;
        right: 20px;
        width: 400px;
        max-height: 500px;
        background: white;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        z-index: 999999;
        padding: 24px;
        overflow-y: auto;
        font-family: Arial, sans-serif;
    `;
    
    overlay.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 16px;">
            <h3 style="margin: 0; color: #667eea;">📊 Your Learning Insights</h3>
            <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; font-size: 24px; cursor: pointer;">×</button>
        </div>
        <div style="margin-bottom: 12px; padding: 12px; background: #e8f5e9; border-radius: 8px;">
            <strong>Total Sessions:</strong> ${sessionCount}
        </div>
        <div style="white-space: pre-wrap; line-height: 1.6;">${insights}</div>
    `;
    
    document.body.appendChild(overlay);
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
            }
        });
    } else {
        profileEl.style.display = 'none';
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
