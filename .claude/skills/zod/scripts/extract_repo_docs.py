#!/usr/bin/env python3
"""
Extract all documentation files from the cloned Zod GitHub repository.
Organizes files into a structured directory for the skill's reference folder.

Usage: python extract_repo_docs.py <repo_path> <output_directory>
"""

import sys
import os
import shutil
from pathlib import Path

def copy_file_with_structure(src_path, repo_root, output_dir, relative_to=None):
    """
    Copy a file maintaining its relative directory structure.

    Args:
        src_path: Source file path
        repo_root: Root of the repository
        output_dir: Output directory base
        relative_to: Optional path to calculate relative path from (defaults to repo_root)
    """
    src = Path(src_path)
    repo = Path(repo_root)
    out = Path(output_dir)

    # Calculate relative path
    if relative_to:
        rel = src.relative_to(Path(relative_to))
    else:
        rel = src.relative_to(repo)

    # Create destination path
    dest = out / rel

    # Create parent directories
    dest.parent.mkdir(parents=True, exist_ok=True)

    # Copy the file
    shutil.copy2(src, dest)

    return dest

def extract_docs(repo_path, output_dir):
    """
    Extract all documentation from the Zod repository.

    Args:
        repo_path: Path to the cloned Zod repository
        output_dir: Path to output directory
    """
    repo = Path(repo_path)
    out = Path(output_dir)

    # Create main output directory
    out.mkdir(parents=True, exist_ok=True)

    stats = {
        'website_docs': 0,
        'website_v3_docs': 0,
        'root_docs': 0,
        'package_docs': 0,
        'rfcs': 0,
    }

    print("Extracting documentation from Zod repository...\n", file=sys.stderr)

    # 1. Extract website documentation (v4 - current)
    website_docs = repo / "packages" / "docs" / "content"
    if website_docs.exists():
        print("Extracting website documentation (v4)...", file=sys.stderr)
        website_out = out / "website-v4"
        website_out.mkdir(parents=True, exist_ok=True)

        for mdx_file in website_docs.rglob("*.mdx"):
            dest = copy_file_with_structure(mdx_file, repo, website_out, relative_to=website_docs)
            print(f"  -> {mdx_file.relative_to(repo)} => {dest.relative_to(out)}", file=sys.stderr)
            stats['website_docs'] += 1

    # 2. Extract v3 documentation
    v3_docs = repo / "packages" / "docs-v3"
    if v3_docs.exists():
        print("\nExtracting website documentation (v3)...", file=sys.stderr)
        v3_out = out / "website-v3"
        v3_out.mkdir(parents=True, exist_ok=True)

        for md_file in v3_docs.glob("*.md"):
            # Skip node_modules and hidden files
            if 'node_modules' not in str(md_file) and not md_file.name.startswith('.'):
                dest = copy_file_with_structure(md_file, repo, v3_out, relative_to=v3_docs)
                print(f"  -> {md_file.relative_to(repo)} => {dest.relative_to(out)}", file=sys.stderr)
                stats['website_v3_docs'] += 1

    # 3. Extract root-level documentation
    print("\nExtracting root-level documentation...", file=sys.stderr)
    root_out = out / "root"
    root_out.mkdir(parents=True, exist_ok=True)

    root_docs = [
        "README.md",
        "CONTRIBUTING.md",
        "CODE_OF_CONDUCT.md",
        "AGENTS.md",
        "CLAUDE.md",
    ]

    for doc in root_docs:
        doc_path = repo / doc
        if doc_path.exists():
            dest = root_out / doc
            shutil.copy2(doc_path, dest)
            print(f"  -> {doc} => {dest.relative_to(out)}", file=sys.stderr)
            stats['root_docs'] += 1

    # 4. Extract package-specific documentation
    print("\nExtracting package documentation...", file=sys.stderr)
    packages_out = out / "packages"
    packages_out.mkdir(parents=True, exist_ok=True)

    packages_dir = repo / "packages"
    if packages_dir.exists():
        for package_dir in packages_dir.iterdir():
            if package_dir.is_dir() and not package_dir.name.startswith('.'):
                # Look for README.md in each package
                readme = package_dir / "README.md"
                if readme.exists():
                    dest = packages_out / package_dir.name / "README.md"
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(readme, dest)
                    print(f"  -> {readme.relative_to(repo)} => {dest.relative_to(out)}", file=sys.stderr)
                    stats['package_docs'] += 1

    # 5. Extract RFCs
    rfcs_dir = repo / "rfcs"
    if rfcs_dir.exists():
        print("\nExtracting RFCs...", file=sys.stderr)
        rfcs_out = out / "rfcs"
        rfcs_out.mkdir(parents=True, exist_ok=True)

        for rfc_file in rfcs_dir.rglob("*.md"):
            if 'node_modules' not in str(rfc_file):
                dest = copy_file_with_structure(rfc_file, repo, rfcs_out, relative_to=rfcs_dir)
                print(f"  -> {rfc_file.relative_to(repo)} => {dest.relative_to(out)}", file=sys.stderr)
                stats['rfcs'] += 1

    # Print summary
    print("\n" + "="*60, file=sys.stderr)
    print("Extraction complete!", file=sys.stderr)
    print("="*60, file=sys.stderr)
    print(f"Website docs (v4):    {stats['website_docs']} files", file=sys.stderr)
    print(f"Website docs (v3):    {stats['website_v3_docs']} files", file=sys.stderr)
    print(f"Root documentation:   {stats['root_docs']} files", file=sys.stderr)
    print(f"Package documentation: {stats['package_docs']} files", file=sys.stderr)
    print(f"RFCs:                 {stats['rfcs']} files", file=sys.stderr)
    print(f"Total:                {sum(stats.values())} files", file=sys.stderr)
    print("="*60, file=sys.stderr)

    return stats

def main():
    if len(sys.argv) < 3:
        print("Usage: extract_repo_docs.py <repo_path> <output_directory>", file=sys.stderr)
        print("\nExample:", file=sys.stderr)
        print("  python extract_repo_docs.py ../../zod-repo ../references/repo", file=sys.stderr)
        sys.exit(1)

    repo_path = sys.argv[1]
    output_dir = sys.argv[2]

    if not os.path.isdir(repo_path):
        print(f"Error: Repository path '{repo_path}' does not exist or is not a directory", file=sys.stderr)
        sys.exit(1)

    extract_docs(repo_path, output_dir)

if __name__ == "__main__":
    main()
