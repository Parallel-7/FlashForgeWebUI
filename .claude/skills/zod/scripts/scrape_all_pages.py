#!/usr/bin/env python3
"""
Scrape all discovered zod.dev pages and save them as markdown files.
Uses cloudscraper to bypass Cloudflare protection.

Usage: python scrape_all_pages.py <urls_file> <output_directory>
"""

import sys
import os
import time
import re
import cloudscraper
from markdownify import markdownify as md
from pathlib import Path

# Hop-by-hop headers that should be removed
HOP_BY_HOP_HEADERS = {
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailers', 'transfer-encoding', 'upgrade',
}

def clean_headers(headers):
    """Remove hop-by-hop headers"""
    cleaned = {}
    for name, value in headers.items():
        if name.lower() not in HOP_BY_HOP_HEADERS:
            cleaned[name] = value
    cleaned.pop('content-encoding', None)
    cleaned.pop('content-length', None)
    return cleaned

def get_headers():
    """Get default headers for requests"""
    return {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
    }

def generate_origin_and_ref(url):
    """Generate origin and referrer from URL"""
    parts = url.split('/')
    protocol = parts[0]
    domain = parts[2]
    base_url = f"{protocol}//{domain}/"
    return base_url, base_url

def clean_html_to_markdown(html_content):
    """Convert HTML content to clean markdown format"""
    try:
        markdown_content = md(html_content, heading_style="ATX")
        return markdown_content
    except Exception as e:
        print(f"Warning: Error converting HTML to markdown: {str(e)}", file=sys.stderr)
        return html_content

def scrape_url(url, scraper):
    """
    Scrape a URL using cloudscraper to bypass Cloudflare protection.

    Args:
        url: The URL to scrape
        scraper: The cloudscraper instance to use

    Returns:
        String containing the page content as markdown
    """
    # Prepare headers
    headers = get_headers()
    origin, ref = generate_origin_and_ref(url)
    headers['Origin'] = origin
    headers['Referer'] = ref

    # Make the request
    response = scraper.get(url, headers=headers, stream=False)

    # Get content type
    content_type = response.headers.get('content-type', '')

    # Handle different content types
    if 'text' in content_type or 'html' in content_type:
        content = response.text
        # Clean HTML to markdown
        if 'html' in content_type:
            content = clean_html_to_markdown(content)
    else:
        # For binary content, return a message
        return f"[Binary content - {len(response.content)} bytes - Content-Type: {content_type}]"

    return content

def url_to_filename(url, base_url="https://zod.dev"):
    """
    Convert a URL to a safe filename.

    Examples:
        https://zod.dev/ -> index.md
        https://zod.dev/api -> api.md
        https://zod.dev/v4/changelog -> v4-changelog.md
        https://zod.dev/packages/core -> packages-core.md
    """
    # Remove base URL
    path = url.replace(base_url, "").strip('/')

    # Handle root/index
    if not path:
        return "index.md"

    # Replace slashes with hyphens and ensure .md extension
    filename = path.replace('/', '-') + '.md'

    # Remove any characters that aren't alphanumeric, hyphen, underscore, or dot
    filename = re.sub(r'[^a-zA-Z0-9\-_.]', '-', filename)

    return filename

def load_urls(urls_file):
    """Load URLs from a file (one per line or JSON array)"""
    with open(urls_file, 'r', encoding='utf-8') as f:
        content = f.read().strip()

        # Try to parse as JSON first
        if content.startswith('['):
            import json
            return json.loads(content)
        else:
            # Parse as line-separated URLs
            return [line.strip() for line in content.split('\n') if line.strip()]

def main():
    if len(sys.argv) < 3:
        print("Usage: scrape_all_pages.py <urls_file> <output_directory>", file=sys.stderr)
        print("\nExample:", file=sys.stderr)
        print("  python scrape_all_pages.py urls.txt ../references/website", file=sys.stderr)
        sys.exit(1)

    urls_file = sys.argv[1]
    output_dir = sys.argv[2]

    # Create output directory if it doesn't exist
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # Load URLs to scrape
    urls = load_urls(urls_file)
    print(f"Loaded {len(urls)} URLs to scrape", file=sys.stderr)

    # Initialize cloudscraper once for all requests
    scraper = cloudscraper.create_scraper(
        browser={
            'browser': 'chrome',
            'platform': 'windows',
            'desktop': True
        },
        delay=1,
        allow_brotli=True
    )

    # Scrape each URL
    successful = 0
    failed = 0

    for i, url in enumerate(urls, 1):
        try:
            print(f"[{i}/{len(urls)}] Scraping {url}...", file=sys.stderr)

            content = scrape_url(url, scraper)
            filename = url_to_filename(url)
            output_path = os.path.join(output_dir, filename)

            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(content)

            print(f"  -> Saved to {output_path}", file=sys.stderr)
            successful += 1

            # Be polite, add a small delay between requests
            if i < len(urls):
                time.sleep(1)

        except Exception as e:
            print(f"  -> Error: {str(e)}", file=sys.stderr)
            failed += 1

    print(f"\nCompleted: {successful} successful, {failed} failed", file=sys.stderr)

if __name__ == "__main__":
    main()
