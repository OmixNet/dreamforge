// DREAMFORGE_SLIM: std::fs 物理删除 (PR 7, refresh_cloned_vault_config_files 删后无 user)
use std::path::{Path, PathBuf};

// DREAMFORGE_SLIM: GETTING_STARTED_REPO_URL const 物理删除 (PR 7, create_getting_started_vault 已删)

/// Default location for the Getting Started vault.
pub fn default_vault_path() -> Result<PathBuf, String> {
    documents_dir()
        .map(|d| d.join("Getting Started"))
        .ok_or_else(|| "Could not determine Documents directory".to_string())
}

fn documents_dir() -> Option<PathBuf> {
    dirs::document_dir().or_else(|| dirs::home_dir().map(|home| home.join("Documents")))
}

const GETTING_STARTED_REQUIRED_CONFIG_FILES: [&str; 2] = ["type.md", "note.md"];
const GETTING_STARTED_TEMPLATE_MARKERS: [&str; 2] = ["welcome.md", "views/active-projects.yml"];

/// Check whether a vault path exists on disk.
pub fn vault_exists(path: &str) -> bool {
    let default_path = default_vault_path().ok();
    vault_exists_with_default_path(Path::new(path), default_path.as_deref())
}

fn vault_exists_with_default_path(path: &Path, default_path: Option<&Path>) -> bool {
    if !path.is_dir() {
        return false;
    }

    if !is_canonical_getting_started_path(path, default_path) {
        return true;
    }

    canonical_getting_started_vault_exists(path)
}

fn is_canonical_getting_started_path(path: &Path, default_path: Option<&Path>) -> bool {
    default_path.is_some_and(|candidate| candidate == path)
}

fn canonical_getting_started_vault_exists(path: &Path) -> bool {
    has_getting_started_config_files(path) && has_getting_started_template_marker(path)
}

fn has_getting_started_config_files(path: &Path) -> bool {
    GETTING_STARTED_REQUIRED_CONFIG_FILES
        .iter()
        .all(|file| path.join(file).is_file())
}

fn has_getting_started_template_marker(path: &Path) -> bool {
    GETTING_STARTED_TEMPLATE_MARKERS
        .iter()
        .any(|file| path.join(file).is_file())
}

/// Previous default AGENTS.md content seeded by Tolaria itself. Existing vaults
/// can still contain this exact text, so Tolaria treats it as managed content
/// that is safe to refresh automatically.
const STALE_AGENTS_MD: &str = r##"# AGENTS.md — Tolaria Vault

