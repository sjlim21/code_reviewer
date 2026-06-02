import os
import zipfile
import requests
import io
import xml.etree.ElementTree as ET
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

# Fallback 주요 CWE 목록 (네트워크 오류 등으로 전체 XML 파싱 실패 시 사용)
FALLBACK_CWES = [
    {"ref_id": "CWE-89", "title": "Improper Neutralization of Special Elements used in an SQL Command ('SQL Injection')", "description": "The software constructs all or part of an SQL command using externally-influenced input from an upstream component, but it does not neutralize or incorrectly neutralizes special elements that could modify the intended SQL command.", "languages": ["python", "javascript", "typescript", "go", "java", "csharp", "c", "cpp"], "severity": "critical"},
    {"ref_id": "CWE-79", "title": "Improper Neutralization of Input During Web Page Generation ('Cross-site Scripting')", "description": "The software does not neutralize or incorrectly neutralizes user-controllable input before it is placed in output that is used as a web page that is served to other users.", "languages": ["javascript", "typescript", "python", "go", "java", "csharp"], "severity": "high"},
    {"ref_id": "CWE-78", "title": "Improper Neutralization of Special Elements used in an OS Command ('OS Command Injection')", "description": "The software constructs all or part of an OS command using externally-influenced input from an upstream component, but it does not neutralize or incorrectly neutralizes special elements that could modify the OS command.", "languages": ["python", "javascript", "typescript", "go", "java", "csharp", "c", "cpp"], "severity": "critical"},
    {"ref_id": "CWE-119", "title": "Improper Restriction of Operations within the Bounds of a Memory Buffer", "description": "The software performs operations on a memory buffer, but it can read from or write to a memory location that is outside of the intended boundary of the buffer.", "languages": ["c", "cpp"], "severity": "critical"},
    {"ref_id": "CWE-120", "title": "Buffer Copy without Checking Size of Input ('Classic Buffer Overflow')", "description": "The program copies an input buffer to a output buffer without verifying that the size of the input buffer is less than the size of the output buffer.", "languages": ["c", "cpp"], "severity": "critical"},
    {"ref_id": "CWE-416", "title": "Use After Free", "description": "Referencing memory after it has been freed can cause a program to crash, use unexpected values, or execute code.", "languages": ["c", "cpp"], "severity": "critical"},
    {"ref_id": "CWE-502", "title": "Deserialization of Untrusted Data", "description": "The application deserializes untrusted data without sufficiently verifying that the resulting data will be valid.", "languages": ["python", "javascript", "typescript", "java", "csharp"], "severity": "high"},
    {"ref_id": "CWE-22", "title": "Improper Limitation of a Pathname to a Restricted Directory ('Path Traversal')", "description": "The software uses external input to construct a pathname that is intended to identify a file or directory that is located under a restricted directory, but the software does not properly neutralize special elements within the pathname.", "languages": ["python", "javascript", "typescript", "go", "java", "csharp", "c", "cpp"], "severity": "high"},
    {"ref_id": "CWE-476", "title": "NULL Pointer Dereference", "description": "A NULL pointer dereference occurs when the application dereferences a pointer that it expects to be valid, but is NULL, typically causing a crash.", "languages": ["c", "cpp", "java", "csharp"], "severity": "medium"},
    {"ref_id": "CWE-94", "title": "Improper Control of Generation of Code ('Code Injection')", "description": "The software constructs all or part of a code segment using externally-influenced input, but it does not neutralize or incorrectly neutralizes special elements that could modify the code.", "languages": ["python", "javascript", "typescript", "go", "java", "csharp"], "severity": "critical"},
    {"ref_id": "CWE-287", "title": "Improper Authentication", "description": "When an actor claims to have a given identity, the software does not prove or insufficiently proves that the claim is correct.", "languages": ["python", "javascript", "typescript", "go", "java", "csharp"], "severity": "critical"},
    {"ref_id": "CWE-352", "title": "Cross-Site Request Forgery (CSRF)", "description": "The web application does not, or cannot, sufficiently verify whether a well-formed, valid, consistent request was intentionally sent by the user who submitted the request.", "languages": ["javascript", "typescript", "python", "go", "java", "csharp"], "severity": "high"}
]

ALL_LANGUAGES = ["python", "javascript", "typescript", "go", "java", "csharp", "c", "cpp"]


