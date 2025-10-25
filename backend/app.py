from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from werkzeug.utils import secure_filename
import PyPDF2
import openai
from dotenv import load_dotenv
import google.generativeai as genai
from pymongo import MongoClient
from datetime import datetime
import json
import base64
from PIL import Image
import io
from docx import Document

# CRITICAL FIX: Removed all APIError imports. General exceptions will be used.

load_dotenv()
OPENAI_KEY = os.getenv("OPENAI_API_KEY")

app = Flask(__name__)
CORS(app)

# simple request logger to debug 404s from the extension
@app.before_request
def _log_request():
    try:
        print(">>> Incoming request:", request.method, request.path, "from", request.remote_addr)
    except Exception:
        pass

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Configure Gemini API
GEMINI_API_KEY = os.getenv('GOOGLE_AI_API_KEY')
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    GEMINI_ENABLED = True
else:
    GEMINI_ENABLED = False
    print("Warning: Gemini API key not found")

# Initialize MongoDB Atlas
MONGODB_URI = os.getenv('MONGODB_URI')
MONGODB_ENABLED = False
db = None

if MONGODB_URI:
    try:
        client = MongoClient(MONGODB_URI)
        # Test connection
        client.admin.command('ping')
        db = client['chromeai_plus']  # Database name
        MONGODB_ENABLED = True
        print("✅ MongoDB Atlas connected successfully")
    except Exception as e:
        print(f"❌ MongoDB connection failed: {e}")
        MONGODB_ENABLED = False
        db = None
else:
    print("Warning: MongoDB URI not found. Profile sync and analytics will be disabled.")

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "healthy",
        "message": "ChromeAI Plus backend running",
        "gemini_enabled": GEMINI_ENABLED,
        "mongodb_enabled": MONGODB_ENABLED
    }), 200
    
# (In chromeai-plus/backend/app.py - Add after the /health route)

@app.route('/api/auth/register', methods=['POST'])
def register_user():
    try:
        if not MONGODB_ENABLED:
            return jsonify({"success": False, "error": "MongoDB not configured"}), 400
            
        data = request.json
        email = data.get('email').lower()
        password = data.get('password') 
        
        if not email or not password:
            return jsonify({"success": False, "error": "Email and password are required"}), 400

        # Check if user already exists
        if db.users.find_one({'email': email}):
            return jsonify({"success": False, "error": "User already exists. Please log in instead."}), 409
            
        # Register user (Note: Password hashing is recommended for production)
        db.users.insert_one({
            'email': email,
            'password': password, 
            'created_at': datetime.utcnow()
        })
        
        return jsonify({"success": True, "message": "User registered successfully", "userId": email}), 201
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/auth/login', methods=['POST'])
def login_user():
    try:
        if not MONGODB_ENABLED:
            return jsonify({"success": False, "error": "MongoDB not configured"}), 400
            
        data = request.json
        email = data.get('email').lower()
        password = data.get('password')
        
        if not email or not password:
            return jsonify({"success": False, "error": "Email and password are required"}), 400

        # Check user credentials
        user = db.users.find_one({'email': email, 'password': password})
        
        if user:
            return jsonify({"success": True, "message": "Login successful", "userId": email}), 200
        else:
            return jsonify({"success": False, "error": "Invalid email or password"}), 401
            
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ============================================
# MULTIMODAL AI
# ============================================

