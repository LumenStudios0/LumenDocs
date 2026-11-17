"""Run against the patched archive-based backend's pytest fixtures."""

from datetime import timedelta

from licensing_backend.models import AccountProductEntitlement, CustomerAccount, Product, utcnow
from licensing_backend.platform_settings import set_max_account_ips


def test_loyalty_thresholds_and_actual_ip_enforcement(test_api, admin_headers):
    client, sessions = test_api
    customer = "123456789"
    for i in range(12):
        assert client.post("/v1/admin/products", headers=admin_headers, json={"productId": f"p{i}", "name": f"P{i}"}).status_code == 201
        assert client.post("/v1/admin/plugins", headers=admin_headers, json={"pluginId": f"plugin{i}", "name": f"Plugin{i}"}).status_code == 201
        assert client.post(f"/v1/admin/products/p{i}/plugins/plugin{i}", headers=admin_headers).status_code == 201

    grants = []
    path = f"/v1/admin/users/{customer}/license-ips"
    for i in range(12):
        response = client.post("/v1/admin/licenses", headers=admin_headers, json={"customerDiscordId": customer, "productId": f"p{i}"})
        assert response.status_code == 201
        grants.append(response.json())
        limit = 10 if i == 11 else 7 if i >= 8 else 5 if i >= 5 else 4 if i >= 2 else 3
        assert client.get(path, headers=admin_headers).json()["maxAddresses"] == limit
        assert client.get(f"/v1/admin/licenses/{grants[0]['licenseId']}", headers=admin_headers).json()["maxAllowedIps"] == limit
        addresses = [f"192.0.2.{n}" for n in range(1, limit + 1)]
        assert client.put(path, headers=admin_headers, json={"addresses": addresses}).status_code == 200
        assert client.put(path, headers=admin_headers, json={"addresses": addresses + ["192.0.2.100"]}).status_code == 422

    assert client.post(f"/v1/admin/customers/{customer}/ips", headers=admin_headers, json={"ipAddress": "192.0.2.100"}).status_code == 409
    assert client.post(f"/v1/admin/licenses/{grants[0]['licenseId']}/ips", headers=admin_headers, json={"ipAddress": "192.0.2.100"}).status_code == 409
    validation = {"licenseKey": grants[0]["licenseKey"], "productId": "p0", "pluginId": "plugin0"}
    assert client.post("/v1/validate", json=validation, headers={"X-Forwarded-For": "192.0.2.10"}).json()["valid"] is True
    assert client.post("/v1/validate", json=validation, headers={"X-Forwarded-For": "192.0.2.100"}).json()["valid"] is False

    with sessions() as db:
        db.get(AccountProductEntitlement, (customer, "p11")).expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    assert client.get(path, headers=admin_headers).json()["maxAddresses"] == 7
    assert len(client.get(path, headers=admin_headers).json()["addresses"]) == 10
    with sessions() as db:
        db.get(Product, "p11").active = False
        db.commit()
    assert client.get(path, headers=admin_headers).json()["maxAddresses"] == 10
    with sessions() as db:
        db.get(CustomerAccount, customer).verification_required = True
        db.commit()
    assert client.get(f"/v1/admin/customers/{customer}", headers=admin_headers).json()["maxAllowedIps"] == 3
    with sessions() as db:
        db.get(CustomerAccount, customer).verification_required = False
        set_max_account_ips(db, 20)
        db.commit()
    assert client.get(path, headers=admin_headers).json()["maxAddresses"] == 20


def test_empty_registry_has_three_slots_and_never_grants_elite(test_api, admin_headers):
    from licensing_backend.api import _loyalty_account_ip_limit
    from licensing_backend.platform_settings import get_max_account_ips

    client, sessions = test_api
    with sessions() as db:
        assert get_max_account_ips(db) is None
        assert _loyalty_account_ip_limit(db, "555") == 3
    assert client.post("/v1/admin/products", headers=admin_headers, json={"productId": "p", "name": "P"}).status_code == 201
    assert client.post("/v1/admin/licenses", headers=admin_headers, json={"customerDiscordId": "555", "productId": "p"}).status_code == 201
    with sessions() as db:
        assert _loyalty_account_ip_limit(db, "555") == 3


def test_web_ip_add_uses_same_effective_limit(test_api, admin_headers):
    import base64
    import json
    from itsdangerous import TimestampSigner

    client, _ = test_api
    assert client.post("/v1/admin/products", headers=admin_headers, json={"productId": "p", "name": "P"}).status_code == 201
    assert client.post("/v1/admin/plugins", headers=admin_headers, json={"pluginId": "plugin", "name": "Plugin"}).status_code == 201
    assert client.post("/v1/admin/products/p/plugins/plugin", headers=admin_headers).status_code == 201
    assert client.post("/v1/admin/licenses", headers=admin_headers, json={"customerDiscordId": "555", "productId": "p"}).status_code == 201
    payload = base64.b64encode(json.dumps({"user": {"id": "555", "username": "Test", "avatar": None}, "csrf_token": "csrf-test"}).encode())
    client.cookies.set("lumen_session", TimestampSigner("test-web-session-secret").sign(payload).decode())
    assert client.get("/web/api/me").json()["maxAllowedIps"] == 10
    for i in range(1, 11):
        assert client.post("/web/api/me/ips", json={"ipAddress": f"192.0.2.{i}"}, headers={"X-CSRF-Token": "csrf-test"}).status_code == 200
    assert client.post("/web/api/me/ips", json={"ipAddress": "192.0.2.11"}, headers={"X-CSRF-Token": "csrf-test"}).status_code == 409
