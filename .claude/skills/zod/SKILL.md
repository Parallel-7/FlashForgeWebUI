---
name: zod
description: Comprehensive documentation and reference for Zod, the TypeScript-first schema validation library with static type inference. Use when working with Zod schemas, validation, type inference, error handling, or any Zod-related development tasks. Includes complete API documentation, usage guides, ecosystem integrations, package references, migration guides, and all official Zod documentation from both zod.dev and the GitHub repository.
---

# Zod

Comprehensive documentation and reference for Zod - TypeScript-first schema validation with static type inference.

## Overview

This skill provides complete access to all Zod documentation, including:
- Full API reference for all schema types and methods
- Usage guides and best practices
- Error handling and customization
- JSON Schema conversion and codecs
- Ecosystem integrations and tools
- Package documentation (zod, @zod/mini, @zod/core)
- Migration guides and changelogs
- Repository documentation and RFCs

Use this skill whenever you need to work with Zod for schema validation, type inference, data parsing, or integration with TypeScript projects.

## Quick Reference

### Core Documentation

For general Zod usage, consult these key references:

- **Getting started**: See `references/website/index.md` for introduction and installation
- **Basic usage**: See `references/website/basics.md` for fundamental concepts
- **Complete API**: See `references/website/api.md` for all schema types and methods
- **Error handling**: See `references/website/error-customization.md` and `references/website/error-formatting.md`

### New in Zod 4

- **Metadata & Registries**: See `references/website/metadata.md`
- **JSON Schema**: See `references/website/json-schema.md`
- **Codecs**: See `references/website/codecs.md`
- **Release notes**: See `references/website/v4.md`
- **Migration guide**: See `references/website/v4-changelog.md`

### Ecosystem & Integration

- **Ecosystem tools**: See `references/website/ecosystem.md` for libraries, form integrations, and tools
- **Library authors**: See `references/website/library-authors.md` for integration guidance

### Packages

- **Main package**: See `references/website/packages-zod.md`
- **Zod Mini**: See `references/website/packages-mini.md` (lightweight core)
- **Zod Core**: See `references/website/packages-core.md` (minimal core)

## Documentation Structure

All documentation is organized in the `references/` folder with the following structure:

### `references/website/`
Scraped documentation from https://zod.dev (16 files)
- Complete user-facing documentation in markdown format
- All guides, API references, and package documentation
- Most up-to-date and user-friendly format

### `references/repo/`
Extracted documentation from the GitHub repository (36 files)

#### `references/repo/website-v4/`
Source MDX files powering zod.dev (17 files)
- Original source files with full context
- Includes blog posts and detailed examples

#### `references/repo/website-v3/`
Legacy v3 documentation (8 files)
- Historical reference for v3 users
- Includes internationalized versions (Korean, Chinese)
- Migration guides from v3

#### `references/repo/root/`
Repository root documentation (5 files)
- README.md - Project overview
- CONTRIBUTING.md - Contribution guidelines
- CODE_OF_CONDUCT.md - Community guidelines
- AGENTS.md - AI agent guidelines
- CLAUDE.md - Claude-specific notes

#### `references/repo/packages/`
Package-specific documentation (5 files)
- Individual README files for each package

#### `references/repo/rfcs/`
Request for Comments (1 file)
- Proposals and design discussions

## Usage Patterns

### Schema Validation
When users need to validate data, create schemas, or infer types:
1. Start with `references/website/basics.md` for fundamental concepts
2. Reference `references/website/api.md` for specific schema types
3. Use `references/website/error-handling.md` for custom validation messages

### Error Handling
When users need to customize or format Zod errors:
1. See `references/website/error-customization.md` for custom error messages
2. See `references/website/error-formatting.md` for error formatting strategies

### Integration with Libraries
When users need to integrate Zod with other tools:
1. Check `references/website/ecosystem.md` for existing integrations
2. Reference `references/website/library-authors.md` for building integrations

### Migration and Versioning
When users are upgrading or migrating:
1. See `references/website/v4.md` for what's new in v4
2. Reference `references/website/v4-changelog.md` for migration steps
3. Consult `references/repo/website-v3/` for v3 documentation

### Advanced Features
For JSON Schema conversion, metadata, or codecs:
1. **JSON Schema**: `references/website/json-schema.md`
2. **Metadata**: `references/website/metadata.md`
3. **Codecs**: `references/website/codecs.md`

## Scripts

This skill includes utility scripts for maintaining and updating the documentation:

### `scripts/discover_pages.py`
Discovers all pages on zod.dev to scrape.
```bash
python scripts/discover_pages.py [output_file]
```

### `scripts/scrape_all_pages.py`
Scrapes all discovered pages and saves as markdown.
```bash
python scripts/scrape_all_pages.py <urls_file> <output_directory>
```

### `scripts/extract_repo_docs.py`
Extracts documentation from a cloned Zod repository.
```bash
python scripts/extract_repo_docs.py <repo_path> <output_directory>
```

These scripts are provided for documentation maintenance and updates, not for regular skill usage.

## Best Practices

1. **Start with website docs**: The `references/website/` files are the most polished and user-friendly
2. **Use repo docs for context**: When you need deeper understanding, consult the source MDX files in `references/repo/website-v4/`
3. **Check ecosystem first**: Before building custom solutions, check `references/website/ecosystem.md` for existing tools
4. **Reference API docs frequently**: The `references/website/api.md` file is comprehensive - use it as the authoritative source

## Coverage

This skill contains:
- ✅ Complete zod.dev documentation (all 16 pages)
- ✅ All website source files (v4 and v3)
- ✅ Repository documentation and guidelines
- ✅ Package-specific documentation
- ✅ Release notes and migration guides
- ✅ Ecosystem and integration guides
- ✅ RFCs and design documents

Total: 52 documentation files providing comprehensive coverage of Zod.
