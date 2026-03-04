#!/usr/bin/env python3
"""
Biome Documentation Scraper

This script scrapes and cleans Biome documentation from biomejs.dev.
It handles navigation removal, code block cleaning, and markdown optimization.

Usage:
    python scrape_biome_docs.py [--url URL] [--output DIR] [--update-all]

Examples:
    # Scrape a single page
    python scrape_biome_docs.py --url https://biomejs.dev/reference/cli

    # Update all documentation
    python scrape_biome_docs.py --update-all --output ./references/docs
"""

import os
import sys
import re
import argparse
import time
import subprocess
from pathlib import Path

# URLs for all Biome documentation pages
BIOME_DOCS_URLS = [
    "https://biomejs.dev/analyzer/suppressions",
    "https://biomejs.dev/assist",
    "https://biomejs.dev/assist/css/actions",
    "https://biomejs.dev/assist/css/sources",
    "https://biomejs.dev/assist/graphql/actions",
    "https://biomejs.dev/assist/graphql/sources",
    "https://biomejs.dev/assist/javascript/actions",
    "https://biomejs.dev/assist/javascript/sources",
    "https://biomejs.dev/assist/json/actions",
    "https://biomejs.dev/assist/json/sources",
    "https://biomejs.dev/formatter",
    "https://biomejs.dev/formatter/differences-with-prettier",
    "https://biomejs.dev/formatter/option-philosophy",
    "https://biomejs.dev/guides/big-projects",
    "https://biomejs.dev/guides/configure-biome",
    "https://biomejs.dev/guides/editors/create-an-extension",
    "https://biomejs.dev/guides/editors/first-party-extensions",
    "https://biomejs.dev/guides/editors/third-party-extensions",
    "https://biomejs.dev/guides/getting-started",
    "https://biomejs.dev/guides/integrate-in-vcs",
    "https://biomejs.dev/guides/investigate-slowness",
    "https://biomejs.dev/guides/manual-installation",
    "https://biomejs.dev/guides/migrate-eslint-prettier",
    "https://biomejs.dev/guides/upgrade-to-biome-v2",
    "https://biomejs.dev/internals/architecture",
    "https://biomejs.dev/internals/changelog",
    "https://biomejs.dev/internals/changelog_v1",
    "https://biomejs.dev/internals/language-support",
    "https://biomejs.dev/internals/people-and-credits",
    "https://biomejs.dev/internals/philosophy",
    "https://biomejs.dev/internals/versioning",
    "https://biomejs.dev/linter",
    "https://biomejs.dev/linter/css/rules",
    "https://biomejs.dev/linter/css/sources",
    "https://biomejs.dev/linter/domains",
    "https://biomejs.dev/linter/graphql/rules",
    "https://biomejs.dev/linter/graphql/sources",
    "https://biomejs.dev/linter/html/rules",
    "https://biomejs.dev/linter/html/sources",
    "https://biomejs.dev/linter/javascript/rules",
    "https://biomejs.dev/linter/javascript/sources",
    "https://biomejs.dev/linter/json/rules",
    "https://biomejs.dev/linter/json/sources",
    "https://biomejs.dev/linter/plugins",
    "https://biomejs.dev/recipes/badges",
    "https://biomejs.dev/recipes/continuous-integration",
    "https://biomejs.dev/recipes/git-hooks",
    "https://biomejs.dev/recipes/renovate",
    "https://biomejs.dev/reference/cli",
    "https://biomejs.dev/reference/configuration",
    "https://biomejs.dev/reference/diagnostics",
    "https://biomejs.dev/reference/environment-variables",
    "https://biomejs.dev/reference/gritql",
    "https://biomejs.dev/reference/reporters",
    "https://biomejs.dev/reference/vscode",
    "https://biomejs.dev/reference/zed",
]


def scrape_url(url):
    """Scrape a URL using cloudscraper"""
    try:
        import cloudscraper
        from markdownify import markdownify as md
    except ImportError:
        print("Error: Required packages not installed.", file=sys.stderr)
        print("Install with: pip install cloudscraper markdownify beautifulsoup4 brotli --break-system-packages", file=sys.stderr)
        return None

    scraper = cloudscraper.create_scraper(
        browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True},
        delay=1,
        allow_brotli=True
    )

    headers = {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }

    try:
        response = scraper.get(url, headers=headers, stream=False, timeout=30)
        content_type = response.headers.get('content-type', '')

        if 'text' in content_type or 'html' in content_type:
            content = response.text
            if 'html' in content_type:
                content = md(content, heading_style="ATX")
            return content
        return None
    except Exception as e:
        print(f"Error scraping {url}: {e}", file=sys.stderr)
        return None


