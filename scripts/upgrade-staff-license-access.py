#!/usr/bin/env python3
"""Allow customers to retrieve staff-issued account keys without BuiltByBit."""

import argparse
from pathlib import Path
import shutil


START = '    @admin.get("/users/{discord_id}/license-key")\n'
END = '    @admin.get("/users/{discord_id}/license-ips")\n'
EXPECTED = (
    '            or not account.builtbybit_user_id\n',
    '            or not account.license_key_salt\n',
    '            or len(effective_settings.customer_license_secret) < 32\n',
    '        return {"licenseKey": key, "license": _license_json(item, db)}\n',
)
NEW = '''    @admin.get("/users/{discord_id}/license-key")
    def get_customer_license_key(discord_id: str, db: Db) -> dict:
        account = db.get(CustomerAccount, discord_id)
        if not account or account.deleted_at or not account.key_hash:
            raise HTTPException(status_code=404, detail="No account license is available")
        if account.banned or account.on_hold or account.status != "active":
            raise HTTPException(status_code=403, detail="This customer account cannot access its license")
        encryption_secret = effective_settings.license_key_encryption_key or effective_settings.admin_api_token
        key = get_account_key(account, encryption_secret)
        if not key or digest(key) != account.key_hash:
            raise HTTPException(status_code=503, detail="The account license key cannot be recovered")
        products = db.scalars(
            select(AccountProductEntitlement.product_id)
            .join(Product, Product.product_id == AccountProductEntitlement.product_id)
            .where(
                AccountProductEntitlement.customer_discord_id == discord_id,
                AccountProductEntitlement.status == "active",
                Product.active.is_(True),
                or_(AccountProductEntitlement.expires_at.is_(None), AccountProductEntitlement.expires_at > utcnow()),
            )
            .order_by(AccountProductEntitlement.product_id)
        ).all()
        if not products:
            raise HTTPException(status_code=404, detail="No active product license is available")
        item = db.scalar(
            select(License).where(
                License.customer_discord_id == discord_id,
                License.status == "active",
                or_(License.key_hash == account.key_hash, License.product_id.in_(products)),
            ).order_by(License.created_at.desc())
        )
        if not item:
            raise HTTPException(status_code=404, detail="No active license record is available")
        license_data = _license_json(item, db)
        license_data["productIds"] = list(products)
        license_data["status"] = account.status
        license_data["expiresAt"] = None
        return {"licenseKey": key, "license": license_data}

'''


def upgrade(backend):
    path = backend / "licensing_backend" / "api.py"
    source = path.read_text()
    if source.count(START) != 1 or source.count(END) != 1:
        raise ValueError("Unsupported API layout; no files changed.")
    start = source.index(START)
    end = source.index(END)
    if end <= start:
        raise ValueError("Unexpected route ordering; no files changed.")
    old = source[start:end]
    if old == NEW:
        return 0
    if not all(old.count(marker) == 1 for marker in EXPECTED):
        raise ValueError("Unsupported customer license route; no files changed.")
    updated = source[:start] + NEW + source[end:]
    compile(updated, str(path), "exec")
    backup = path.with_name(path.name + ".before-staff-license-access.bak")
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
        parser.exit(1, f"Staff license update failed: {error}\n")
    print(f"Updated {count} files. Rebuild and restart the API. Backup: api.py.before-staff-license-access.bak.")
