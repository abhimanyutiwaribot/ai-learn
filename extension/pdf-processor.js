// PDF Processor - Handles PDF-specific operations
window.pdfProcessor = {
    extractText: function() {
        // Try multiple PDF viewer selectors
        const textLayers = document.querySelectorAll('.textLayer, .pdf-text-layer, .pdfViewer');
        let text = '';
        
        if (textLayers.length > 0) {
            textLayers.forEach(layer => {
                // Get all text spans within the layer
                const textElements = layer.querySelectorAll('span');
                textElements.forEach(span => {
                    text += span.textContent + ' ';
                });
                text += '\n\n'; // Add paragraph breaks between layers
            });
        } else {
            // Fallback: Try direct page content
            const pages = document.querySelectorAll('.page');
            pages.forEach(page => {
                text += page.textContent + '\n\n';
            });
        }
        
        // Clean the extracted text
        return text
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n\n')
            .trim();
    },

    isPDF: function() {
        return (
            window.location.pathname.endsWith('.pdf') ||
            document.querySelector('.textLayer, .pdf-text-layer, .pdfViewer') !== null ||
            document.querySelector('embed[type="application/pdf"]') !== null
        );
    },

    waitForPDFLoad: async function() {
        return new Promise((resolve) => {
            const maxAttempts = 20;
            let attempts = 0;
            
            const checkPDF = setInterval(() => {
                const textLayers = document.querySelectorAll('.textLayer, .pdf-text-layer, .pdfViewer');
                attempts++;
                
                if (textLayers.length > 0 || attempts >= maxAttempts) {
                    clearInterval(checkPDF);
                    resolve(textLayers.length > 0);
                }
            }, 500); // Check every 500ms
        });
    }
};