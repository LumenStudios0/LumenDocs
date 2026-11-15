import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

test('license deletion updater is idempotent and rejects unknown API layouts', () => {
  const result = spawnSync('python3', ['-B', '-c', `
import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory

spec = importlib.util.spec_from_file_location("updater", "scripts/upgrade-license-deletion.py")
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)
source = """from sqlalchemy import delete, func, or_, select, text
from licensing_backend.models import (
    LicenseIPAddress,
    LicenseProduct,
)
def _sync_entitlement_from_licenses(): pass
def routes():
    @admin.post("/licenses/{license_id}/revoke")
    def revoke(): pass
""" + updater.ANCHOR + "    def get(): pass\\n"
with TemporaryDirectory() as directory:
    backend = Path(directory)
    (backend / "licensing_backend").mkdir()
    path = backend / "licensing_backend" / "api.py"
    path.write_text(source)
    assert updater.upgrade(backend) == 1
    assert updater.upgrade(backend) == 0
    assert path.with_name("api.py.before-license-deletion.bak").read_text() == source
    path.write_text(source.replace("_sync_entitlement_from_licenses", "_unknown_sync"))
    try:
        updater.upgrade(backend)
        raise AssertionError("unsupported route accepted")
    except ValueError:
        assert "_unknown_sync" in path.read_text()
`], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
})
