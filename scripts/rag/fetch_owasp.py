import os
import re
from supabase import create_client, Client

def load_env():
    env_vars = {}
    if os.path.exists('.env'):
        with open('.env', 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                parts = line.split('=', 1)
                if len(parts) == 2:
                    env_vars[parts[0].strip()] = parts[1].strip()
    return env_vars

def main():
    env = load_env()
    url = env.get('VITE_SUPABASE_URL')
    key = env.get('VITE_SUPABASE_ANON_KEY')
    if not url or not key:
        print("Error: Supabase URL or Key not found in .env")
        return

    supabase: Client = create_client(url, key)
    
    owasp_data = [
        {
            "source": "OWASP",
            "ref_id": "A01:2021",
            "title": "Broken Access Control",
            "description": "Users can access resources or perform actions outside of their intended permissions. This includes privilege escalation, metadata manipulation, and CORS misconfiguration.",
            "languages": ["python", "javascript", "typescript", "go", "java", "csharp", "c", "cpp"],
            "severity": "high"
        },
        {
            "source": "OWASP",
            "ref_id": "A02:2021",
            "title": "Cryptographic Failures",
            "description": "Failures related to cryptography (or lack thereof) which often lead to sensitive data exposure or system compromise. Examples include plaintext transmission of data, weak key generation, and use of broken cryptographic algorithms (like MD5, SHA1).",
            "languages": ["python", "javascript", "typescript", "go", "java", "csharp", "c", "cpp"],
            "severity": "high"
        },
        {
            "source": "OWASP",
            "ref_id": "A03:2021",
            "title": "Injection",
            "description": "User-supplied data is not validated, filtered, or sanitized by the application. Hostile data is injected as part of a command or query (e.g., SQL Injection, Command Injection, LDAP Injection, XSS).",
            "languages": ["python", "javascript", "typescript", "go", "java", "csharp", "c", "cpp"],
            "severity": "critical"
        },
        {
            "source": "OWASP",
            "ref_id": "A04:2021",
            "title": "Insecure Design",
            "description": "A broad category focusing on risks related to design flaws. A secure design requires threat modeling, secure design patterns, and reference architectures. An insecure design cannot be fixed by a perfect implementation.",
            "languages": ["python", "javascript", "typescript", "go", "java", "csharp", "c", "cpp"],
            "severity": "medium"
        },
        {
            "source": "OWASP",
            "ref_id": "A05:2021",
            "title": "Security Misconfiguration",
            "description": "The application lacks proper security hardening, is configured with default accounts/passwords, shows overly detailed error messages, or has unnecessary features enabled.",
            "languages": ["python", "javascript", "typescript", "go", "java", "csharp", "c", "cpp"],
            "severity": "medium"
        },
        {
            "source": "OWASP",
            "ref_id": "A06:2021",
            "title": "Vulnerable and Outdated Components",
            "description": "Using software components (libraries, frameworks, modules) that are known to have vulnerabilities, are unsupported, or out-of-date. This includes direct and transitive dependencies.",
            "languages": ["python", "javascript", "typescript", "go", "java", "csharp", "c", "cpp"],
            "severity": "medium"
        },
        {
            "source": "OWASP",
            "ref_id": "A07:2021",
            "title": "Identification and Authentication Failures",
            "description": "Permitting weak passwords, credential stuffing, lack of multi-factor authentication, or improper session management (e.g., exposing session identifiers in URLs).",
            "languages": ["python", "javascript", "typescript", "go", "java", "csharp", "c", "cpp"],
            "severity": "high"
        },
        {
            "source": "OWASP",
            "ref_id": "A08:2021",
            "title": "Software and Data Integrity Failures",
            "description": "Code and infrastructure that do not protect against integrity violations. This includes insecure deserialization, untrusted CI/CD pipelines, and auto-update mechanisms without verification.",
            "languages": ["python", "javascript", "typescript", "go", "java", "csharp", "c", "cpp"],
            "severity": "high"
        },
        {
            "source": "OWASP",
            "ref_id": "A09:2021",
            "title": "Security Logging and Monitoring Failures",
            "description": "Failure to log, monitor, or report security-relevant events (e.g., failed logins, high-value transactions). Without logging, breaches cannot be detected or investigated.",
            "languages": ["python", "javascript", "typescript", "go", "java", "csharp", "c", "cpp"],
            "severity": "medium"
        },
        {
            "source": "OWASP",
            "ref_id": "A10:2021",
            "title": "Server-Side Request Forgery (SSRF)",
            "description": "Occurs when a web application fetches a remote resource without validating the user-supplied URL. It allows an attacker to coerce the application to send a crafted request to an unexpected destination (e.g., loopback address, internal network).",
            "languages": ["python", "javascript", "typescript", "go", "java", "csharp", "c", "cpp"],
            "severity": "high"
        }
    ]

    print("Inserting OWASP Top 10 data...")
    for item in owasp_data:
        try:
            # Check duplicate
            res = supabase.table("rag_knowledge").select("id").eq("ref_id", item["ref_id"]).eq("source", item["source"]).execute()
            if res.data:
                print(f"Skipping {item['ref_id']} (Already exists)")
                continue
            supabase.table("rag_knowledge").insert(item).execute()
            print(f"Inserted: {item['ref_id']} - {item['title']}")
        except Exception as e:
            print(f"Failed to insert {item['ref_id']}: {e}")

if __name__ == "__main__":
    main()
