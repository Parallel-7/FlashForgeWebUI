#!/usr/bin/env python3
"""
Validate a Claude Code subagent markdown file.

This script checks for common formatting errors that cause subagents
to fail validation and not be loaded by Claude Code.

Run: python validate_agent.py <path-to-agent-file.md>
"""

import sys
import re
from pathlib import Path


# Allowed color values
VALID_COLORS = {"red", "blue", "green", "yellow", "purple", "orange", "pink", "cyan"}

# Allowed model values
VALID_MODELS = {"sonnet", "opus", "haiku", "inherit"}

# Required frontmatter fields
REQUIRED_FIELDS = {"name", "description"}


def parse_frontmatter(content):
    """Parse YAML frontmatter from markdown content."""
    if not content.startswith("---"):
        return None, "File does not start with YAML frontmatter (---)"

    end_delimiter = content.find("\n---", 4)
    if end_delimiter == -1:
        return None, "No closing frontmatter delimiter (---) found"

    frontmatter_text = content[4:end_delimiter]
    body = content[end_delimiter + 4:]  # Skip past the closing ---

    # Parse simple YAML key-value pairs
    frontmatter = {}
    for line in frontmatter_text.strip().split("\n"):
        if ":" in line and not line.strip().startswith("#"):
            key, value = line.split(":", 1)
            key = key.strip()
            value = value.strip()
            # Remove quotes if present
            if value.startswith('"') and value.endswith('"'):
                value = value[1:-1]
            elif value.startswith("'") and value.endswith("'"):
                value = value[1:-1]
            frontmatter[key] = value

    return frontmatter, body


def check_literal_newlines(text, context=""):
    """Check for literal \n escape sequences in the text."""
    errors = []
    # Look for literal \n not followed by another backslash (which would be \\n)
    # We want to catch \n that would appear as actual escape sequences
    pattern = r'(?<!\\)(?:\\\\)*\\n'
    # Also check in YAML values with quotes
    if re.search(r'\\n', text):
        # Need to be more careful - check if it's a literal backslash-n
        # In YAML context, "value: Some text\n" is wrong
        # In markdown body, \n escape sequences are wrong
        lines = text.split('\n')
        for i, line in enumerate(lines, 1):
            # Look for literal \n in content (not in normal line breaks)
            if '\\n' in line and not line.strip().startswith('#'):
                # Check if this looks like an escaped newline rather than normal text
                if re.search(r'[^\\]\\n[^\\]|[^\\]\\n$', line):
                    errors.append(f"Line {i}: Found literal \\n escape sequence. Use actual newlines instead.")
    return errors


def validate_agent_file(filepath):
    """Validate a subagent markdown file."""
    errors = []
    warnings = []

    try:
        content = Path(filepath).read_text(encoding="utf-8")
    except FileNotFoundError:
        return None, ["File not found"]
    except Exception as e:
        return None, [f"Error reading file: {e}"]

    # Parse frontmatter
    frontmatter, body = parse_frontmatter(content)
    if frontmatter is None:
        return None, [body]  # body contains error message

    # Check required fields
    for field in REQUIRED_FIELDS:
        if field not in frontmatter:
            errors.append(f"Missing required field: {field}")

    # Check name format
    if "name" in frontmatter:
        name = frontmatter["name"]
        if not re.match(r'^[a-z0-9-]+$', name):
            errors.append(f"Invalid name '{name}': Must use only lowercase letters, numbers, and hyphens")

    # Check description is single line
    if "description" in frontmatter:
        desc = frontmatter["description"]
        if "\n" in desc:
            errors.append("Description field must be ONE continuous line with NO line breaks. Do not use | or > multi-line YAML syntax.")

    # Check for literal \n in frontmatter values
    for key, value in frontmatter.items():
        if isinstance(value, str):
            if '\\n' in value and key not in ["description"]:  # description already checked above
                if not value.strip().endswith("\\n") or value.count('\\n') > 1:
                    errors.append(f"Field '{key}' contains literal \\n. Use actual line breaks")

    # Check color if present
    if "color" in frontmatter:
        color = frontmatter["color"].lower()
        if color not in VALID_COLORS:
            errors.append(f"Invalid color '{frontmatter['color']}'. Must be one of: {', '.join(sorted(VALID_COLORS))}")

    # Check model if present
    if "model" in frontmatter:
        model = frontmatter["model"].lower()
        if model not in VALID_MODELS:
            errors.append(f"Invalid model '{frontmatter['model']}'. Must be one of: {', '.join(sorted(VALID_MODELS))}")

    # Check for common multi-line frontmatter issues
    frontmatter_section = content.split("\n---\n", 1)[0]
    if "description:" in frontmatter_section:
        desc_match = re.search(r'description:\s*[|>]', frontmatter_section)
        if desc_match:
            errors.append("Description field must be ONE continuous line with NO line breaks. Do not use | or > multi-line YAML syntax.")

    # Check body for literal \n
    if body:
        body_errors = check_literal_newlines(body)
        errors.extend(body_errors)

    # Check that tools is comma-separated if present
    if "tools" in frontmatter:
        tools = frontmatter["tools"]
        if "\n" in tools:
            errors.append("Tools field must be on a single line, comma-separated")

    # Check for whenToUse field (should be in body, not frontmatter for agent creation architect)
    if "whenToUse" in frontmatter or "whentouse" in frontmatter:
        warnings.append("whenToUse in frontmatter may not be standard for subagent files")

    return frontmatter, errors, warnings


def main():
    if len(sys.argv) < 2:
        print("Usage: python validate_agent.py <path-to-agent-file.md>")
        print("\nValidates a Claude Code subagent markdown file for:")
        print("  - Required frontmatter fields (name, description)")
        print("  - Single-line description (no multi-line)")
        print("  - No literal \\n escape sequences")
        print("  - Valid color values (if specified)")
        print("  - Valid model values (if specified)")
        sys.exit(1)

    filepath = sys.argv[1]

    result = validate_agent_file(filepath)

    if len(result) == 2:
        # Error occurred
        frontmatter, errors = result
        print(f"[FAIL] Validation FAILED: {filepath}")
        for error in errors:
            print(f"  - {error}")
        sys.exit(1)
    else:
        frontmatter, errors, warnings = result

    if errors:
        print(f"[FAIL] Validation FAILED: {filepath}")
        for error in errors:
            print(f"  - {error}")
        if warnings:
            print("\n[WARN] Warnings:")
            for warning in warnings:
                print(f"  - {warning}")
        sys.exit(1)
    else:
        print(f"[PASS] Validation PASSED: {filepath}")
        if frontmatter:
            print(f"\n   name: {frontmatter.get('name', 'N/A')}")
            desc = frontmatter.get('description', 'N/A')
            print(f"   description: {desc[:60]}{'...' if len(desc) > 60 else ''}")
        if warnings:
            print("\n[WARN] Warnings:")
            for warning in warnings:
                print(f"  - {warning}")
        sys.exit(0)


if __name__ == "__main__":
    main()
