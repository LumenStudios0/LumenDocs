#!/usr/bin/env python3
"""Upgrade the archive-based licensing API's canonical IP allowance.

Run: python3 scripts/upgrade-loyalty-ip-allowance.py /opt/lumen-license/backend
Then rebuild and restart the API container with docker compose up -d --build api.
"""

import argparse
from pathlib import Path
import shutil


ANCHOR = "def _license_json(item: License, db: Session) -> dict:\n"
HELPER = '''def _loyalty_account_ip_limit(db: Session, customer_discord_id: str) -> int:
    base = get_max_account_ips(db)
    account = db.get(CustomerAccount, customer_discord_id)
    if not account or account.status != "active" or account.verification_required:
        return base
    registry = set(db.scalars(
        select(Product.product_id)
        .join(ProductPlugin, ProductPlugin.product_id == Product.product_id)
        .where(Product.active.is_(True)).distinct()
    ).all())
    if not registry:
        return base
    owned = set(db.scalars(
        select(AccountProductEntitlement.product_id)
        .where(
            AccountProductEntitlement.customer_discord_id == customer_discord_id,
            AccountProductEntitlement.status == "active",
            or_(AccountProductEntitlement.expires_at.is_(None), AccountProductEntitlement.expires_at > utcnow()),
        )
    ).all()) & registry
    count = len(owned)
    tier_limit = 10 if count == len(registry) else 7 if count >= 7 else 5 if count >= 3 else 4 if count >= 1 else 0
    return max(base, tier_limit)


'''

REPLACEMENTS = (
    ('"maxAllowedIps": get_max_account_ips(db),', '"maxAllowedIps": _loyalty_account_ip_limit(db, account.customer_discord_id),'),
    ('            max_allowed_ips = get_max_account_ips(db)\n', '            max_allowed_ips = _loyalty_account_ip_limit(db, customer_discord_id)\n'),
    ('            "maxAddresses": get_max_account_ips(db),', '            "maxAddresses": _loyalty_account_ip_limit(db, discord_id),'),
    ('        key_data = get_customer_license_key(discord_id, db)\n        max_allowed_ips = get_max_account_ips(db)\n',
     '        key_data = get_customer_license_key(discord_id, db)\n        max_allowed_ips = _loyalty_account_ip_limit(db, discord_id)\n'),
)
WEB_OLD = "        max_allowed_ips = get_max_account_ips(db)\n"
WEB_NEW = '        from licensing_backend.api import _loyalty_account_ip_limit\n\n        max_allowed_ips = _loyalty_account_ip_limit(db, account.customer_discord_id)\n'


def upgrade(backend):
    path = backend / "licensing_backend" / "api.py"
    web_path = backend / "licensing_backend" / "customer_web.py"
    source = path.read_text()
    web_source = web_path.read_text()
    if source.count(HELPER) == 1:
        if all(source.count(new) == 1 for _, new in REPLACEMENTS) and source.count(
            "            max_allowed_ips = _loyalty_account_ip_limit(db, account.customer_discord_id)\n"
        ) == 1 and web_source.count(WEB_NEW) == 1 and web_source.count(WEB_OLD) == 0:
            return 0
        raise ValueError("Incomplete loyalty IP update; no files changed.")
    if source.count(ANCHOR) != 1 or any(source.count(old) != (2 if index == 1 else 1)
                                         for index, (old, _) in enumerate(REPLACEMENTS)) or web_source.count(WEB_OLD) != 1:
        raise ValueError("Unsupported API layout; no files changed.")
    updated = source.replace(ANCHOR, HELPER + ANCHOR, 1)
    for index, (old, new) in enumerate(REPLACEMENTS):
        updated = updated.replace(old, new, 1)
        if index == 1:
            updated = updated.replace(old, "            max_allowed_ips = _loyalty_account_ip_limit(db, account.customer_discord_id)\n", 1)
    compile(updated, str(path), "exec")
    web_updated = web_source.replace(WEB_OLD, WEB_NEW, 1)
    compile(web_updated, str(web_path), "exec")
    backup = path.with_name("api.py.before-loyalty-ip-allowance.bak")
    web_backup = web_path.with_name("customer_web.py.before-loyalty-ip-allowance.bak")
    if backup.exists() or web_backup.exists():
        raise ValueError("Loyalty IP backup already exists; no files changed.")
    shutil.copy2(path, backup)
    shutil.copy2(web_path, web_backup)
    try:
        path.write_text(updated)
        web_path.write_text(web_updated)
    except OSError:
        shutil.copy2(backup, path)
        shutil.copy2(web_backup, web_path)
        raise
    return 2


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backend", type=Path)
    args = parser.parse_args()
    try:
        count = upgrade(args.backend)
    except (OSError, ValueError, SyntaxError) as error:
        parser.exit(1, f"Loyalty IP update failed: {error}\n")
    print(f"Updated {count} files. Run docker compose up -d --build api from /opt/lumen-license; backups: api.py.before-loyalty-ip-allowance.bak and customer_web.py.before-loyalty-ip-allowance.bak.")
