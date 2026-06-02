import os
import requests
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

# Fallback 주요 CVE 목록
FALLBACK_CVES = [
    {
        "ref_id": "CVE-2021-44228",
        "title": "Apache Log4j Remote Code Execution Vulnerability (Log4Shell)",
        "description": "Apache Log4j2 versions 2.0-beta9 to 2.15.0 (excluding security releases 2.12.2, 2.12.3, and 2.3.1) JNDI features used in configuration, log messages, and parameters do not protect against attacker controlled LDAP and other JNDI related endpoints.",
        "languages": ["java"],
        "severity": "critical"
    },
    {
        "ref_id": "CVE-2024-3094",
        "title": "XZ Utils Backdoor Vulnerability",
        "description": "Malicious code was discovered in the upstream tarballs of xz, starting with version 5.6.0. Through a series of complex obfuscations, the liblzma build process extracts a prebuilt object file from a disguised test file existing in the source code, which is then used to modify functions in the liblzma code.",
        "languages": ["c", "cpp"],
        "severity": "critical"
    },
    {
        "ref_id": "CVE-2023-38545",
        "title": "curl SOCKS5 Heap Buffer Overflow",
        "description": "This flaw makes curl overflow a heap-based buffer in the SOCKS5 proxy handshake. When curl is asked to pass the hostname to the SOCKS5 proxy to allow that to resolve the address, the common path constraints are violated.",
        "languages": ["c", "cpp"],
        "severity": "critical"
    },
    {
        "ref_id": "CVE-2020-0601",
        "title": "Windows CryptoAPI Spoofing Vulnerability",
        "description": "A spoofing vulnerability exists in the way Windows CryptoAPI (Crypt32.dll) validates Elliptic Curve Cryptography (ECC) certificates.",
        "languages": ["c", "cpp", "csharp"],
        "severity": "high"
    },
    {
        "ref_id": "CVE-2022-22965",
        "title": "Spring Framework Remote Code Execution (Spring4Shell)",
        "description": "A Spring MVC or Spring WebFlux application running on JDK 9+ may be vulnerable to remote code execution (RCE) via data binding. The specific exploit requires the application to run on Tomcat as a WAR deployment.",
        "languages": ["java"],
        "severity": "critical"
    }
]

TARGET_CVES = ["CVE-2021-44228", "CVE-2024-3094", "CVE-2023-38545", "CVE-2022-22965"]


def _connect_supabase() -> Client:
    env = load_env()
    url = env.get('VITE_SUPABASE_URL')
    key = env.get('VITE_SUPABASE_ANON_KEY')
    if not url or not key:
        print("Error: Supabase URL or Key not found in .env")
        raise SystemExit(1)
    return create_client(url, key)


def _infer_languages(desc: str) -> list:
    desc_lower = desc.lower()
    if "java" in desc_lower and "javascript" not in desc_lower:
        return ["java"]
    if "python" in desc_lower:
        return ["python"]
    if any(x in desc_lower for x in ("buffer overflow", "use-after-free", "pointer")):
        return ["c", "cpp"]
    if any(x in desc_lower for x in ("npm", "javascript", "typescript")):
        return ["javascript", "typescript"]
    if any(x in desc_lower for x in ("go language", "golang")):
        return ["go"]
    return ["python", "javascript", "typescript", "go", "java", "csharp", "c", "cpp"]


def _extract_severity(metrics: dict) -> str:
    cvss = metrics.get("cvssMetricV31", []) or metrics.get("cvssMetricV30", [])
    if cvss:
        base = cvss[0].get("cvssData", {}).get("baseSeverity", "").lower()
        if base:
            return base
    return "high"


def _fetch_single_cve(cve_id: str) -> dict | None:
    try:
        url = f"https://services.nvd.nist.gov/rest/json/cves/2.0?cveId={cve_id}"
        r = requests.get(url, headers={"User-Agent": "CodeEyeAgent"}, timeout=10)
        if r.status_code != 200:
            print(f"Failed to fetch {cve_id} (HTTP {r.status_code})")
            return None

        data = r.json()
        vulns = data.get("vulnerabilities", [])
        if not vulns:
            return None

        cve_item = vulns[0].get("cve", {})
        descriptions = cve_item.get("descriptions", [])
        desc = next((d["value"] for d in descriptions if d.get("lang") == "en"), "")

        return {
            "source": "CVE",
            "ref_id": cve_id,
            "title": f"NVD Vulnerability {cve_id}",
            "description": desc,
            "languages": _infer_languages(desc),
            "severity": _extract_severity(cve_item.get("metrics", {})),
        }
    except Exception as e:
        print(f"Error fetching {cve_id}: {e}")
        return None


def _merge_fallbacks(cve_list: list, target_ids: list) -> list:
    if len(cve_list) >= len(target_ids):
        return cve_list
    print("Falling back to pre-defined CVE list to complete the database...")
    fetched_ids = {c["ref_id"] for c in cve_list}
    return cve_list + [fb for fb in FALLBACK_CVES if fb["ref_id"] not in fetched_ids]


def _upsert_cve_records(supabase: Client, cve_list: list) -> None:
    print(f"Inserting/Updating {len(cve_list)} CVE records...")
    for item in cve_list:
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
                print(f"Inserted: {item['ref_id']}")
        except Exception as e:
            print(f"Failed to insert {item['ref_id']}: {e}")


def main():
    supabase = _connect_supabase()
    print("Fetching major CVEs from NVD API...")
    cve_list = [c for cve_id in TARGET_CVES if (c := _fetch_single_cve(cve_id)) is not None]
    cve_list = _merge_fallbacks(cve_list, TARGET_CVES)
    _upsert_cve_records(supabase, cve_list)


if __name__ == "__main__":
    main()
