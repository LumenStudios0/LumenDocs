"""Run against the archive-based licensing backend's pytest fixtures."""


def test_staff_grants_are_available_without_marketplace_link(test_api, admin_headers):
    client, _ = test_api
    for product in ("auction", "duels"):
        assert client.post("/v1/admin/products", headers=admin_headers, json={
            "productId": product, "name": product,
        }).status_code == 201
    grants = []
    for product in ("auction", "duels"):
        response = client.post("/v1/admin/licenses", headers=admin_headers, json={
            "customerDiscordId": "123456789", "productId": product,
        })
        assert response.status_code == 201
        grants.append(response.json())
    assert grants[0]["licenseKey"] == grants[1]["licenseKey"]
    response = client.get("/v1/admin/users/123456789/license-key", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["licenseKey"] == grants[0]["licenseKey"]
    assert response.json()["license"]["productIds"] == ["auction", "duels"]
    assert client.get("/v1/admin/users/987654321/license-key", headers=admin_headers).status_code == 404
    path = "/v1/admin/users/123456789/license-ips"
    assert client.put(path, headers=admin_headers, json={"addresses": ["203.0.113.8"]}).status_code == 200
    assert client.get(path, headers=admin_headers).json()["addresses"] == ["203.0.113.8"]
    assert client.post(f"/v1/admin/licenses/{grants[0]['licenseId']}/revoke", headers=admin_headers, json={"reason": "test"}).status_code == 200
    result = client.get("/v1/admin/users/123456789/license-key", headers=admin_headers)
    assert result.status_code == 200
    assert result.json()["license"]["productIds"] == ["duels"]
    assert client.post(f"/v1/admin/licenses/{grants[1]['licenseId']}/revoke", headers=admin_headers, json={"reason": "test"}).status_code == 200
    assert client.get("/v1/admin/users/123456789/license-key", headers=admin_headers).status_code == 404


def test_staff_granted_license_is_hidden_while_account_is_banned(test_api, admin_headers):
    client, _ = test_api
    assert client.post("/v1/admin/products", headers=admin_headers, json={"productId": "auction", "name": "Auction"}).status_code == 201
    assert client.post("/v1/admin/licenses", headers=admin_headers, json={"customerDiscordId": "123456789", "productId": "auction"}).status_code == 201
    assert client.post("/v1/admin/users/123456789/ban", headers=admin_headers, json={"reason": "test"}).status_code == 200
    assert client.get("/v1/admin/users/123456789/license-key", headers=admin_headers).status_code == 403
