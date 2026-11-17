#!/usr/bin/env python3
"""Upgrade the archive-based licensing API's canonical IP allowance.

Run: python3 scripts/upgrade-loyalty-ip-allowance.py /opt/lumen-license/backend
Then rebuild and restart API and bot with docker compose up -d --build api bot.
"""

import argparse
from pathlib import Path
import shutil


ANCHOR = "def _license_json(item: License, db: Session) -> dict:\n"
HELPER = '''def _loyalty_account_ip_limit(db: Session, customer_discord_id: str) -> int:
    configured = get_max_account_ips(db)
    base = configured if configured is not None else 3
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
    tier_limit = 10 if count == len(registry) else 7 if count >= 9 else 5 if count >= 6 else 4 if count >= 3 else 3
    return max(base, tier_limit)


'''

REPLACEMENTS = (
    ('"maxAllowedIps": get_max_account_ips(db),', '"maxAllowedIps": _loyalty_account_ip_limit(db, account.customer_discord_id),'),
    ('            max_allowed_ips = get_max_account_ips(db)\n', '            max_allowed_ips = _loyalty_account_ip_limit(db, customer_discord_id)\n'),
    ('            "maxAddresses": get_max_account_ips(db),', '            "maxAddresses": _loyalty_account_ip_limit(db, discord_id),'),
    ('        key_data = get_customer_license_key(discord_id, db)\n        max_allowed_ips = get_max_account_ips(db)\n',
     '        key_data = get_customer_license_key(discord_id, db)\n        max_allowed_ips = _loyalty_account_ip_limit(db, discord_id)\n'),
    ('        "allowedIps": _customer_ips(item.customer_discord_id, db),',
     '        "allowedIps": _customer_ips(item.customer_discord_id, db),\n        "maxAllowedIps": _loyalty_account_ip_limit(db, item.customer_discord_id),'),
)
WEB_OLD = "        max_allowed_ips = get_max_account_ips(db)\n"
WEB_NEW = '        from licensing_backend.api import _loyalty_account_ip_limit\n\n        max_allowed_ips = _loyalty_account_ip_limit(db, account.customer_discord_id)\n'

TEXT_REPLACEMENTS = {
    "licensing_bot/main.py": (
        ("Allowed IP slots are now unlimited.", "Accounts now use 3 IP slots by default, increased by their loyalty tier."),
        ("IP addresses. Existing IPs and licenses were not changed.", "IP addresses as a base allowance; higher loyalty allowances still apply. Existing IPs and licenses were not changed."),
    ),
    "licensing_backend/static/admin.js": (
        ("Remove limit for unlimited IPs.", "Remove limit to restore the default 3 slots plus loyalty benefits."),
        ("No IP limit is set. Accounts can have unlimited allowed IP addresses.", "No manual override. Accounts use 3 IP slots plus loyalty benefits."),
        ("IP limit removed. IP slots are now unlimited.", "Manual override removed. Default and loyalty allowances apply."),
        ("Maximum of ${maxAllowedIps} IP addresses per account.", "Base allowance of ${maxAllowedIps} IP addresses; higher loyalty allowances apply."),
        ("Maximum of ${ipLimit.maxAllowedIps} IP addresses per account.", "Base allowance of ${ipLimit.maxAllowedIps} IP addresses; higher loyalty allowances apply."),
    ),
    "licensing_backend/templates/admin.html": (
        ("Maximum allowed server IPs per customer account", "Base server IP allowance (higher loyalty allowances apply)"),
        ('placeholder="Unlimited"', 'placeholder="3 plus loyalty benefits"'),
        ("No site-wide IP cap is set by default.", "Default allowance: 3 IPs; Spark 4, Radiance 5, Nova 7, Elite 10."),
    ),
}


def upgrade(backend):
    path = backend / "licensing_backend" / "api.py"
    web_path = backend / "licensing_backend" / "customer_web.py"
    source = path.read_text()
    web_source = web_path.read_text()
    if source.count(HELPER) == 1:
        if not (all(source.count(new) == 1 for _, new in REPLACEMENTS) and source.count(
            "            max_allowed_ips = _loyalty_account_ip_limit(db, account.customer_discord_id)\n"
        ) == 1 and web_source.count(WEB_NEW) == 1 and web_source.count(WEB_OLD) == 0):
            raise ValueError("Incomplete loyalty IP update; no files changed.")
        updated, web_updated = source, web_source
    else:
        if source.count(ANCHOR) != 1 or any(source.count(old) != (2 if index == 1 else 1)
                                             for index, (old, _) in enumerate(REPLACEMENTS)) or web_source.count(WEB_OLD) != 1:
            raise ValueError("Unsupported API layout; no files changed.")
        updated = source.replace(ANCHOR, HELPER + ANCHOR, 1)
        for index, (old, new) in enumerate(REPLACEMENTS):
            updated = updated.replace(old, new, 1)
            if index == 1:
                updated = updated.replace(old, "            max_allowed_ips = _loyalty_account_ip_limit(db, account.customer_discord_id)\n", 1)
        web_updated = web_source.replace(WEB_OLD, WEB_NEW, 1)
    compile(updated, str(path), "exec")
    compile(web_updated, str(web_path), "exec")
    updates = [(path, updated)] if updated != source else []
    if web_updated != web_source:
        updates.append((web_path, web_updated))
    for relative, replacements in TEXT_REPLACEMENTS.items():
        target = backend / relative
        if not target.exists():
            continue
        original = target.read_text()
        changed = original
        for old, new in replacements:
            if old in changed:
                changed = changed.replace(old, new)
            elif new not in changed:
                raise ValueError(f"Unsupported {target}; no files changed.")
        if changed != original:
            if relative.endswith(".py"):
                compile(changed, str(target), "exec")
            updates.append((target, changed))
    backups = [(target, target.with_name(target.name + ".before-loyalty-ip-allowance.bak")) for target, _ in updates]
    if any(backup.exists() for _, backup in backups):
        raise ValueError("Loyalty IP backup already exists; no files changed.")
    for target, backup in backups:
        shutil.copy2(target, backup)
    try:
        for target, changed in updates:
            target.write_text(changed)
    except OSError:
        for target, backup in backups:
            shutil.copy2(backup, target)
        raise
    return len(updates)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backend", type=Path)
    args = parser.parse_args()
    try:
        count = upgrade(args.backend)
    except (OSError, ValueError, SyntaxError) as error:
        parser.exit(1, f"Loyalty IP update failed: {error}\n")
    print(f"Updated {count} files. Run docker compose up -d --build api bot from /opt/lumen-license; backups end in .before-loyalty-ip-allowance.bak.")
