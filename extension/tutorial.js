// ChromeAI Plus Tutorial JavaScript
class TutorialManager {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 8;
        this.isActive = false;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.updateProgress();
        this.showStep(1);
    }
    
    setupEventListeners() {
        // Navigation buttons
        document.getElementById('next-step').addEventListener('click', () => this.nextStep());
        document.getElementById('prev-step').addEventListener('click', () => this.prevStep());
        document.getElementById('skip-tutorial').addEventListener('click', () => this.skipTutorial());
        document.getElementById('start-using').addEventListener('click', () => this.completeTutorial());
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (!this.isActive) return;
            
            switch(e.key) {
                case 'ArrowRight':
                case ' ':
                    e.preventDefault();
                    if (this.currentStep < this.totalSteps) {
                        this.nextStep();
                    } else {
                        this.completeTutorial();
                    }
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (this.currentStep > 1) {
                        this.prevStep();
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    this.skipTutorial();
                    break;
            }
        });
        
        // Close on overlay click
        document.getElementById('tutorial-overlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.skipTutorial();
            }
        });
    }
    
    showStep(stepNumber) {
        // Hide all steps
        document.querySelectorAll('.tutorial-step').forEach(step => {
            step.classList.remove('active');
        });
        
        // Show current step
        const currentStepElement = document.getElementById(`step-${stepNumber}`);
        if (currentStepElement) {
            currentStepElement.classList.add('active');
        }
        
        // Update navigation buttons
        this.updateNavigation();
        this.updateProgress();
        
        // Add step-specific animations
        this.addStepAnimations(stepNumber);
    }
    
    nextStep() {
        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
            this.showStep(this.currentStep);
        }
    }
    
    prevStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.showStep(this.currentStep);
        }
    }
    
    updateNavigation() {
        const prevBtn = document.getElementById('prev-step');
        const nextBtn = document.getElementById('next-step');
        const startBtn = document.getElementById('start-using');
        
        // Show/hide previous button
        if (this.currentStep === 1) {
            prevBtn.style.display = 'none';
        } else {
            prevBtn.style.display = 'inline-block';
        }
        
        // Show/hide next/start buttons
        if (this.currentStep === this.totalSteps) {
            nextBtn.style.display = 'none';
            startBtn.style.display = 'inline-block';
        } else {
            nextBtn.style.display = 'inline-block';
            startBtn.style.display = 'none';
        }
    }
    
    updateProgress() {
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        
        const percentage = (this.currentStep / this.totalSteps) * 100;
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `Step ${this.currentStep} of ${this.totalSteps}`;
    }
    
    addStepAnimations(stepNumber) {
        // Add entrance animations for step elements
        const stepElement = document.getElementById(`step-${stepNumber}`);
        if (!stepElement) return;
        
        // Animate cards and elements
        const cards = stepElement.querySelectorAll('.profile-card, .feature-card, .advanced-card, .usage-step, .setting-item, .pdf-feature, .tip-item');
        cards.forEach((card, index) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            
            setTimeout(() => {
                card.style.transition = 'all 0.5s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, index * 100);
        });
        
        // Animate preview items
        const previewItems = stepElement.querySelectorAll('.preview-item');
        previewItems.forEach((item, index) => {
            item.style.opacity = '0';
            item.style.transform = 'scale(0.8)';
            
            setTimeout(() => {
                item.style.transition = 'all 0.4s ease';
                item.style.opacity = '1';
                item.style.transform = 'scale(1)';
            }, index * 150);
        });
    }
    
    skipTutorial() {
        this.completeTutorial(true);
    }
    
    async completeTutorial(skipped = false) {
        try {
            // Mark tutorial as completed in storage
            await chrome.storage.local.set({
                tutorialCompleted: true,
                tutorialSkipped: skipped,
                tutorialCompletedAt: new Date().toISOString()
            });
            
            // Close tutorial
            this.closeTutorial();
            
            // Show completion message
            if (!skipped) {
                this.showCompletionMessage();
            }
            
        } catch (error) {
            console.error('Error completing tutorial:', error);
            this.closeTutorial();
        }
    }
    
    closeTutorial() {
        const overlay = document.getElementById('tutorial-overlay');
        if (overlay) {
            overlay.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(() => {
                overlay.remove();
                this.isActive = false;
                
                // Notify parent window that tutorial is complete
                if (window.opener) {
                    window.opener.postMessage({ type: 'TUTORIAL_COMPLETED' }, '*');
                }
            }, 300);
        }
    }
    
    showCompletionMessage() {
        // Create a temporary success message
        const message = document.createElement('div');
        message.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
            color: white;
            padding: 20px 30px;
            border-radius: 12px;
            box-shadow: 0 8px 25px rgba(76, 175, 80, 0.3);
            z-index: 10001;
            font-weight: 600;
            animation: slideInRight 0.5s ease-out;
        `;
        message.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 24px;">🎉</span>
                <span>Tutorial completed! Welcome to ChromeAI Plus!</span>
            </div>
        `;
        
        document.body.appendChild(message);
        
        // Remove message after 3 seconds
        setTimeout(() => {
            message.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => message.remove(), 300);
        }, 3000);
    }
    
    // Public method to show tutorial
    show() {
        this.isActive = true;
        document.getElementById('tutorial-overlay').style.display = 'flex';
    }
    
    // Public method to hide tutorial
    hide() {
        this.isActive = false;
        document.getElementById('tutorial-overlay').style.display = 'none';
    }
}

// Initialize tutorial when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.tutorialManager = new TutorialManager();
    
    // Add CSS animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
        
        @keyframes slideInRight {
            from {
                opacity: 0;
                transform: translateX(100px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }
        
        @keyframes slideOutRight {
            from {
                opacity: 1;
                transform: translateX(0);
            }
            to {
                opacity: 0;
                transform: translateX(100px);
            }
        }
    `;
    document.head.appendChild(style);
});

// Utility functions for tutorial integration
window.TutorialUtils = {
    // Check if tutorial should be shown
    async shouldShowTutorial() {
        try {
            const result = await chrome.storage.local.get(['tutorialCompleted', 'userId']);
            
            // Show tutorial if:
            // 1. User is logged in (has userId)
            // 2. Tutorial hasn't been completed yet
            return result.userId && result.userId !== 'anonymous' && !result.tutorialCompleted;
        } catch (error) {
            console.error('Error checking tutorial status:', error);
            return false;
        }
    },
    
    // Mark tutorial as completed
    async markTutorialCompleted(skipped = false) {
        try {
            await chrome.storage.local.set({
                tutorialCompleted: true,
                tutorialSkipped: skipped,
                tutorialCompletedAt: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error marking tutorial as completed:', error);
        }
    },
    
    // Reset tutorial (for testing or re-showing)
    async resetTutorial() {
        try {
            await chrome.storage.local.remove(['tutorialCompleted', 'tutorialSkipped', 'tutorialCompletedAt']);
        } catch (error) {
            console.error('Error resetting tutorial:', error);
        }
    },
    
    // Open tutorial in new window
    openTutorial() {
        const tutorialUrl = chrome.runtime.getURL('tutorial.html');
        const tutorialWindow = window.open(tutorialUrl, 'tutorial', 'width=900,height=700,scrollbars=yes,resizable=yes');
        
        if (tutorialWindow) {
            // Listen for tutorial completion
            const messageListener = (event) => {
                if (event.data && event.data.type === 'TUTORIAL_COMPLETED') {
                    window.removeEventListener('message', messageListener);
                    tutorialWindow.close();
                }
            };
            
            window.addEventListener('message', messageListener);
        }
        
        return tutorialWindow;
    }
};
