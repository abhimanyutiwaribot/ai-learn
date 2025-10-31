# AI-Learn: AI-Powered Smart Assistant (Technical README)

## 🎯 Project Goal

AI Learn: Personalized Accessibility. Powered by Hybrid AI, we adapt the entire web—text, PDFs, and images—to fit every learner.

---
## ☁ Hybrid AI Architecture (Technical Deep Dive)

The application is engineered for speed, reliability, and data privacy by prioritizing local processing where possible:

1.  *On-Device (Gemini Nano)*: Core generative features (Prompt, Proofreader, Summarizer, Translator) utilize the Chrome languageModel API to attempt Gemini Nano execution first. This offers near-instant, private processing for short content.
2.  *Cloud Fallback (Gemini)*: If the on-device model is unavailable, the prompt exceeds the local limit, or the task is inherently multimodal, the request seamlessly falls back to the remote Python/Flask backend using Gemini.

### Technical Stack

* Frontend (Chrome Extension): HTML5, CSS3, Vanilla JavaScript (ES6+), leveraging Chrome APIs (chrome.tabs, chrome.storage, chrome.sidePanel).
* Backend (API): Python / Flask.
* AI SDKs: google-generativeai (Python) and Chrome's native LanguageModel API (JavaScript).
* Data Persistence: MongoDB Atlas for user authentication and usage analytics/insights.
* Document Processing: PyPDF2 and python-docx for robust text extraction from uploaded files.

---
## 🔑 Detailed Feature Breakdown: Mechanism & Operation

### Authentication & Account

The extension supports three access methods: Login/Register (backed by MongoDB), Logout, and a *Guest Option* for local-only profile-persistance.

### ✨ Accessibility & Focus

| Feature | Mechanism & Execution Flow | Conceptual Source |
| :--- | :--- | :--- |
| Dark Mode | Toggles a dedicated dark theme for the side panel interface. | Frontend Logic |
| Accessibility Mode | Activates specialized reading profiles by applying the corresponding CSS class (.accessibility-dyslexia, .accessibility-adhd, etc.) to the webpage's root <html> element. | Frontend Logic |
| Profile Selection | Allows choice between Dyslexia Support, *ADHD Focus, and **Visual Support* profiles, each with distinct CSS rules for layout, spacing, and font. | Accessibility Styles |
| ADHD Reading Line | When the ADHD profile is active, a fixed div element is dynamically controlled by a mousemove event listener to track the user's cursor position on the screen. | Frontend Logic |

### 🧠 AI & Multimodal Tools

| Feature | Mechanism & Execution Flow | Conceptual Source |
| :--- | :--- | :--- |
| Prompt API | Operates on a Hybrid (Nano-First) model: attempts local execution first, then falls back to the Flask backend for cloud processing. | Hybrid Architecture |
| Proofreader/Summarizer/Translator | All core linguistic features operate via the Hybrid (Nano-First) execution model. | Hybrid Architecture |
| Screenshot AI | Captures the visible tab using a background service. The base64 image and the query ("What would you like to know about this screenshot?") are sent to the Flask backend for Gemini Vision analysis. The "Analyze with AI" button triggers the processing. | Backend Logic |
| OCR Translate | Supports two inputs: Take Screenshot or Upload Image. The base64 image is sent to the backend where *Gemini Vision* extracts the text and translates it to the user-selected language (e.g., English to French). | Backend Logic |
| Simplify Text | Simplifies selected text directly through the Hybrid Architecture. | Backend Logic (Skips local) |
| Simplify Web | Extracts the full page content via DOM traversal. The AI rewrites the content. The original HTML is cached in the content script, allowing the simplified content to replace the original page. A "Restore Original Page" button re-injects the cached HTML. | Frontend Logic & Backend Logic |
| Voice Reader | Uses the browser's native SpeechSynthesis API. It dynamically detects the language and allows reading of the selected text or the whole page (chunked for long documents). Provides multiple voice, pitch, and speed controls. | Voice Reader Logic (TTS) |
| Insights | Queries the backend for user analytics. The backend fetches usage logs from MongoDB and sends them to Gemini for personalized insights generation. | Backend Logic |
| Document AI | Uploaded PDF or Word (.docx) files are processed. Python libraries (PyPDF2, python-docx) extract the raw text, which is then submitted to Gemini for Summarize, *Proofread, or **Both* actions. | Backend Logic |

---
## 🛠 Installation and Setup

### 1. Backend Setup

The backend serves the multimodal and large-content AI requests.

1.  Clone the repository.
2.  Navigate to the backend directory.
3.  Install dependencies:

    bash

    pip install -r requirements.txt
    
5.  Configure environment variables:
    * Create a .env file in the backend folder.
    * Add your Google AI API Key and MongoDB URI (for persistence and analytics):

 