This is a [Tolaria](https://github.com/refactoringhq/tolaria) vault - a folder of markdown files with YAML frontmatter forming a personal knowledge graph.

Keep edits compatible with Tolaria's current conventions. Prefer small, human-readable changes over heavy restructuring.

## Core rules

- One markdown note per file.
- The first H1 in the body is the note title. Do not add `title:` frontmatter.
- Most notes live at the vault root as flat `.md` files. Type definitions live in `type/`. Saved views live in `views/`.
- Use wikilinks for note-to-note references, both in frontmatter and in the body.
- Frontmatter properties that start with `_` are usually Tolaria-managed state. Leave them alone unless the user explicitly asks for them to change.

## Notes

```yaml
---
type: Project
status: Active
belongs_to:
  - "[[area-operations]]"
related_to:
  - "[[goal-q2-launch]]"
---

# Q2 Launch Plan

Body content in markdown.
```

Tolaria still understands some legacy aliases such as `Is A`, but prefer `type:` for new or edited notes.

## Types

Type definitions are regular notes stored in `type/`. Use `type: Type` in frontmatter:

```yaml
---
type: Type
icon: books
color: blue
order: 20
sidebar label: Projects
---

# Project
```

Useful type metadata includes `icon`, `color`, `order`, `sidebar label`, `template`, `sort`, `view`, and `visible`.

## Relationships

Any frontmatter property whose value is a wikilink is treated as a relationship. Common names include `belongs_to`, `related_to`, and `has`, but custom relationship names are valid too.

## Wikilinks

- `[[filename]]` or `[[Note Title]]` - link by filename or title
- `[[filename|display text]]` - with custom display text
- Works in frontmatter values and markdown body

## Views

Saved filters live in `views/` as `.view.json` files:

```json
{
  "title": "Active Notes",
  "filters": [
    {"property": "type", "operator": "equals", "value": "Note"},
    {"property": "status", "operator": "equals", "value": "Active"}
  ],
  "sort": {"property": "title", "direction": "asc"}
}
```

## Filenames

Use kebab-case: `my-note-title.md`. One note per file.

## What agents should do

- Create and edit notes using the frontmatter and H1 conventions above.
- Create and edit type documents in `type/`.
- Add or modify relationships without breaking existing wikilinks.
- Create and edit saved views in `views/`.
- Update `AGENTS.md` only when the user asks for agent guidance changes.

## What agents should avoid

- Do not infer note type from folders other than the dedicated `type/` directory for type definitions.
- Do not silently overwrite an existing custom `AGENTS.md`.
- Do not rewrite installation-specific app config unless the user explicitly asks.
"##;

/// Older Tolaria-managed AGENTS.md content from before the `type:` migration.
/// Existing vaults can still contain this exact text, so Tolaria treats it as
/// managed content that is safe to refresh automatically.
const PRE_TYPE_AGENTS_MD: &str = r##"# AGENTS.md — Tolaria Vault

This is a [Tolaria](https://github.com/refactoringhq/tolaria) vault — a folder of markdown files with YAML frontmatter forming a personal knowledge graph.

## Note structure

Every note is a markdown file. The **first H1 heading in the body is the title** — there is no `title:` frontmatter field.

```yaml
---
is_a: TypeName        # the note's type (must match the title of a type file in the vault)
url: https://...      # example property
belongs_to: "[[other-note]]"
related_to:
  - "[[note-a]]"
  - "[[note-b]]"
---

# Note Title

Body content in markdown.
```

System properties are prefixed with `_` (e.g. `_organized`, `_pinned`, `_icon`) — these are app-managed, do not set or show them to users unless specifically asked.

## Types

A type is a note with `is_a: Type`. Type files live in the vault root:

```yaml
---
is_a: Type
_icon: books          # Phosphor icon name in kebab-case
_color: "#8b5cf6"     # hex color
---

# TypeName
```

To find what types exist: look for files with `is_a: Type` in the vault root.

## Relationships

Any frontmatter property whose value is a wikilink is a relationship. Backlinks are computed automatically.

Standard names: `belongs_to`, `related_to`, `has`. Custom names are valid.

## Wikilinks

- `[[filename]]` or `[[Note Title]]` — link by filename or title
- `[[filename|display text]]` — with custom display text
- Works in frontmatter values and markdown body

## Views

Saved filters live in `views/` as `.view.json` files:

```json
{
  "title": "Active Notes",
  "filters": [
    {"property": "is_a", "operator": "equals", "value": "Note"},
    {"property": "status", "operator": "equals", "value": "Active"}
  ],
  "sort": {"property": "title", "direction": "asc"}
}
```

## Filenames

Use kebab-case: `my-note-title.md`. One note per file.

## What you can do

- Create/edit notes with correct frontmatter and H1 title
- Create new type files
- Add or modify relationships
- Create/edit views in `views/`
- Edit `AGENTS.md` (this file)

Do not modify app configuration files — those are local to each installation.
"##;

// DREAMFORGE_SLIM: 4 const + AgentsContent::contains/contains_all/has_stale_title_stub/has_legacy_json_view_guidance/can_be_refreshed 物理删除 (PR 7, agents_content_can_be_refreshed 唯一 caller refresh_cloned_vault_config_files 即将 dead)

struct AgentsContent<'a>(&'a str);

impl<'a> AgentsContent<'a> {
    fn new(content: &'a str) -> Self {
        Self(content)
    }

    fn is_known_legacy_template(&self) -> bool {
        self.0.trim().is_empty()
            || self.0 == PRE_TYPE_AGENTS_MD
            || self.0 == LEGACY_AGENTS_MD
            || self.0 == STALE_AGENTS_MD
    }
}

// DREAMFORGE_SLIM: agents_content_can_be_refreshed fn 物理删除 (PR 7, 唯一 caller refresh_cloned_vault_config_files 即将 dead)

pub(super) fn agents_content_is_known_managed_template(content: &str) -> bool {
    AgentsContent::new(content).is_known_legacy_template()
}

/// Default AGENTS.md content — vault instructions for AI agents.
/// Describes Tolaria vault mechanics only; no user-specific structure.
/// The vault scanner will pick this up as a regular entry.
pub(super) const AGENTS_MD: &str = r##"---
type: Note
_organized: true
---

# AGENTS.md — Tolaria Vault

This is a [Tolaria](https://github.com/refactoringhq/tolaria) vault.

Keep this file focused on vault-specific conventions. For general Tolaria behavior, use the bundled Tolaria agent docs path provided by the app session context.

## Core conventions

- Notes are Markdown files.
- Use the first H1 as the note title. Tolaria uses this title in the note list, wikilinks, search, and other display surfaces.
- Store note type in the `type:` frontmatter field.
- Use wikilinks in body text and frontmatter fields to connect notes.
- Prefer types and relationships for organization. Folder structure is optional and should not be treated as the primary source of meaning.
- Tolaria reads notes recursively from all folders and stores new notes in the vault root by default.
- Saved views live in `views/*.yml`.
- Files in `attachments/` are assets, not notes. Reference them from notes, but do not treat them as notes or types.
- Frontmatter properties that start with `_` are usually Tolaria-managed state. Leave them alone unless the user explicitly asks for them to change.

## Notes

```yaml
---
type: Note
related_to: "[[tolaria]]"
status: Active
url: https://example.com
---

# Example note

Body content in Markdown.
```

## Types

Types are regular notes with `type: Type`. They define how notes of that type appear and which properties or relationships should be suggested for new notes.

```yaml
---
type: Type
_icon: rocket
_color: "#3b82f6"
_order: 0
_list_properties_display:
  - related_to
_sort: "property:onboarding:asc"
---

# Project
```

Empty properties and relationships in a type document become placeholders on new notes of that type. Values attached to properties in the type document become defaults for type instances.

Useful type metadata includes `icon`/`_icon`, `color`/`_color`, `order`/`_order`, `sidebar label`, `_list_properties_display`, `_sort`, `template`, `view`, and `visible`. When editing an existing file, preserve the key style already used there instead of mass-normalizing underscored keys.

## Relationships

Any frontmatter property whose value contains `[[wikilinks]]` is treated as a relationship. Common relationship keys include `related_to`, `belongs_to`, and `has`, but custom relationship names are valid too.

Preserve older relationship labels such as `Belongs to:` when editing existing notes that already use them.

Use quoted wikilinks for scalar frontmatter values and YAML lists for multi-value relationships.

## Wikilinks

- `[[filename]]` or `[[Note Title]]` for normal links
- `[[filename|display text]]` for custom display text
- Works in frontmatter values and Markdown body

## Views

Saved views live in `views/*.yml` and are written as YAML. Tolaria scans every `.yml` file in `views/`, and the filename is the stable view id, so use kebab-case filenames such as `active-projects.yml`.

A view definition looks like this:

```yaml
name: Active Projects
icon: null
color: null
sort: "property:onboarding:asc"
filters:
  any:
    - field: type
      op: equals
      value: Project
    - field: related_to
      op: contains
      value: "[[tolaria]]"
```

View rules that matter when creating or editing files:
- `name` is required. `icon`, `color`, and `sort` are optional.
- `sort` uses `option:direction`. Built-in options are `modified`, `created`, `title`, and `status`. Custom-property sorts use `property:<Property Name>`, for example `property:onboarding:asc`.
- `filters` must be a tree whose root is exactly one `all:` group or one `any:` group.
- Each filter condition uses `field`, `op`, and usually `value`.
- `field` can target built-ins like `type`, `status`, `title`, `favorite`, and `body`, plus actual frontmatter keys used in this vault such as `related_to`, `belongs_to`, or `url`.
- Supported operators are `equals`, `not_equals`, `contains`, `not_contains`, `any_of`, `none_of`, `is_empty`, `is_not_empty`, `before`, and `after`.
- `any_of` and `none_of` expect `value` to be a YAML list.
- `regex: true` is supported with `equals`, `not_equals`, `contains`, and `not_contains` when pattern matching is needed.
- Relationship filters can use wikilinks in `value`, for example `"[[tolaria]]"`.
- Do not create JSON view files or `.view.json` filenames.

## Filenames

Use kebab-case: `my-note-title.md`. One note per file.

## What agents should do

- Create and edit notes using the frontmatter and H1 conventions above.
- Create and edit type documents when the user asks for note categories or defaults.
- Add or modify relationships without breaking existing wikilinks.
- Create and edit saved views in `views/`.
- Update `AGENTS.md` only when the user asks for vault-level guidance changes.
- Search the bundled Tolaria docs when the user asks how Tolaria works or when you need product behavior beyond these base conventions.
- Use Portent as the default best-practice model when the user asks how to improve, organize, or restructure the knowledge base. Combine Portent's types, relationships, and capture -> organize -> archive lifecycle with Tolaria's type documents, properties, Inbox, archive, and saved views.

## What agents should avoid

- Do not infer note type or meaning from folders.
- Do not treat files in `attachments/` as notes, types, or view definitions.
- Do not silently overwrite an existing custom `AGENTS.md`.
- Do not rewrite installation-specific app configuration unless the user explicitly asks.
"##;

pub(super) const LEGACY_AGENTS_MD: &str = r##"# AGENTS.md — Tolaria Vault

This is a [Tolaria](https://github.com/refactoringhq/tolaria) vault — a folder of markdown files with YAML frontmatter forming a personal knowledge graph.

## Note structure

Every note is a markdown file. The **first H1 heading in the body is the title** — there is no `title:` frontmatter field.

```yaml
---
type: TypeName        # the note's type (must match the title of a type file in the vault)
url: https://...      # example property
belongs_to: "[[other-note]]"
related_to:
  - "[[note-a]]"
  - "[[note-b]]"
---

# Note Title

Body content in markdown.
```

System properties are prefixed with `_` (e.g. `_organized`, `_pinned`, `_icon`) — these are app-managed, do not set or show them to users unless specifically asked.

## Types

A type is a note with `type: Type`. Type files live in the vault root:

```yaml
---
type: Type
_icon: books          # Phosphor icon name in kebab-case
_color: "#8b5cf6"     # hex color
---

# TypeName
```

To find what types exist: look for files with `type: Type` in the vault root.

## Relationships

Any frontmatter property whose value is a wikilink is a relationship. Backlinks are computed automatically.

Standard names: `belongs_to`, `related_to`, `has`. Custom names are valid.

## Wikilinks

- `[[filename]]` or `[[Note Title]]` — link by filename or title
- `[[filename|display text]]` — with custom display text
- Works in frontmatter values and markdown body

## Views

Saved filters live in `views/` as `.view.json` files:

```json
{
  "title": "Active Notes",
  "filters": [
    {"property": "type", "operator": "equals", "value": "Note"},
    {"property": "status", "operator": "equals", "value": "Active"}
  ],
  "sort": {"property": "title", "direction": "asc"}
}
```

## Filenames

Use kebab-case: `my-note-title.md`. One note per file.

## What you can do

- Create/edit notes with correct frontmatter and H1 title
- Create new type files
- Add or modify relationships
- Create/edit views in `views/`
- Edit `AGENTS.md` (this file)

Do not modify app configuration files — those are local to each installation.
"##;

/// Clone the public starter vault into the requested path.
// DREAMFORGE_SLIM: create_getting_started_vault 物理删除 (PR 7, commands::create_getting_started_vault 已删)
// DREAMFORGE_SLIM: 6 个 dead fn 物理删除 (PR 7)
//   create_getting_started_vault_from_repo / getting_started_repo_url
//   canonical_vault_path / path_to_utf8 / refresh_cloned_vault_config_files / vault_has_pending_changes
//   全部依赖 crate::git::clone_repo (PR 7 也 dead) + agents_content_can_be_refreshed (PR 7 刚 dead)

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;
    // DREAMFORGE_SLIM: StdCommand + init_source_repo 物理删除 (PR 7, 6 个 dead test 全用 init_source_repo)

    fn write_tolaria_config_files(path: &Path) {
        fs::create_dir_all(path).unwrap();
        fs::write(path.join("AGENTS.md"), AGENTS_MD).unwrap();
        fs::write(path.join("type.md"), "# Type\n").unwrap();
        fs::write(path.join("note.md"), "# Note\n").unwrap();
    }

    // DREAMFORGE_SLIM: 6 dead test + 1 dead helper 物理删除 (PR 7)
    //   assert_getting_started_vault_replaces_template / test_default_getting_started_repo_url_uses_tolaria_slug
    //   test_create_getting_started_vault_clones_repo / test_canonical_getting_started_path_accepts_cloned_starter_vault
    //   test_create_getting_started_vault_rejects_nonempty_destination / test_create_getting_started_vault_cleans_partial_clone_on_failure
    //   test_create_getting_started_vault_leaves_clean_worktree / test_create_getting_started_vault_removes_the_starter_remote
    //   test_create_getting_started_vault_replaces_legacy_agents_template
    //   test_create_getting_started_vault_replaces_pre_type_agents_template
    //   test_agents_refresh_detection_accepts_pre_type_managed_template

    #[test]
    fn test_default_vault_path_appends_getting_started() {
        let path = default_vault_path().unwrap();
        let path_str = path.to_string_lossy();
        assert!(path_str.ends_with("Getting Started"));
    }

    #[test]
    fn test_canonical_getting_started_path_rejects_plain_tolaria_folder() {
        let dir = tempfile::TempDir::new().unwrap();
        let default_path = dir.path().join("Getting Started");

        write_tolaria_config_files(&default_path);

        assert!(!vault_exists_with_default_path(
            default_path.as_path(),
            Some(default_path.as_path())
        ));
    }

    #[test]
    fn test_non_canonical_vault_path_stays_permissive() {
        let dir = tempfile::TempDir::new().unwrap();
        let default_path = dir.path().join("Getting Started");
        let other_vault_path = dir.path().join("Existing Vault");

        fs::create_dir_all(&other_vault_path).unwrap();

        assert!(vault_exists_with_default_path(
            other_vault_path.as_path(),
            Some(default_path.as_path())
        ));
    }

    // DREAMFORGE_SLIM: test_agents_refresh_detection_accepts_legacy_json_view_guidance 物理删除 (PR 7)

    #[test]
    fn test_agents_template_matches_current_tolaria_vault_conventions() {
        assert!(AGENTS_MD.starts_with("---\ntype: Note\n_organized: true\n---\n"));
        assert!(AGENTS_MD.contains("# AGENTS.md — Tolaria Vault"));
        assert!(AGENTS_MD.contains("Use the first H1 as the note title."));
        assert!(AGENTS_MD.contains("Store note type in the `type:` frontmatter field."));
        assert!(AGENTS_MD.contains("Tolaria reads notes recursively from all folders"));
        assert!(AGENTS_MD.contains("Search the bundled Tolaria docs"));
        assert!(AGENTS_MD.contains("attachments/"));
        assert!(AGENTS_MD.contains("views/*.yml"));
        assert!(AGENTS_MD.contains("option:direction"));
        assert!(AGENTS_MD.contains("property:<Property Name>"));
        assert!(AGENTS_MD.contains("actual frontmatter keys used in this vault such as `related_to`, `belongs_to`, or `url`."));
        assert!(AGENTS_MD.contains("Belongs to:"));
        assert!(AGENTS_MD.contains("Do not create JSON view files or `.view.json` filenames."));
        assert!(!AGENTS_MD.contains("Laputa"));
        assert!(!AGENTS_MD.contains("Is A"));
        assert!(!AGENTS_MD.contains("is_a"));
        assert!(!AGENTS_MD.contains("type definitions currently live"));
    }
}
