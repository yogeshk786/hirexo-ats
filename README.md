# AI-Powered Applicant Tracking System (ATS)

An asynchronous, multi-tenant Applicant Tracking System backend that automates resume ingestion, entity extraction, and semantic candidate search. Built with FastAPI, Supabase, and local PyTorch NLP models, this system connects a desktop client to a scalable cloud architecture.

## System Architecture

The application is decoupled into a desktop client interface and a containerized cloud backend capable of handling heavy Machine Learning workloads asynchronously without blocking the main event loop.

*   **Ingestion:** Automatically fetches attachments via the **Gmail API** and local tenant folders.
*   **Gatekeeping:** Filters non-resumes using Regex heuristics and local Named Entity Recognition (NER).
*   **Classification:** Uses a fallback chain of LLMs (Gemini $\rightarrow$ Llama 3 $\rightarrow$ Qwen) via **OpenRouter** to definitively classify documents.
*   **Vectorization:** Generates semantic embeddings using Hugging Face `sentence-transformers` for conceptual candidate search.
*   **Storage:** Stores metadata, vectors (`pgvector`), and candidate relationships in **Supabase** (PostgreSQL), while uploading raw PDFs to Supabase Storage.

---

## Key Features

*   **Asynchronous Processing Pipeline:** Utilizes Python's `asyncio` and thread-offloading (`asyncio.to_thread()`) to execute heavy CPU-bound tasks (spaCy models, PyTorch embeddings) and blocking I/O (Supabase calls) concurrently.
*   **Deduplication Engine:** Implements `SHA-256` document hashing to detect and drop duplicate applications globally across the database.
*   **Multi-Tenant Isolation:** Separates candidate data and API actions by `company_id` to ensure strict tenant data boundaries.
*   **Graceful Degradation:** Features automatic retry mechanisms, exponential backoff for API rate limits, and fallback routing for LLM timeouts.
*   **Memory-Optimized Deployment:** Containerized via Docker to run heavy NLP payloads (`en_core_web_lg` and `all-MiniLM-L6-v2`) efficiently in cloud environments (Hugging Face Spaces / Oracle Cloud).

---

## Technology Stack

| Category | Technologies Used |
| :--- | :--- |
| **Core Framework** | Python 3.11, FastAPI, Uvicorn, Pydantic |
| **Machine Learning / NLP** | `spacy`, `sentence-transformers`, PyTorch |
| **LLM Orchestration** | OpenRouter API (Gemini 1.5 Flash, Llama 3.1, Qwen 2.5) |
| **Database & Storage** | Supabase (PostgreSQL, `pgvector`, Object Storage) |
| **External Integrations** | Gmail API (OAuth 2.0) |
| **DevOps & Deployment** | Docker, Hugging Face Spaces |

---

## Local Setup & Installation

**1. Clone the repository**
```bash
git clone https://github.com/yogeshk786/hirexo-ats.git
cd hirexo-ats
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
