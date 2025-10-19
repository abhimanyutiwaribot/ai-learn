// Backend configuration
const BACKEND_CONFIG = {
    URL: 'http://localhost:5000',
    TIMEOUT: 2000
};

// Feature configuration
const FEATURE_CONFIG = {
    RETRY_DELAY: 500,
    MAX_RETRIES: 2
};

// Export configurations
window.CHROMEAI_CONFIG = {
    BACKEND: BACKEND_CONFIG,
    FEATURES: FEATURE_CONFIG
};