@app.route('/api/multimodal/analyze-image', methods=['POST'])
def analyze_image():
    """Analyze screenshots/images with multimodal Gemini"""
    try:
        if not GEMINI_ENABLED:
            return jsonify({"success": False, "error": "Gemini API not configured"}), 400
            
        data = request.json
        image_base64 = data.get('image')
        user_query = data.get('query', 'Analyze this image')
        accessibility_mode = data.get('accessibilityMode')
        
        # MODEL: gemini-2.5-flash (Updated from gemini-2.0-flash-exp)
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        if accessibility_mode:
            prompt = build_accessibility_prompt(user_query, accessibility_mode)
        else:
            prompt = user_query
        
        # Decode image
        image_data = base64.b64decode(image_base64.split(',')[1])
        image = Image.open(io.BytesIO(image_data))
        
        response = model.generate_content([prompt, image])
        
        # Log usage
        log_usage(data.get('userId', 'anonymous'), 'multimodal_image_analysis', {
            'query': user_query,
            'accessibility_mode': accessibility_mode
        })
        
        return jsonify({
            "success": True,
            "analysis": response.text,
            "source": "cloud-gemini-vision",
            "accessibility_mode": accessibility_mode
        }), 200
        
    except Exception as e:
        # Catching generic Exception covers all SDK errors without needing specific imports
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/multimodal/ocr-translate', methods=['POST'])
def ocr_translate():
    """Extract text from images and translate"""
    try:
        if not GEMINI_ENABLED:
            return jsonify({"success": False, "error": "Gemini API not configured"}), 400
            
        data = request.json
        image_base64 = data.get('image')
        target_language = data.get('targetLanguage', 'English')
        
        # MODEL: gemini-2.5-flash (Updated from gemini-2.0-flash-exp)
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        prompt = f"""
        Extract all text from this image and translate it to {target_language}.
        
        Format:
        ORIGINAL TEXT:
        [extracted text]
        
        TRANSLATION:
        [translated text]
        """
        
        image_data = base64.b64decode(image_base64.split(',')[1])
        image = Image.open(io.BytesIO(image_data))
        
        response = model.generate_content([prompt, image])
        
        log_usage(data.get('userId', 'anonymous'), 'ocr_translate')
        
        return jsonify({
            "success": True,
            "result": response.text,
            "source": "cloud-gemini-ocr"
        }), 200
        
    except Exception as e:
        # Catching generic Exception covers all SDK errors without needing specific imports
        return jsonify({"success": False, "error": str(e)}), 500

# ============================================
# HYBRID AI: On-Device + Cloud Fallback
# ============================================

@app.route('/api/hybrid/prompt', methods=['POST'])
def hybrid_prompt():
    """Handle prompts with hybrid on-device/cloud approach"""
    try:
        data = request.json
        prompt = data.get('prompt')
        use_cloud = data.get('useCloud', False)
        accessibility_mode = data.get('accessibilityMode')
        
        # Use cloud for long prompts or when explicitly requested
        if use_cloud or len(prompt) > 10000:
            if not GEMINI_ENABLED:
                return jsonify({
                    "success": False,
                    "error": "Cloud AI not available. Prompt too long for on-device processing."
                }), 400
            
            # MODEL: gemini-2.5-flash (Updated from gemini-2.0-flash-exp)
            model = genai.GenerativeModel('gemini-2.5-flash')
            
            if accessibility_mode:
                prompt = build_accessibility_prompt(prompt, accessibility_mode)
            
            response = model.generate_content(prompt)
            
            log_usage(data.get('userId', 'anonymous'), 'hybrid_prompt_cloud')
            
            return jsonify({
                "success": True,
                "response": response.text,
                "source": "cloud"
            }), 200
        else:
            # Instruct client to use on-device
            log_usage(data.get('userId', 'anonymous'), 'hybrid_prompt_ondevice')
            
            return jsonify({
                "success": True,
                "source": "on-device",
                "instruction": "use_prompt_api"
            }), 200
        
    except Exception as e:
        # Catching generic Exception covers all SDK errors without needing specific imports
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/hybrid/simplify', methods=['POST'])
def hybrid_simplify():
    """Simplify text with hybrid approach"""
    try:
        data = request.json
        text = data.get('text')
        use_cloud = data.get('useCloud', False)
        accessibility_mode = data.get('accessibilityMode')
        
        # Use cloud for long content
        if use_cloud or len(text) > 5000:
            if not GEMINI_ENABLED:
                return jsonify({
                    "success": False,
                    "error": "Cloud AI not available. Text too long for on-device processing."
                }), 400
            
            # MODEL: gemini-2.5-flash (Updated from gemini-pro)
            model = genai.GenerativeModel('gemini-2.5-flash')
            
            prompt = f"Simplify this text for someone with {accessibility_mode or 'general'} reading needs:\n\n{text}"
            
            if accessibility_mode == 'dyslexia':
                prompt += "\n\nUse short sentences, simple words, and bullet points."
            elif accessibility_mode == 'adhd':
                prompt += "\n\nUse concise chunks, numbered lists, and highlight key points."
            elif accessibility_mode == 'non_native':
                prompt += "\n\nUse simple vocabulary and define terms."
            
            response = model.generate_content(prompt)
            
            log_usage(data.get('userId', 'anonymous'), 'simplify_cloud')
            
            return jsonify({
                "success": True,
                "simplified": response.text,
                "source": "cloud"
            }), 200
        else:
            log_usage(data.get('userId', 'anonymous'), 'simplify_ondevice')
            
            return jsonify({
                "success": True,
                "source": "on-device"
            }), 200
        
    except Exception as e:
        # Catching generic Exception covers all SDK errors without needing specific imports
        return jsonify({"success": False, "error": str(e)}), 500

# ============================================
# LOGGING ENDPOINTS
# ============================================

