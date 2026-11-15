"""Run against the archive-based licensing backend's pytest fixtures."""

import pytest

from licensing_backend.models import License, LicenseIPAddress, LicenseProduct


def test_delete_revoked_license_preserves_other_products_and_audit(test_api, admin_headers):
    client, sessions = test_api
    for product in ("auction", "duels"):
        assert client.post("/v1/admin/products", headers=admin_headers, json={
            "productId": product, "name": product,
        }).status_code == 201
    grants = [
        client.post("/v1/admin/licenses", headers=admin_headers, json={
            "customerDiscordId": "123456789", "productId": product,
        }).json()
        for product in ("auction", "duels")
    ]
    first, second = (grant["licenseId"] for grant in grants)
    assert client.post("/v1/admin/plugins", headers=admin_headers, json={
        "pluginId": "duels-plugin", "name": "Duels plugin",
    }).status_code == 201
    assert client.post("/v1/admin/products/duels/plugins/duels-plugin", headers=admin_headers).status_code == 201
    assert client.post(f"/v1/admin/licenses/{second}/ips", headers=admin_headers, json={
        "ipAddress": "127.0.0.1",
    }).status_code == 200
    validation = {"licenseKey": grants[0]["licenseKey"], "productId": "duels", "pluginId": "duels-plugin"}
    assert client.post("/v1/validate", json=validation).json()["valid"] is True
    path = f"/v1/admin/licenses/{first}"
    assert client.delete(path).status_code in (401, 403)
    assert client.delete(path, headers=admin_headers).status_code == 409
    assert client.post(path + "/revoke", headers=admin_headers, json={"reason": "test"}).status_code == 200
    with sessions() as db:
        db.add(LicenseIPAddress(license_id=first, ip_address="203.0.113.8"))
        db.commit()
    assert client.delete(path, headers=admin_headers).json() == {"licenseId": first, "deleted": True}
    assert client.post("/v1/validate", json=validation).json()["valid"] is True
    assert client.get(path, headers=admin_headers).status_code == 404
    assert client.delete(path, headers=admin_headers).status_code == 404
    with sessions() as db:
        assert db.get(License, first) is None
        assert db.get(LicenseIPAddress, (first, "203.0.113.8")) is None
        assert db.get(License, second).status == "active"
    products = client.get("/v1/admin/customers/123456789", headers=admin_headers).json()["products"]
    assert next(item for item in products if item["productId"] == "duels")["status"] == "active"
    audit = client.get(f"/v1/admin/audit?entityId={first}", headers=admin_headers).json()["items"]
    assert any(item["action"] == "license.deleted" for item in audit)
    assert grants[0]["licenseKey"] not in str(audit)
    customer_audit = client.get("/v1/admin/audit?customerDiscordId=123456789", headers=admin_headers).json()["items"]
    assert any(item["action"] == "customer.license_deleted" for item in customer_audit)


def test_delete_refuses_shared_license_records(test_api, admin_headers):
    client, sessions = test_api
    assert client.post("/v1/admin/products", headers=admin_headers, json={
        "productId": "auction", "name": "Auction",
    }).status_code == 201
    grant = client.post("/v1/admin/licenses", headers=admin_headers, json={
        "customerDiscordId": "123456789", "productId": "auction",
    }).json()
    license_id = grant["licenseId"]
    assert client.post(f"/v1/admin/licenses/{license_id}/revoke", headers=admin_headers, json={}).status_code == 200
    with sessions() as db:
        db.add(LicenseProduct(license_id=license_id, product_id="auction"))
        db.commit()
    assert client.delete(f"/v1/admin/licenses/{license_id}", headers=admin_headers).status_code == 409
    assert client.get(f"/v1/admin/licenses/{license_id}", headers=admin_headers).status_code == 200


def test_delete_refuses_legacy_keys(test_api, admin_headers):
    client, sessions = test_api
    assert client.post("/v1/admin/products", headers=admin_headers, json={
        "productId": "auction", "name": "Auction",
    }).status_code == 201
    grant = client.post("/v1/admin/licenses", headers=admin_headers, json={
        "customerDiscordId": "123456789", "productId": "auction",
    }).json()
    license_id = grant["licenseId"]
    assert client.post(f"/v1/admin/licenses/{license_id}/revoke", headers=admin_headers, json={}).status_code == 200
    with sessions() as db:
        db.get(License, license_id).key_hash = "a" * 64
        db.commit()
    assert client.delete(f"/v1/admin/licenses/{license_id}", headers=admin_headers).status_code == 409
    assert client.get(f"/v1/admin/licenses/{license_id}", headers=admin_headers).status_code == 200


def test_delete_rolls_back_if_audit_fails(test_api, admin_headers, monkeypatch):
    from licensing_backend import api

    client, sessions = test_api
    assert client.post("/v1/admin/products", headers=admin_headers, json={
        "productId": "auction", "name": "Auction",
    }).status_code == 201
    grant = client.post("/v1/admin/licenses", headers=admin_headers, json={
        "customerDiscordId": "123456789", "productId": "auction",
    }).json()
    license_id = grant["licenseId"]
    assert client.post(f"/v1/admin/licenses/{license_id}/revoke", headers=admin_headers, json={}).status_code == 200
    with sessions() as db:
        db.add(LicenseIPAddress(license_id=license_id, ip_address="203.0.113.8"))
        db.commit()

    def fail_audit(*args, **kwargs):
        raise RuntimeError("Injected audit failure")

    monkeypatch.setattr(api, "_audit", fail_audit)
    with pytest.raises(RuntimeError, match="Injected audit failure"):
        client.delete(f"/v1/admin/licenses/{license_id}", headers=admin_headers)
    with sessions() as db:
        assert db.get(License, license_id) is not None
        assert db.get(LicenseIPAddress, (license_id, "203.0.113.8")) is not None
