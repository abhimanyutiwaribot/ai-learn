const BACKEND_URL = "https://ai-learn-2i3f.onrender.com/"

window.profileSync = {
    async saveProfile(userId, profile) {
        try {
            await chrome.storage.local.set({
                accessibilityProfile: profile,
                lastUpdated: Date.now()
            });
            
            // Removed: Remote persistence call for privacy
            
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
            
            // Removed: Remote retrieval call for privacy
            
            return { success: false };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};