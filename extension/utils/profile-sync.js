window.profileSync = {
    async saveProfile(userId, profile) {
        try {
            await chrome.storage.local.set({
                accessibilityProfile: profile,
                lastUpdated: Date.now()
            });
            
            await fetch('http://localhost:5000/api/accessibility/profile/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, profile })
            });
            
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    
    async loadProfile(userId) {
        try {
            const local = await chrome.storage.local.get(['accessibilityProfile']);
            if (local.accessibilityProfile) {
                return { success: true, profile: local.accessibilityProfile };
            }
            
            const response = await fetch(`http://localhost:5000/api/accessibility/profile/get/${userId}`);
            const data = await response.json();
            
            if (data.success) {
                await chrome.storage.local.set({ accessibilityProfile: data.profile });
                return { success: true, profile: data.profile };
            }
            
            return { success: false };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};
