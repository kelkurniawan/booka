import test from "node:test";
import assert from "node:assert/strict";

import { matchesOwnership, ownershipRecord } from "./ownership";

test("record baru memakai prefiks marky", () => {
  assert.deepEqual(ownershipRecord("salon.id", "abc"), { type: "TXT", name: "_marky.salon.id", value: "marky-verify=abc" });
});
test("record lama _booka tetap diterima", () => {
  assert.equal(matchesOwnership({ "_booka.salon.id": [["booka-verify=abc"]] }, "salon.id", "abc"), true);
});
test("record baru diterima, token lain ditolak", () => {
  assert.equal(matchesOwnership({ "_marky.salon.id": [["marky-verify=abc"]] }, "salon.id", "abc"), true);
  assert.equal(matchesOwnership({ "_marky.salon.id": [["marky-verify=xyz"]] }, "salon.id", "abc"), false);
});
test("TXT yang terpecah per 255 karakter digabung dulu", () => {
  assert.equal(matchesOwnership({ "_marky.salon.id": [["marky-verify=", "abc"]] }, "salon.id", "abc"), true);
});
