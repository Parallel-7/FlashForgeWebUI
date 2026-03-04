#!/usr/bin/env python3
"""
Discover all pages on zod.dev based on navigation structure and sitemap.
Outputs a list of URLs to scrape.

Usage: python discover_pages.py [output_file]
"""

import sys
import json

def discover_zod_pages():
    """
    Returns a comprehensive list of all zod.dev pages to scrape.
    Based on the navigation structure from the website.
    """
    base_url = "https://zod.dev"

    pages = [
        # Main documentation pages
        "/",  # Intro/Home
        "/basics",  # Basic usage
        "/api",  # Defining schemas
        "/error-customization",  # Customizing errors
        "/error-formatting",  # Formatting errors
        "/metadata",  # Metadata and registries (New)
        "/json-schema",  # JSON Schema (New)
        "/codecs",  # Codecs (New)
        "/ecosystem",  # Ecosystem
        "/library-authors",  # For library authors

        # Zod 4 release pages
        "/v4",  # Release notes
        "/v4/changelog",  # Migration guide/changelog
        "/v4/versioning",  # Versioning info

        # Package pages
        "/packages/zod",
        "/packages/mini",  # Zod Mini (New)
        "/packages/core",  # Zod Core (New)
    ]

    # Convert to full URLs
    full_urls = [f"{base_url}{page}" if not page.startswith("http") else page for page in pages]

    return full_urls

def main():
    output_file = sys.argv[1] if len(sys.argv) > 1 else None

    pages = discover_zod_pages()

    if output_file:
        if output_file.endswith('.json'):
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(pages, f, indent=2)
            print(f"Discovered {len(pages)} pages, saved to {output_file}", file=sys.stderr)
        else:
            with open(output_file, 'w', encoding='utf-8') as f:
                for url in pages:
                    f.write(url + '\n')
            print(f"Discovered {len(pages)} pages, saved to {output_file}", file=sys.stderr)
    else:
        for url in pages:
            print(url)

    return pages

if __name__ == "__main__":
    main()
