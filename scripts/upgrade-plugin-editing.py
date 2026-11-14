#!/usr/bin/env python3
"""Enable plugin name edits in the archive-based licensing API."""

import argparse
from pathlib import Path
import shutil


OLD_SCHEMA = """class PluginUpdate(ApiModel):
    active: bool
"""
NEW_SCHEMA = """class PluginUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    active: bool | None = None
"""
OLD_UPDATE = """        plugin.active = body.active
        _audit(
            db,
            request,
            "plugin.updated",
            "plugin",
            plugin_id,
            {"active": plugin.active},
        )
"""
NEW_UPDATE = """        changes = body.model_dump(exclude_unset=True)
        if not changes or any(value is None for value in changes.values()):
            raise HTTPException(status_code=400, detail="Supply a plugin name and/or active boolean")
        if "name" in changes:
            changes["name"] = changes["name"].strip()
            if not changes["name"]:
                raise HTTPException(status_code=400, detail="Plugin name cannot be blank")
        for name, value in changes.items():
            setattr(plugin, name, value)
        _audit(db, request, "plugin.updated", "plugin", plugin_id, changes)
"""


def upgrade(backend):
    updates = []
    for filename, old, new in [
        ("schemas.py", OLD_SCHEMA, NEW_SCHEMA),
        ("api.py", OLD_UPDATE, NEW_UPDATE),
    ]:
        path = backend / "licensing_backend" / filename
        source = path.read_text()
        if source.count(new) == 1 and old not in source:
            continue
        if source.count(old) != 1 or new in source:
            raise ValueError(f"Unsupported {path}; no files changed. Review this API version manually.")
        changed = source.replace(old, new, 1)
        compile(changed, str(path), "exec")
        backup = path.with_name(path.name + ".before-plugin-editing.bak")
        if backup.exists():
            raise ValueError(f"Backup already exists: {backup}; no files changed. Review before retrying.")
        updates.append((path, backup, changed))
    for path, backup, _ in updates:
        shutil.copy2(path, backup)
    for path, _, changed in updates:
        path.write_text(changed)
    return len(updates)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backend", type=Path, help="Backend directory, e.g. /opt/lumen-license/backend")
    args = parser.parse_args()
    try:
        count = upgrade(args.backend)
    except (OSError, ValueError, SyntaxError) as error:
        parser.exit(1, f"Plugin editing update failed: {error}\n")
    print(f"Updated {count} files. Rebuild and restart api and bot. Backups end in .before-plugin-editing.bak.")
