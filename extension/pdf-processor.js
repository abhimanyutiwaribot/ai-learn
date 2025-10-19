// PDF Processor - Handles PDF-specific operations
window.pdfProcessor = {
    extractText: function() {
        const textLayers = document.querySelectorAll('.textLayer');
        let text = '';
        textLayers.forEach(layer => {
            text += layer.textContent + '\n';
        });
        return text;
    }
};