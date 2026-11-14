import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

test('staff license updater is idempotent, creates a backup, and rejects unsupported APIs', () => {
  const script = `
import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory

spec = importlib.util.spec_from_file_location("updater", "scripts/upgrade-staff-license-access.py")
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)
original = 'class Routes:\\n' + updater.START + '''    def get_customer_license_key(discord_id, db):
        if (not account
            or not account.builtbybit_user_id
            or not account.license_key_salt
            or len(effective_settings.customer_license_secret) < 32
        ):
            pass
        return {"licenseKey": key, "license": _license_json(item, db)}

''' + updater.END + '    def get_ips():\\n        pass\\n'
with TemporaryDirectory() as temp:
    backend = Path(temp)
    (backend / "licensing_backend").mkdir()
    path = backend / "licensing_backend" / "api.py"
    path.write_text(original)
    assert updater.upgrade(backend) == 1
    assert updater.upgrade(backend) == 0
    assert path.with_name("api.py.before-staff-license-access.bak").read_text() == original
    changed = original.replace("account.builtbybit_user_id", "account.other")
    path.write_text(changed)
    try:
        updater.upgrade(backend)
        raise AssertionError("unsupported route accepted")
    except ValueError:
        assert path.read_text() == changed
`
  const result = spawnSync('python3', ['-B', '-c', script], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})
