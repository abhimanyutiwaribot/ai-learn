// Google Docs Adapter
window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    
    if (event.data.type === 'TRANSLATE_GOOGLE_DOCS' || event.data.type === 'PROOFREAD_GOOGLE_DOCS') {
        const paragraphs = document.querySelectorAll('.kix-paragraphrenderer');
        let fullText = '';
        paragraphs.forEach(para => {
            fullText += para.textContent + '\n';
        });
        
        console.log('Google Docs content extracted:', fullText.length, 'characters');
    }
});