@app.route('/api/proxy/proofread', methods=['POST'])
def proxy_proofread():
    try:
        data = request.json
        log_usage(data.get('userId', 'anonymous'), 'proofread', {
            'document_type': data.get('documentType'),
            'text_length': len(data.get('text', ''))
        })
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/proxy/summarize', methods=['POST'])
def proxy_summarize():
    try:
        data = request.json
        log_usage(data.get('userId', 'anonymous'), 'summarize', {
            'url': data.get('url'),
            'content_length': len(data.get('content', ''))
        })
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/proxy/translate', methods=['POST'])
def proxy_translate():
    try:
        data = request.json
        log_usage(data.get('userId', 'anonymous'), 'translate', {
            'source_lang': data.get('sourceLanguage'),
            'target_lang': data.get('targetLanguage')
        })
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ============================================
# ACCESSIBILITY PROFILE MANAGEMENT (MongoDB)
# ============================================

@app.route('/api/accessibility/profile/save', methods=['POST'])
def save_profile():
    """Save user accessibility profile to MongoDB"""
    try:
        if not MONGODB_ENABLED:
            return jsonify({"success": False, "error": "MongoDB not configured"}), 400
            
        data = request.json
        user_id = data.get('userId')
        profile = data.get('profile')
        
        # Upsert profile
        db.accessibility_profiles.update_one(
            {'user_id': user_id},
            {
                '$set': {
                    'user_id': user_id,
                    'profile': profile,
                    'updated_at': datetime.utcnow()
                }
            },
            upsert=True
        )
        
        return jsonify({"success": True, "message": "Profile saved"}), 200
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/accessibility/profile/get/<user_id>', methods=['GET'])
def get_profile(user_id):
    """Retrieve user accessibility profile from MongoDB"""
    try:
        if not MONGODB_ENABLED:
            return jsonify({"success": False, "error": "MongoDB not configured"}), 404
            
        profile_doc = db.accessibility_profiles.find_one({'user_id': user_id})
        
        if profile_doc:
            # Remove MongoDB _id field
            profile_doc.pop('_id', None)
            
            return jsonify({
                "success": True,
                "profile": profile_doc.get('profile', {})
            }), 200
        else:
            return jsonify({
                "success": False,
                "message": "Profile not found"
            }), 404
            
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ============================================
# ANALYTICS (MongoDB)
# ============================================

@app.route('/api/analytics/session', methods=['POST'])
def log_session():
    """Log learning session for analytics"""
    try:
        if not MONGODB_ENABLED:
            return jsonify({"success": True}), 200
            
        data = request.json
        
        session_data = {
            'user_id': data.get('userId', 'anonymous'),
            'document_type': data.get('documentType'),
            'features_used': data.get('featuresUsed', []),
            'duration': data.get('duration', 0),
            'timestamp': datetime.utcnow()
        }
        
        db.sessions.insert_one(session_data)
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/analytics/insights/<user_id>', methods=['GET'])
def get_insights(user_id):
    """Generate AI insights from usage patterns"""
    try:
        if not MONGODB_ENABLED:
            return jsonify({
                "success": True,
                "insights": "Analytics not available (MongoDB not configured)",
                "session_count": 0
            }), 200
        
        if not GEMINI_ENABLED:
            return jsonify({
                "success": True,
                "insights": "AI insights not available (Gemini not configured)",
                "session_count": 0
            }), 200
            
        # Get last 30 sessions
        sessions = list(db.sessions.find(
            {'user_id': user_id}
        ).sort('timestamp', -1).limit(30))
        
        if not sessions:
            return jsonify({
                "success": True,
                "insights": "Not enough data yet. Keep using ChromeAI Plus to unlock personalized insights!",
                "session_count": 0
            }), 200
        
        # Prepare data for analysis (remove MongoDB _id)
        sessions_data = []
        for session in sessions:
            session.pop('_id', None)
            session['timestamp'] = session['timestamp'].isoformat()
            sessions_data.append(session)
        
        # MODEL: gemini-2.5-flash (Updated from gemini-pro)
        model = genai.GenerativeModel('gemini-2.5-flash')
        prompt = f"""Analyze these learning session patterns and provide personalized insights:

{json.dumps(sessions_data[:10], indent=2)}

Provide:
1. Most used features
2. Learning patterns
3. Recommendations for improvement
4. Accessibility needs analysis

Keep it concise and actionable."""
        
        response = model.generate_content(prompt)
        
        return jsonify({
            "success": True,
            "insights": response.text,
            "session_count": len(sessions_data)
        }), 200
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/analytics/stats/<user_id>', methods=['GET'])
def get_stats(user_id):
    """Get user statistics"""
    try:
        if not MONGODB_ENABLED:
            return jsonify({"success": False, "error": "MongoDB not configured"}), 400
            
        # Count total sessions
        total_sessions = db.sessions.count_documents({'user_id': user_id})
        
        # Get feature usage counts
        pipeline = [
            {'$match': {'user_id': user_id}},
            {'$unwind': '$features_used'},
            {'$group': {
                '_id': '$features_used',
                'count': {'$sum': 1}
            }},
            {'$sort': {'count': -1}}
        ]
        
        feature_usage = list(db.sessions.aggregate(pipeline))
        
        # Get document type distribution
        doc_pipeline = [
            {'$match': {'user_id': user_id}},
            {'$group': {
                '_id': '$document_type',
                'count': {'$sum': 1}
            }},
            {'$sort': {'count': -1}}
        ]
        
        doc_types = list(db.sessions.aggregate(doc_pipeline))
        
        return jsonify({
            "success": True,
            "total_sessions": total_sessions,
            "feature_usage": feature_usage,
            "document_types": doc_types
        }), 200
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ============================================
# HELPERS
# ============================================

