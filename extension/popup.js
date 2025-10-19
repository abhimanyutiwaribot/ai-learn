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
            setStatus('✅ Profile saved: ' + profile, 'success');
        });
    });
    
    // Feature buttons
    document.getElementById('prompt-btn').addEventListener('click', () => activateFeature('PROMPT'));
    document.getElementById('proofread-btn').addEventListener('click', () => activateFeature('PROOFREADER'));
    document.getElementById('summarize-btn').addEventListener('click', () => activateFeature('SUMMARIZER'));
    document.getElementById('translate-btn').addEventListener('click', () => activateFeature('TRANSLATOR'));
    document.getElementById('screenshot-btn').addEventListener('click', () => activateFeature('SCREENSHOT'));
    document.getElementById('ocr-translate-btn').addEventListener('click', () => activateFeature('OCR_TRANSLATE'));
    document.getElementById('simplify-btn').addEventListener('click', () => activateFeature('SIMPLIFY'));
    document.getElementById('voice-reader-btn').addEventListener('click', () => activateFeature('VOICE_READER'));
    document.getElementById('focus-mode-btn').addEventListener('click', () => activateFeature('FOCUS_MODE'));
    document.getElementById('insights-btn').addEventListener('click', () => showInsights());
    
    // Settings
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

async function sendMessageToTab(tabId, message) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Message timeout'));
        }, 5000);

        chrome.tabs.sendMessage(tabId, message, (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(response);
            }
        });
    });
}

async function ensureContentScriptInjected(tabId) {
    try {
        // First try to ping existing content script
        await chrome.tabs.sendMessage(tabId, { type: 'PING' });
        return true; // Content script exists and responded
    } catch (error) {
        console.log('🔄 Content script not found, injecting...');
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: [
                    'config.js',
                    'utils/wcag-checker.js',
                    'utils/profile-sync.js',
                    'accessibility-engine.js',
                    'reading-assistant.js',
                    'voice-reader.js',
                    'content.js'
                ]
            });
            
            // Wait for content script to initialize
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Verify injection
            await chrome.tabs.sendMessage(tabId, { type: 'PING' });
            return true;
        } catch (injectionError) {
            console.error('❌ Script injection failed:', injectionError);
            return false;
        }
    }
}

async function activateFeature(feature) {
    console.log('🎯 Activating feature:', feature);
    setStatus(`Activating ${feature}...`, 'info');
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
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
            
            chrome.tabs.sendMessage(tab.id, {
                type: 'SHOW_INSIGHTS',
                insights: data.insights,
                sessionCount: data.session_count
            }, (response) => {
                if (chrome.runtime.lastError) {
                    // Try to inject and retry
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content.js']
                    }).then(() => {
                        setTimeout(() => {
                            chrome.tabs.sendMessage(tab.id, {
                                type: 'SHOW_INSIGHTS',
                                insights: data.insights,
                                sessionCount: data.session_count
                            });
                        }, 500);
                    });
                }
            });
            
            setStatus('✅ Insights loaded', 'success');
        } else {
            setStatus('❌ No insights available', 'error');
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
            }
        });
    } else {
        profileEl.style.display = 'none';
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