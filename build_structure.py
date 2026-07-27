import os


project_structure = {
  "resume-ingestion-system": {
    "backend": {
      "app": {
        "main.py": "Entry point (FastAPI/Express)",
        "config": {
          "__init__.py": "",
          "settings.py": "Environment variables and configs"
        },
        "api": {
          "__init__.py": "",
          "routes": {
            "resume.py": "Resume APIs",
            "search.py": "Search APIs",
            "health.py": "Health check APIs"
          },
          "deps.py": "Dependency injection"
        },
        "services": {
          "email": {
            "gmail_service.py": "Fetch emails via Gmail API",
            "imap_service.py": "Fallback email fetching"
          },
          "ingestion": {
            "email_ingestor.py": "Main orchestration logic",
            "attachment_handler.py": "Extract attachments"
          },
          "parser": {
            "resume_parser.py": "Parse structured data",
            "text_extractor.py": "PDF/DOC → text"
          },
          "storage": {
            "file_storage.py": "Save raw resumes",
            "db_service.py": "Database operations"
          },
          "embedding": {
            "embedding_service.py": "Generate vector embeddings"
          },
          "search": {
            "search_service.py": "Search and filtering logic"
          }
        },
        "models": {
          "base.py": "Base ORM model",
          "candidate.py": "Candidate entity",
          "resume.py": "Resume entity",
          "skills.py": "Skills entity"
        },
        "schemas": {
          "resume_schema.py": "Resume validation schema",
          "candidate_schema.py": "Candidate validation schema"
        },
        "utils": {
          "logger.py": "Logging utility",
          "file_utils.py": "File helpers",
          "email_utils.py": "Email helpers"
        },
        "core": {
          "config.py": "Core config loader",
          "security.py": "Auth/security (future)"
        }
      },
      "tests": {
        "test_resume.py": "",
        "test_email.py": ""
      },
      "requirements.txt": "Python dependencies"
    },
    "frontend": {
      "src": {
        "components": {},
        "pages": {
          "dashboard.jsx": "HR dashboard",
          "resume_list.jsx": "List view",
          "candidate_view.jsx": "Candidate detail view"
        },
        "services": {
          "api.js": "Backend API integration"
        }
      },
      "package.json": "Frontend dependencies"
    },
    "infra": {
      "docker": {
        "backend.Dockerfile": "Backend container config"
      },
      "nginx": {
        "nginx.conf": "Reverse proxy config"
      },
      "k8s": {
        "deployment.yaml": "Kubernetes deployment (future)",
        "service.yaml": "Kubernetes service"
      }
    },
    "scripts": {
      "email_cron.py": "Scheduled email fetcher",
      "reprocess.py": "Retry failed resumes"
    },
    "docs": {
      "architecture.md": "System design",
      "api_docs.md": "API documentation"
    },
    ".env": "Environment variables",
    "docker-compose.yml": "Multi-service orchestration",
    "README.md": "Project overview"
  }
}

def create_structure(base_path, structure):
    for name, content in structure.items():
        path = os.path.join(base_path, name)
        
        if isinstance(content, dict):
            # It's a folder, create it and dive deeper
            os.makedirs(path, exist_ok=True)
            create_structure(path, content)
        elif isinstance(content, str):
            # It's a file
            # Ensure parent directory exists just in case
            os.makedirs(os.path.dirname(path), exist_ok=True)
            
            with open(path, 'w', encoding='utf-8') as f:
                if content:
                    # Write the description as a comment based on file type
                    if name.endswith('.py'):
                        f.write(f"# {content}\n")
                    elif name.endswith(('.js', '.jsx')):
                        f.write(f"// {content}\n")
                    elif name.endswith('.md'):
                        f.write(f"\n")
                    elif name.endswith(('.yml', '.yaml', '.conf', '.env', 'Dockerfile', '.txt')):
                        f.write(f"# {content}\n")
                    else:
                        f.write(f"{content}\n")
            print(f"Created file: {path}")

if __name__ == "__main__":
    print("Building enterprise project structure...")
    # This creates the folders in whatever directory you run the script from
    create_structure(".", project_structure)
    print("\nDone! Check your VS Code sidebar.")