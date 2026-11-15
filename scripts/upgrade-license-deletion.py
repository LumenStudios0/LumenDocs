#!/usr/bin/env python3
"""Add guarded deletion of revoked license records to the archive-based API."""

import argparse
from pathlib import Path
import shutil


ANCHOR = '    @admin.get("/licenses/{license_id}")\n'
ROUTE = '''    @admin.delete("/licenses/{license_id}")
    def delete_license(license_id: str, request: Request, db: Db) -> dict:
        item = db.get(License, license_id, with_for_update=True)
        if not item:
            raise HTTPException(status_code=404, detail="License not found")
        if item.status != "revoked":
            raise HTTPException(status_code=409, detail="Revoke the license before deleting its record")
        if db.scalar(select(LicenseProduct.license_id).where(LicenseProduct.license_id == license_id).limit(1)):
            raise HTTPException(status_code=409, detail="Shared license records with linked products cannot be deleted")
        account = db.get(CustomerAccount, item.customer_discord_id)
        if item.key_hash and (account is None or account.key_hash != item.key_hash):
            raise HTTPException(status_code=409, detail="Legacy key records cannot be deleted safely")
        customer_id, product_id = item.customer_discord_id, item.product_id
        db.execute(delete(LicenseIPAddress).where(LicenseIPAddress.license_id == license_id))
        db.delete(item)
        details = {"customerDiscordId": customer_id, "productId": product_id}
        _audit(db, request, "license.deleted", "license", license_id, details)
        _audit(db, request, "customer.license_deleted", "customer", customer_id,
               {"licenseId": license_id, "productId": product_id})
        _commit(db)
        return {"licenseId": license_id, "deleted": True}

'''


def upgrade(backend):
    path = backend / "licensing_backend" / "api.py"
    source = path.read_text()
    if source.count(ANCHOR) != 1:
        raise ValueError("Unsupported API layout; no files changed.")
    if ROUTE in source:
        return 0
    expected = (
        "from sqlalchemy import delete, func, or_, select, text",
        "    LicenseIPAddress,\n",
        "    LicenseProduct,\n",
        "def _sync_entitlement_from_licenses(",
        '    @admin.post("/licenses/{license_id}/revoke")\n',
    )
    if any(source.count(marker) != 1 for marker in expected) or '@admin.delete("/licenses/{license_id}")' in source:
        raise ValueError("Unsupported licensing API; no files changed.")
    updated = source.replace(ANCHOR, ROUTE + ANCHOR, 1)
    compile(updated, str(path), "exec")
    backup = path.with_name(path.name + ".before-license-deletion.bak")
    if backup.exists():
        raise ValueError(f"Backup already exists: {backup}; no files changed.")
    shutil.copy2(path, backup)
    path.write_text(updated)
    return 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backend", type=Path)
    args = parser.parse_args()
    try:
        count = upgrade(args.backend)
    except (OSError, ValueError, SyntaxError) as error:
        parser.exit(1, f"License deletion update failed: {error}\n")
    print(f"Updated {count} files. Rebuild and restart the API. Backup: api.py.before-license-deletion.bak.")
