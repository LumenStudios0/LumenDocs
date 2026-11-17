import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

test('loyalty IP updater is idempotent and rejects unsupported layouts without changes', () => {
  const result = spawnSync('python3', ['-B', '-c', `
import importlib.util
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("updater", "scripts/upgrade-loyalty-ip-allowance.py")
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)

api = updater.ANCHOR + "    pass\\n\\ndef sample():\\n    return {\\n        " + updater.REPLACEMENTS[0][0] + "\\n    }\\n"
api += "def first():\\n    if True:\\n" + updater.REPLACEMENTS[1][0]
api += "def second():\\n    if True:\\n" + updater.REPLACEMENTS[1][0]
api += "def third():\\n    return {\\n" + updater.REPLACEMENTS[2][0] + "\\n    }\\n"
api += "def fourth():\\n" + updater.REPLACEMENTS[3][0]
api += "def fifth():\\n    return {\\n" + updater.REPLACEMENTS[4][0] + "\\n    }\\n"
web = "def web():\\n" + updater.WEB_OLD
files = {"backend/licensing_backend/api.py": api, "backend/licensing_backend/customer_web.py": web}
for relative, replacements in updater.TEXT_REPLACEMENTS.items():
    files["backend/" + relative] = "\\n".join(
        "label" + str(index) + " = " + repr(old) if relative.endswith(".py") else old
        for index, (old, _) in enumerate(replacements)
    )

class Path:
    def __init__(self, value): self.value = value
    @property
    def name(self): return self.value.rsplit("/", 1)[-1]
    def __truediv__(self, value): return Path(self.value + "/" + value)
    def with_name(self, name): return Path(self.value.rsplit("/", 1)[0] + "/" + name)
    def read_text(self): return files[self.value]
    def write_text(self, value): files[self.value] = value
    def exists(self): return self.value in files
    def __str__(self): return self.value
def copy(src, dst): files[dst.value] = files[src.value]

with patch.object(updater.shutil, "copy2", copy):
    assert updater.upgrade(Path("backend")) == 5
    assert updater.upgrade(Path("backend")) == 0
    assert files["backend/licensing_backend/api.py.before-loyalty-ip-allowance.bak"] == api
    assert files["backend/licensing_backend/customer_web.py.before-loyalty-ip-allowance.bak"] == web
    files.clear()
    files.update({"backend/licensing_backend/api.py": api.replace(updater.ANCHOR, "def changed():\\n"), "backend/licensing_backend/customer_web.py": web})
    before = files.copy()
    try:
        updater.upgrade(Path("backend"))
        raise AssertionError("unknown layout accepted")
    except ValueError:
        assert files == before
`], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
})