# .env


GOOGLE_AI_API_KEY=your_actual_gemini_api_key_here


MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/chromeai_plus?retryWrites=true&w=majority


FLASK_ENV=development
FLASK_DEBUG=True
PORT=5000
HOST=0.0.0.0





        
6.  Run the Flask application:
   
    bash
    
    python app.py
    
    The server should be running on http://127.0.0.1:5000/.







### 2. Extension Installation (Developer Mode)

1.  Open Google Chrome.
2.  *Navigate to chrome://extensions.*
3.  Enable "*Developer mode*" in the top right corner.
4.  Click "*Load unpacked*".
5.  *Select the Ai-learn/extension folder.*
6.  The AI-Learn icon will appear in your toolbar. You can pin it for easy access.

### 2.5. Flags for Gemini Nano (Hybrid AI) ⚙

To enable the *Hybrid AI Architecture* to execute *Gemini Nano* locally on your device for testing, you must enable the following experimental flags in Chrome (version 141-145 recommended):

1.  Navigate to chrome://flags.
2.  Search for optimization guide on device model and set it to **Enabled BypassPerfRequirement** (or just Enabled).
3.  Search for Prompt API for gemini nano and set it to **Enabled**.
4.  Search for Summarization API for Gemini Nano and set it to **Enabled**
5.  Search for Proofreader API for Gemini Nano and set it to **Enabled**
6.  Click the "*Relaunch*" button to apply the changes.
7.  Go to new Tab Press F12 or Ctrl+Shift+J (Windows/Linux) or Cmd+Option+J (Mac) to open DevTools
8.  Go to the Console tab
9.  // Check if LanguageModel API is available

      await LanguageModel.availability();

10. If "available" Restart Chrome and you are ready to go

11. If "downloadable" Run this command

     await LanguageModel.create();

13. Wait For Few min Gemini Nano model should be downloaded

> *Note:* You can check the download status at chrome://on-device-internals.

---
## 3. Testing the Extension (Local & Hybrid Features)

To ensure the extension is working correctly, test the following core functionalities:

### A. Hybrid AI Functionality (Nano-First with Cloud Fallback)

1.  *Preparation*: Navigate to any webpage with text (e.g., a Wikipedia article).
2.  *Test Local (Nano)*:
    * Open the side panel and go to the *Prompt API* feature.
    * Enter a *short prompt* (e.g., "What is Your Name?").
    * The response should appear and the backend log should *not* show a request, indicating successful *on-device* execution.
3.  *Test Cloud Fallback (Flash)*:
    * Select Some text in the webpage make sure the selected characters length is greater than 3001
    * Open the side panel and go to the *Summarizer* feature.
    * Click on *Selected text* option if the selected already does not appear or id it says refresh the page and repeat
    * Click on *Summerize* as selected text's character length *exceeds the Nano limit, the processing request will automatically be sent to your running **Flask backend* (http://127.0.0.1:5000/api/hybrid/simplify or /api/hybrid/prompt), and you should see an access log in your terminal.

### B. Multimodal AI Functionality (Requires Flask Backend)

1.  *Test Screenshot AI*:
    * Open the side panel and click *Screenshot AI*.
    * Click *Capture Screenshot*.
    * Enter a query (e.g., "Explain the content of this Image?").
    * Click *Analyze with AI* and confirm the result is returned by the backend (Gemini Vision).
2.  *Test Document AI*:
    * In the main side panel, scroll down to *Document AI Assistant*.
    * Upload a small PDF file (requires running Flask backend to handle file upload and PyPDF2/python-docx processing).
    * Select *Both*(Summarize and Proofread) and click *Process with AI*.
3.  *Test OCR Translate*:
    *toggle between *Upload image* *capture screenshot*
    * if *Upload image* selected then click on the upload image interface below and upload the image
    * if *capture screenshot* selected then click on capture screenshot option to get the screenshot of the visible screen
    * select the languague from drop down menu in which the content of the image/screenshot is to be translated in
    * click on *translate*
      

### C. Accessibility & Voice Functionality

1.  *Test Accessibility Profile Application*:
    * Open the side panel, enable the *Accessibility Mode* toggle.
    * Select the *Dyslexia* profile.
    * Verify that the current webpage instantly changes its font, line height, and spacing.
2.  *Test ADHD Reading Line*:
    * Select the *ADHD Focus* profile.
    * Toggle the *ADHD Reading Line* on in the Quick Toggles section.
    * Move your mouse over the webpage and confirm a horizontal *blue reading line* tracks your cursor.
3.  *Test Voice Reader*:
    * Open the side panel and click the *Voice Reader* feature.
    * Select a block of text on the webpage.
    * Click *Start Reading* and confirm the browser's native Text-to-Speech (TTS) engine begins reading the selected content.