def build_accessibility_prompt(query, mode):
    """Build prompts optimized for different accessibility needs"""
    prompts = {
        'dyslexia': f"{query}\n\nFormat for dyslexia: short sentences, simple words, bullet points, clear spacing.",
        'adhd': f"{query}\n\nFormat for ADHD: concise chunks, numbered lists, key points highlighted.",
        'visual_impairment': f"{query}\n\nFormat for screen readers: describe visuals, clear hierarchy, no vague references.",
        'non_native': f"{query}\n\nFormat for language learners: simple vocabulary, define terms, avoid idioms."
    }
    return prompts.get(mode, query)

def log_usage(user_id, feature, metadata=None):
    """Log feature usage to MongoDB"""
    try:
        if MONGODB_ENABLED:
            log_data = {
                'user_id': user_id,
                'feature': feature,
                'metadata': metadata or {},
                'timestamp': datetime.utcnow()
            }
            db.usage_logs.insert_one(log_data)
    except Exception as e:
        print(f"Failed to log usage: {e}")

def extract_text_from_pdf(path):
    text_parts = []
    try:
        with open(path, 'rb') as fh:
            reader = PyPDF2.PdfReader(fh)
            for p in reader.pages:
                try:
                    text_parts.append(p.extract_text() or "")
                except Exception:
                    continue
    except Exception as e:
        return ""
    return "\n".join(text_parts)

def extract_text_from_docx(path):
    """Extract text from Word document (.docx)"""
    try:
        doc = Document(path)
        text_parts = []
        for paragraph in doc.paragraphs:
            if paragraph.text.strip():
                text_parts.append(paragraph.text.strip())
        return "\n".join(text_parts)
    except Exception as e:
        return ""

def summarize_with_openai(text):
    openai.api_key = OPENAI_KEY
    # simple prompt - adjust as needed
    prompt = f"Summarize the following document into a concise summary:\n\n{text[:30000]}"
    resp = openai.Completion.create(
        engine="text-davinci-003",
        prompt=prompt,
        max_tokens=400,
        temperature=0.3
    )
    return resp.choices[0].text.strip()

def proofread_with_openai(text):
    openai.api_key = OPENAI_KEY
    prompt = f"""Please proofread the following text for grammar, spelling, punctuation, and style improvements. 
Provide the corrected version and highlight any major issues found:

{text[:30000]}"""
    resp = openai.Completion.create(
        engine="text-davinci-003",
        prompt=prompt,
        max_tokens=800,
        temperature=0.2
    )
    return resp.choices[0].text.strip()

@app.route('/upload', methods=['POST'])
def upload_document():
    """Handle document file upload (PDF and Word documents)"""
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Check file extension
        filename_lower = file.filename.lower()
        if not (filename_lower.endswith('.pdf') or filename_lower.endswith('.docx')):
            return jsonify({"error": "Only PDF and Word (.docx) files are allowed"}), 400
        
        # Secure the filename and save the file
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        return jsonify({"filename": filename}), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/summarize', methods=['POST'])
def summarize_pdf():
    data = request.get_json() or {}
    filename = data.get('filename')
    if not filename:
        return jsonify({"error": "filename required"}), 400
    path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(filename))
    if not os.path.exists(path):
        return jsonify({"error": "file not found"}), 404
    text = extract_text_from_pdf(path)
    if not text:
        return jsonify({"error": "no text extracted"}), 500
    summary = None
    if OPENAI_KEY:
        try:
            summary = summarize_with_openai(text)
        except Exception:
            summary = None
    if not summary:
        summary = text.strip()[:2000]
        if len(text) > 2000:
            summary += "\n\n[Truncated preview. Add OPENAI_API_KEY in backend .env for better summaries.]"
    return jsonify({"summary": summary}), 200