def clean_code_block(block_lines):
    """Clean code blocks by removing line numbers and excessive blank lines"""
    if len(block_lines) < 2:
        return block_lines

    opening = block_lines[0]
    closing = block_lines[-1]
    content_lines = block_lines[1:-1]

    cleaned_content = []
    i = 0
    while i < len(content_lines):
        line = content_lines[i]

        # Skip standalone line numbers
        if line.strip().isdigit() and len(line.strip()) <= 3:
            i += 1
            while i < len(content_lines) and content_lines[i].strip() == '':
                i += 1
            continue

        # Reduce excessive blank lines
        if line.strip() == '':
            if i + 1 < len(content_lines) and content_lines[i + 1].strip() == '':
                i += 1
                continue

        cleaned_content.append(line)
        i += 1

    return [opening] + cleaned_content + [closing]


def clean_markdown(content):
    """Clean Biome documentation markdown"""
    lines = content.split('\n')
    cleaned_lines = []
    in_code_block = False
    found_main_heading = False
    skip_until_blank = False
    code_block_buffer = []

    i = 0
    while i < len(lines):
        line = lines[i]

        if line.strip().startswith('```'):
            if not in_code_block:
                in_code_block = True
                code_block_buffer = [line]
            else:
                in_code_block = False
                code_block_buffer.append(line)
                cleaned_block = clean_code_block(code_block_buffer)
                cleaned_lines.extend(cleaned_block)
                code_block_buffer = []
            i += 1
            continue

        if in_code_block:
            code_block_buffer.append(line)
            i += 1
            continue

        if not found_main_heading:
            if line.startswith('# '):
                found_main_heading = True
                cleaned_lines.append(line)
            i += 1
            continue

        # Skip unwanted content
        if (line.strip() == '## On this page' or
            re.match(r'\[Section titled [^\]]+\]\(#[^\)]+\)', line.strip()) or
            line.strip().startswith('[Edit page](') or
            '[Previous' in line or '[Next' in line or
            'Sponsored by' in line or
            ('Copyright (c)' in line and 'Biome' in line) or
            'depot-logo' in line or '/_astro/' in line):
            if '[Previous' in line or 'Sponsored by' in line:
                skip_until_blank = True
            i += 1
            continue

        if skip_until_blank:
            if line.strip() == '':
                skip_until_blank = False
            i += 1
            continue

        cleaned_lines.append(line)
        i += 1

    result = '\n'.join(cleaned_lines)
    result = re.sub(r'\n{4,}', '\n\n\n', result)
    result = '\n'.join(line.rstrip() for line in result.split('\n'))
    return result.strip() + '\n'


def url_to_filename(url):
    """Convert URL to safe filename"""
    path = url.replace('https://biomejs.dev/', '')
    filename = path.replace('/', '_').replace('#', '_') + '.md'
    if filename.startswith('_'):
        filename = filename[1:]
    return filename


def scrape_and_save(url, output_dir):
    """Scrape URL and save cleaned markdown"""
    print(f"Scraping {url}...")
    content = scrape_url(url)

    if not content:
        return False

    cleaned = clean_markdown(content)
    filename = url_to_filename(url)
    output_path = os.path.join(output_dir, filename)

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(cleaned)

    size_kb = len(cleaned) / 1024
    print(f"  Saved to {filename} ({size_kb:.1f} KB)")
    return True


def main():
    parser = argparse.ArgumentParser(description='Scrape Biome documentation')
    parser.add_argument('--url', help='Single URL to scrape')
    parser.add_argument('--output', default='./docs', help='Output directory')
    parser.add_argument('--update-all', action='store_true', help='Update all documentation')

    args = parser.parse_args()

    os.makedirs(args.output, exist_ok=True)

    if args.update_all:
        print(f"Updating all Biome documentation to {args.output}")
        print(f"Total pages: {len(BIOME_DOCS_URLS)}\n")

        successful = 0
        failed = 0

        for i, url in enumerate(BIOME_DOCS_URLS, 1):
            print(f"[{i}/{len(BIOME_DOCS_URLS)}] ", end='')
            if scrape_and_save(url, args.output):
                successful += 1
            else:
                failed += 1
            time.sleep(0.5)

        print(f"\nComplete: {successful} successful, {failed} failed")

    elif args.url:
        scrape_and_save(args.url, args.output)

    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
