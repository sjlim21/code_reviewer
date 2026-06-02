import unittest
import json

class TestIOSchema(unittest.TestCase):
    def test_parser_output_schema(self):
        # Parser Agent Output 스키마 검증
        parser_output = {
            "file_name": "auth_service.py",
            "language": "python",
            "complexity_hint": "high",
            "dependencies": ["flask", "sqlite3"],
            "chunks": [
                {
                    "chunk_id": "auth_service_py_001",
                    "line_start": 1,
                    "line_end": 85,
                    "context_summary": "User login handler",
                    "content": "def login(): pass"
                }
            ]
        }
        
        self.assertIn("file_name", parser_output)
        self.assertIn("language", parser_output)
        self.assertIn("complexity_hint", parser_output)
        self.assertIn("dependencies", parser_output)
        self.assertIn("chunks", parser_output)
        self.assertIn(parser_output["complexity_hint"], ["low", "medium", "high"])
        for chunk in parser_output["chunks"]:
            self.assertIn("chunk_id", chunk)
            self.assertIn("line_start", chunk)
            self.assertIn("line_end", chunk)
            self.assertIn("context_summary", chunk)
            self.assertIn("content", chunk)

    def test_specialist_output_schema(self):
        # Specialist Agent Output 스키마 검증
        specialist_output = {
            "chunk_id": "auth_service_py_001",
            "raw_issues": [
                {
                    "analyst_issue_id": "ai_001",
                    "title": "SQL Injection",
                    "description": "SQL Injection vulnerable code",
                    "severity_suggestion": "critical",
                    "category": "security",
                    "file_path": "auth_service.py",
                    "line_start": 34,
                    "line_end": 38,
                    "code_snippet": "cursor.execute(sql)",
                    "as_is": "cursor.execute(sql)",
                    "to_be": "cursor.execute(sql, params)",
                    "confidence_raw": 0.91
                }
            ]
        }
        self.assertIn("chunk_id", specialist_output)
        self.assertIn("raw_issues", specialist_output)
        for issue in specialist_output["raw_issues"]:
            self.assertIn("analyst_issue_id", issue)
            self.assertIn("title", issue)
            self.assertIn("description", issue)
            self.assertIn("severity_suggestion", issue)
            self.assertIn(issue["severity_suggestion"], ["critical", "high", "medium", "low", "info"])
            self.assertIn("category", issue)
            self.assertIn(issue["category"], ["security", "bug", "performance", "code_smell", "maintainability", "style", "documentation", "dependency", "test_coverage", "other"])
            self.assertIn("file_path", issue)
            self.assertIn("line_start", issue)
            self.assertIn("line_end", issue)
            self.assertIn("code_snippet", issue)
            self.assertIn("as_is", issue)
            self.assertIn("to_be", issue)
            self.assertIn("confidence_raw", issue)

    def test_verifier_output_schema(self):
        # Verifier Agent Output 스키마 검증
        verifier_output = {
            "verified_issues": [
                {
                    "analyst_issue_id": "ai_001",
                    "is_false_positive": False,
                    "severity_original": "critical",
                    "severity_verified": "critical",
                    "severity_changed": False,
                    "severity_change_reason": None,
                    "duplicate_of": None,
                    "affected_lines": [34, 38],
                    "confidence_verified": 0.95,
                    "human_review_required": False,
                    "rag_references": [
                        {
                            "source": "CWE",
                            "id": "CWE-89",
                            "title": "Improper Neutralization"
                        }
                    ],
                    "verifier_note": "True positive SQL injection"
                }
            ],
            "summary": {
                "total_raw": 1,
                "false_positives_removed": 0,
                "severity_downgraded": 0,
                "duplicates_merged": 0,
                "human_review_required": 0,
                "passed": 1
            }
        }
        self.assertIn("verified_issues", verifier_output)
        self.assertIn("summary", verifier_output)
        for issue in verifier_output["verified_issues"]:
            self.assertIn("analyst_issue_id", issue)
            self.assertIn("is_false_positive", issue)
            self.assertIn("severity_original", issue)
            self.assertIn("severity_verified", issue)
            self.assertIn("severity_changed", issue)
            self.assertIn("severity_change_reason", issue)
            self.assertIn("duplicate_of", issue)
            self.assertIn("affected_lines", issue)
            self.assertIn("confidence_verified", issue)
            self.assertIn("human_review_required", issue)
            self.assertIn("rag_references", issue)
            self.assertIn("verifier_note", issue)

    def test_scorer_output_schema(self):
        # Scorer Agent Output 스키마 검증
        scorer_output = {
            "scored_issues": [
                {
                    "analyst_issue_id": "ai_001",
                    "priority_score": 97,
                    "score_breakdown": {
                        "severity_base": 90,
                        "impact_factor": 3,
                        "complexity_inv": 2,
                        "attack_surface": 2
                    },
                    "effort_minutes": 30
                }
            ]
        }
        self.assertIn("scored_issues", scorer_output)
        for issue in scorer_output["scored_issues"]:
            self.assertIn("analyst_issue_id", issue)
            self.assertIn("priority_score", issue)
            self.assertIn("score_breakdown", issue)
            self.assertIn("effort_minutes", issue)
            breakdown = issue["score_breakdown"]
            self.assertIn("severity_base", breakdown)
            self.assertIn("impact_factor", breakdown)
            self.assertIn("complexity_inv", breakdown)
            self.assertIn("attack_surface", breakdown)

    def test_scorer_blocks_field(self):
        # Scorer Agent blocks 필드 검증 (이슈 의존성)
        scorer_with_blocks = {
            "scored_issues": [
                {
                    "analyst_issue_id": "ai_001",
                    "priority_score": 97,
                    "score_breakdown": {
                        "severity_base": 90,
                        "impact_factor": 3,
                        "complexity_inv": 2,
                        "attack_surface": 2
                    },
                    "effort_minutes": 30,
                    "blocks": ["ai_002"]
                },
                {
                    "analyst_issue_id": "ai_002",
                    "priority_score": 75,
                    "score_breakdown": {
                        "severity_base": 70,
                        "impact_factor": 1,
                        "complexity_inv": 1,
                        "attack_surface": 1
                    },
                    "effort_minutes": 60,
                    "blocks": []
                }
            ]
        }
        for issue in scorer_with_blocks["scored_issues"]:
            self.assertIn("blocks", issue)
            self.assertIsInstance(issue["blocks"], list)

    def test_reporter_output_schema(self):
        # Reporter Agent 최종 출력 스키마 검증
        reporter_output = [
            {
                "project_id": "uuid-1234",
                "analysis_run_id": "uuid-5678",
                "title": "SQL Injection via unsanitized input",
                "description": "SQL Injection vulnerable code in login handler",
                "suggestion": "### AS-IS\n```python\ncursor.execute(sql)\n```\n### TO-BE\n```python\ncursor.execute(sql, params)\n```\n**근거**: Parameterized query 사용",
                "rule_id": "CWE-89",
                "severity": "critical",
                "category": "security",
                "priority_score": 97,
                "file_path": "auth_service.py",
                "line_start": 34,
                "line_end": 38,
                "code_snippet": "cursor.execute(sql)",
                "status": "open",
                "assignee_id": None,
                "is_false_positive": False,
                "effort_minutes": 30,
                "confidence_score": 0.95,
                "human_review_required": False,
                "rag_references": [{"source": "CWE", "id": "CWE-89", "title": "SQL Injection"}],
                "score_breakdown": {
                    "severity_base": 90,
                    "impact_factor": 3,
                    "complexity_inv": 2,
                    "attack_surface": 2
                }
            }
        ]
        required_fields = [
            "project_id", "analysis_run_id", "title", "description", "suggestion",
            "rule_id", "severity", "category", "priority_score", "file_path",
            "line_start", "line_end", "code_snippet", "status", "assignee_id",
            "is_false_positive", "effort_minutes", "confidence_score",
            "human_review_required", "rag_references", "score_breakdown"
        ]
        valid_statuses = ["open", "pending_review", "in_progress", "resolved", "dismissed", "wont_fix"]
        self.assertIsInstance(reporter_output, list)
        for issue in reporter_output:
            for field in required_fields:
                self.assertIn(field, issue, f"Missing field: {field}")
            self.assertIn(issue["status"], valid_statuses)
            self.assertIn(issue["severity"], ["critical", "high", "medium", "low", "info"])
            self.assertFalse(issue["is_false_positive"])
            self.assertIsInstance(issue["rag_references"], list)
            breakdown = issue["score_breakdown"]
            self.assertIn("severity_base", breakdown)
            self.assertIn("impact_factor", breakdown)
            self.assertIn("complexity_inv", breakdown)
            self.assertIn("attack_surface", breakdown)

    def test_parser_is_generated_field(self):
        # Parser Agent is_generated 필드 검증
        generated_output = {
            "file_name": "bundle.min.js",
            "language": "javascript",
            "complexity_hint": "high",
            "is_generated": True,
            "dependencies": [],
            "chunks": []
        }
        self.assertIn("is_generated", generated_output)
        self.assertIsInstance(generated_output["is_generated"], bool)

    def test_raw_issue_rag_references_field(self):
        # Specialist raw_issue에 rag_references 필드 포함 여부 (RAG retrieval 후)
        raw_issue_with_rag = {
            "analyst_issue_id": "ai_001",
            "title": "SQL Injection",
            "description": "Vulnerable SQL",
            "severity_suggestion": "critical",
            "category": "security",
            "file_path": "auth.py",
            "line_start": 10,
            "line_end": 12,
            "code_snippet": "cursor.execute(sql)",
            "as_is": "cursor.execute(sql)",
            "to_be": "cursor.execute(sql, params)",
            "confidence_raw": 0.9,
            "rag_references": [
                {"source": "CWE", "id": "CWE-89", "title": "SQL Injection"}
            ]
        }
        self.assertIn("rag_references", raw_issue_with_rag)
        for ref in raw_issue_with_rag["rag_references"]:
            self.assertIn("source", ref)
            self.assertIn("id", ref)
            self.assertIn("title", ref)


if __name__ == "__main__":
    unittest.main()