@app.route('/proofread', methods=['POST'])
def proofread_pdf():
    """Proofread PDF content for grammar, spelling, and style"""
    data = request.get_json() or {}
    filename = data.get('filename')
    if not filename:
        return jsonify({"error": "filename required"}), 400
    path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(filename))
    if not os.path.exists(path):
        return jsonify({"error": "file not found"}), 404
    text = extract_text_from_pdf(path)
    if not text:
        return jsonify({"error": "no text extracted"}), 500
    
    proofread_result = None
    if OPENAI_KEY:
        try:
            proofread_result = proofread_with_openai(text)
        except Exception:
            proofread_result = None
    if not proofread_result:
        # Fallback: basic text analysis
        proofread_result = f"Text extracted from PDF:\n\n{text[:1000]}\n\n[Add OPENAI_API_KEY in backend .env for AI-powered proofreading.]"
    
    return jsonify({"proofread": proofread_result}), 200

@app.route('/process-pdf', methods=['POST'])
def process_pdf():
    """Process PDF with multiple options: summarize, proofread, or both"""
    data = request.get_json() or {}
    filename = data.get('filename')
    action = data.get('action', 'summarize')  # 'summarize', 'proofread', or 'both'
    
    if not filename:
        return jsonify({"error": "filename required"}), 400
    path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(filename))
    if not os.path.exists(path):
        return jsonify({"error": "file not found"}), 404
    
    text = extract_text_from_pdf(path)
    if not text:
        return jsonify({"error": "no text extracted"}), 500
    
    result = {}
    
    if action in ['summarize', 'both']:
        summary = None
        if OPENAI_KEY:
            try:
                summary = summarize_with_openai(text)
            except Exception:
                summary = None
        if not summary:
            summary = text.strip()[:2000]
            if len(text) > 2000:
                summary += "\n\n[Truncated preview. Add OPENAI_API_KEY in backend .env for better summaries.]"
        result['summary'] = summary
    
    if action in ['proofread', 'both']:
        proofread_result = None
        if OPENAI_KEY:
            try:
                proofread_result = proofread_with_openai(text)
            except Exception:
                proofread_result = None
        if not proofread_result:
            proofread_result = f"Text extracted from PDF:\n\n{text[:1000]}\n\n[Add OPENAI_API_KEY in backend .env for AI-powered proofreading.]"
        result['proofread'] = proofread_result
    
    return jsonify(result), 200

def extract_text_from_document(path):
    """Extract text from document based on file extension"""
    filename_lower = path.lower()
    if filename_lower.endswith('.pdf'):
        return extract_text_from_pdf(path)
    elif filename_lower.endswith('.docx'):
        return extract_text_from_docx(path)
    else:
        return ""

@app.route('/process-document', methods=['POST'])
def process_document():
    """Process document with multiple options: summarize, proofread, or both (PDF or Word)"""
    data = request.get_json() or {}
    filename = data.get('filename')
    action = data.get('action', 'summarize')  # 'summarize', 'proofread', or 'both'
    
    if not filename:
        return jsonify({"error": "filename required"}), 400
    path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(filename))
    if not os.path.exists(path):
        return jsonify({"error": "file not found"}), 404
    
    text = extract_text_from_document(path)
    if not text:
        return jsonify({"error": "no text extracted"}), 500
    
    result = {}
    
    if action in ['summarize', 'both']:
        summary = None
        if OPENAI_KEY:
            try:
                summary = summarize_with_openai(text)
            except Exception:
                summary = None
        if not summary:
            summary = text.strip()[:2000]
            if len(text) > 2000:
                summary += "\n\n[Truncated preview. Add OPENAI_API_KEY in backend .env for better summaries.]"
        result['summary'] = summary
    
    if action in ['proofread', 'both']:
        proofread_result = None
        if OPENAI_KEY:
            try:
                proofread_result = proofread_with_openai(text)
            except Exception:
                proofread_result = None
        if not proofread_result:
            file_type = "PDF" if filename.lower().endswith('.pdf') else "Word document"
            proofread_result = f"Text extracted from {file_type}:\n\n{text[:1000]}\n\n[Add OPENAI_API_KEY in backend .env for AI-powered proofreading.]"
        result['proofread'] = proofread_result
    
    return jsonify(result), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)