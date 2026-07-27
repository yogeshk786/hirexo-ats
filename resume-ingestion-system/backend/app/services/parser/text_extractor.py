import os
import re
import pdfplumber
import docx
from pdf2image import convert_from_path
import pytesseract
from PIL import Image  
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# ==========================================
# 🛑 SMART PATHING (Production Safe)
# ==========================================
# In cloud environments (Linux), these tools are usually in the system PATH. 
# We only use the C:\ fallback if we are actively testing on a local Windows machine.
TESSERACT_PATH = os.getenv("TESSERACT_CMD", r'C:\Program Files\Tesseract-OCR\tesseract.exe')
POPPLER_PATH = os.getenv("POPPLER_PATH", r'C:\Program Files\poppler-25.12.0\Library\bin')

if os.name == 'nt' and os.path.exists(TESSERACT_PATH):
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH

class TextExtractor:
    def __init__(self):
        # 🚀 PRODUCTION UPGRADE: Protect CPU by limiting how many pages we process
        self.MAX_PAGES = 5 

    def extract_text(self, file_path):
        """Determines the file type and routes it to the correct extractor."""
        if not os.path.exists(file_path):
            print(f"❌ File not found: {file_path}")
            return ""

        ext = os.path.splitext(file_path)[1].lower()
        extracted_text = ""

        if ext == '.pdf':
            extracted_text = self._extract_from_pdf(file_path)
        elif ext == '.docx':
            extracted_text = self._extract_from_docx(file_path)
        elif ext == '.doc':
            # 🚀 PRODUCTION UPGRADE: python-docx cannot read old .doc files. Catch it safely.
            print(f"⚠️ Legacy .doc format detected. Text extraction may fail or require conversion.")
            return "" # Or implement antiword/soffice conversion if strictly needed
        elif ext == '.txt':
            extracted_text = self._extract_from_txt(file_path)
        elif ext in ['.jpg', '.jpeg', '.png']:
            extracted_text = self._extract_from_image(file_path)
        else:
            print(f"⚠️ Unsupported file type: {ext}")
            return ""

        # 🚀 THE DB SHIELD: Remove Null Bytes (\x00) which will instantly crash PostgreSQL/MongoDB!
        return extracted_text.replace('\x00', '')

    def _extract_from_pdf(self, file_path):
        """Hybrid PDF Extraction: Tries digital text first, falls back to OCR if empty or corrupted."""
        text = ""
        try:
            # Route A: The Fast Digital Extraction
            with pdfplumber.open(file_path) as pdf:
                for i, page in enumerate(pdf.pages):
                    # 🚀 PRODUCTION UPGRADE: Enforce page limit
                    if i >= self.MAX_PAGES:
                        print(f"⚠️ PDF exceeded {self.MAX_PAGES} pages. Truncating to save CPU.")
                        break
                        
                    page_text = page.extract_text()
                    if page_text: 
                        text += str(page_text) + "\n"
                        
            # ==========================================
            # 🛑 THE GIBBERISH SHIELD
            # ==========================================
            is_empty = len(text.strip()) < 50
            
            total_chars = len(text.strip())
            alphanumeric_chars = len(re.findall(r'[a-zA-Z0-9]', text))
            
            is_gibberish = False
            if total_chars > 0:
                is_gibberish = (alphanumeric_chars / total_chars) < 0.5 

            if is_empty or is_gibberish:
                reason = "Corrupted/Gibberish font layer" if is_gibberish else "Empty text layer"
                print(f"🔍 {reason} detected in {os.path.basename(file_path)}. Engaging OCR Engine...")
                text = self._ocr_pdf(file_path)
                
        except Exception as e:
            print(f"🚨 Error reading PDF {file_path}: {e}")
            
        return text

    def _ocr_pdf(self, file_path):
        """Heavy-duty OCR extraction for scanned PDFs."""
        ocr_text = ""
        try:
            # 🚀 PRODUCTION UPGRADE: Use `last_page` to prevent 100-page portfolios from crashing the server
            poppler = POPPLER_PATH if (os.name == 'nt' and os.path.exists(POPPLER_PATH)) else None
            images = convert_from_path(file_path, poppler_path=poppler, last_page=self.MAX_PAGES)
            
            for i, image in enumerate(images):
                print(f"   ↳ Processing OCR on page {i+1}...")
                page_text = pytesseract.image_to_string(image)
                if page_text:
                    ocr_text += str(page_text) + "\n"
                
        except Exception as e:
            print(f"🚨 OCR Engine Failed on {os.path.basename(file_path)}. (Is Poppler installed correctly?): {e}")
            
        return ocr_text

    def _extract_from_image(self, file_path):
        """Direct OCR for applicants who just upload a photo of their resume."""
        try:
            print(f"🔍 Image file detected. Engaging OCR Engine...")
            with Image.open(file_path) as img:
                return pytesseract.image_to_string(img)
        except Exception as e:
            print(f"🚨 OCR Engine Failed on image {file_path}: {e}")
            return ""

    def _extract_from_docx(self, file_path):
        text = ""
        try:
            doc = docx.Document(file_path)
            for para in doc.paragraphs:
                if para.text:
                    text += str(para.text) + "\n"
        except Exception as e:
            print(f"🚨 Error reading DOCX {file_path}: {e}")
        return text

    def _extract_from_txt(self, file_path):
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f: 
                return f.read()
        except Exception as e:
            print(f"🚨 Error reading TXT {file_path}: {e}")
            return ""


# ==========================================
# 🚀 THE FIX: Helper function to map to parsing.py
# ==========================================
def extract_from_file(file_path):
    """
    Instantiates the TextExtractor class and extracts text from the given file.
    This acts as a bridge for api/parsing.py so it doesn't crash.
    """
    extractor = TextExtractor()
    return extractor.extract_text(file_path)