def _connect_supabase() -> Client:
    env = load_env()
    url = env.get('VITE_SUPABASE_URL')
    key = env.get('VITE_SUPABASE_ANON_KEY')
    if not url or not key:
        print("Error: Supabase URL or Key not found in .env")
        raise SystemExit(1)
    return create_client(url, key)


def _normalize_languages(raw_langs: list) -> list:
    norm = []
    for lang in raw_langs:
        if 'python' in lang:
            norm.append('python')
        elif 'javascript' in lang or 'typescript' in lang:
            norm.extend(['javascript', 'typescript'])
        elif 'go' in lang:
            norm.append('go')
        elif 'java' in lang:
            norm.append('java')
        elif 'c#' in lang or 'csharp' in lang:
            norm.append('csharp')
        elif any(x in lang for x in ['c', 'cpp', 'c++', 'c/c++']):
            norm.extend(['c', 'cpp'])
    return list(set(norm)) or ALL_LANGUAGES


def _parse_weakness(w, ns: dict) -> dict:
    cwe_id = f"CWE-{w.get('ID')}"
    title = w.get('Name', '')

    desc_elem = w.find('ns:Description', ns)
    desc = desc_elem.text if desc_elem is not None else ""

    raw_langs = []
    platforms = w.find('ns:Applicable_Platforms', ns)
    if platforms is not None:
        for lang_elem in platforms.findall('.//ns:Language', ns):
            name = lang_elem.get('Name')
            if name:
                raw_langs.append(name.lower())

    norm_langs = _normalize_languages(raw_langs) if raw_langs else ALL_LANGUAGES

    likelihood = w.find('ns:Likelihood_Of_Exploit', ns)
    if likelihood is not None and likelihood.text in ("High", "Very High"):
        sev = "high"
    elif likelihood is not None and likelihood.text == "Low":
        sev = "low"
    else:
        sev = "medium"

    return {
        "source": "CWE",
        "ref_id": cwe_id,
        "title": title,
        "description": desc,
        "languages": norm_langs,
        "severity": sev,
    }


def _fetch_cwe_from_mitre() -> list:
    print("Attempting to fetch latest CWE XML data from Mitre...")
    try:
        r = requests.get("https://cwe.mitre.org/data/xml/cwec_latest.xml.zip", timeout=30)
        if r.status_code != 200:
            print(f"HTTP error {r.status_code}, falling back to static list")
            return FALLBACK_CWES

        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            xml_filename = next((n for n in z.namelist() if n.endswith('.xml')), None)
            if not xml_filename:
                print("No XML file found in zip, using fallback.")
                return FALLBACK_CWES

            print(f"Extracting and parsing {xml_filename}...")
            with z.open(xml_filename) as xml_file:
                root = ET.parse(xml_file).getroot()

        ns = {'ns': 'http://cwe.mitre.org/cwe-7'}
        weaknesses = root.find('.//ns:Weaknesses', ns)
        if weaknesses is None:
            print("Failed to find Weaknesses element in XML, using static fallback.")
            return FALLBACK_CWES

        all_w = weaknesses.findall('ns:Weakness', ns)
        print(f"Found {len(all_w)} weaknesses in XML. Parsing first 250...")
        return [_parse_weakness(w, ns) for w in all_w[:250]]

    except Exception as e:
        print(f"CWE download/parse failed: {e}. Falling back to static list.")
        return FALLBACK_CWES


def _upsert_cwe_records(supabase: Client, cwe_list: list) -> None:
    print(f"Inserting/Updating {len(cwe_list)} CWE records...")
    for idx, item in enumerate(cwe_list):
        try:
            res = (supabase.table("rag_knowledge")
                   .select("id")
                   .eq("ref_id", item["ref_id"])
                   .eq("source", item["source"])
                   .execute())
            if res.data:
                (supabase.table("rag_knowledge")
                 .update({
                     "title": item["title"],
                     "description": item["description"],
                     "languages": item["languages"],
                     "severity": item["severity"],
                 })
                 .eq("ref_id", item["ref_id"])
                 .eq("source", item["source"])
                 .execute())
            else:
                supabase.table("rag_knowledge").insert(item).execute()
                if idx % 20 == 0:
                    print(f"Processed: {item['ref_id']}")
        except Exception as e:
            print(f"Failed to insert {item['ref_id']}: {e}")


def main():
    supabase = _connect_supabase()
    cwe_list = _fetch_cwe_from_mitre() or FALLBACK_CWES
    _upsert_cwe_records(supabase, cwe_list)


if __name__ == "__main__":
    main()
