import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

test('VPS plugin updater preserves activation, audits name changes, and safely rejects unknown source', () => {
  const result = spawnSync('python3', ['-B', '-c', `
import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location("updater", "scripts/upgrade-plugin-editing.py")
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)

with TemporaryDirectory() as directory:
    backend = Path(directory)
    package = backend / "licensing_backend"
    package.mkdir()
    schema = package / "schemas.py"
    api = package / "api.py"
    schema.write_text(updater.OLD_SCHEMA)
    api.write_text("def update():\\n    if True:\\n" + updater.OLD_UPDATE)
    assert updater.upgrade(backend) == 2
    assert updater.upgrade(backend) == 0
    assert schema.with_name("schemas.py.before-plugin-editing.bak").read_text() == updater.OLD_SCHEMA
    assert updater.OLD_UPDATE in api.with_name("api.py.before-plugin-editing.bak").read_text()

    audits = []
    class HttpError(Exception):
        def __init__(self, status_code, detail):
            self.status_code = status_code
    for changes in [{"name": "  Renamed plugin  "}, {"active": False}, {"name": "Both", "active": True}]:
        plugin = SimpleNamespace(name="Original", active=True)
        namespace = dict(plugin=plugin, body=SimpleNamespace(model_dump=lambda **kwargs: changes.copy()),
                         db=None, request=None, plugin_id="stable-id",
                         _audit=lambda *args: audits.append(args[-1]), HTTPException=HttpError)
        exec("def update():\\n    if True:\\n" + updater.NEW_UPDATE, namespace)
        namespace["update"]()
        assert plugin.name == changes.get("name", "Original").strip()
        assert plugin.active == changes.get("active", True)
        assert audits[-1] == {key: value.strip() if key == "name" else value for key, value in changes.items()}
    for changes in [{}, {"name": None}, {"active": None}, {"name": "   "}]:
        namespace["body"] = SimpleNamespace(model_dump=lambda **kwargs: changes.copy())
        try:
            namespace["update"]()
        except HttpError as error:
            assert error.status_code == 400
        else:
            raise AssertionError("Invalid plugin changes were accepted")

with TemporaryDirectory() as directory:
    backend = Path(directory)
    package = backend / "licensing_backend"
    package.mkdir()
    schema = package / "schemas.py"
    api = package / "api.py"
    schema.write_text(updater.OLD_SCHEMA)
    api.write_text("unexpected source")
    try:
        updater.upgrade(backend)
    except ValueError:
        pass
    else:
        raise AssertionError("Unknown API source was patched")
    assert schema.read_text() == updater.OLD_SCHEMA
    assert not list(package.glob("*.bak"))
`], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
})
