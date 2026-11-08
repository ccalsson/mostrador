import assert from "node:assert/strict";
import test from "node:test";
import { cambiarSire, consultarSire } from "./sire-bridge.ts";
import { rolPermite } from "./roles.ts";

test("only Torre's administration role can manage SIRE", () => {
  assert.equal(rolPermite("administracion", "acceso"), true);
  for (const role of ["comercial", "legal", "soporte", "auditoria", "", "rol_inexistente"])
    assert.equal(rolPermite(role, "acceso"), false, `${role} must not manage SIRE`);
});

test("SIRE bridge rejects unsafe configuration and fails closed", async () => {
  let called = false;
  const fetcher: typeof fetch = async () => { called = true; throw new Error("not expected"); };
  assert.equal((await consultarSire("https://sire.example", "short", fetcher)).disponible, false);
  assert.equal((await consultarSire("http://sire.example", "a".repeat(32), fetcher)).disponible, false);
  assert.equal((await consultarSire("https://user:pass@sire.example", "a".repeat(32), fetcher)).disponible, false);
  assert.equal(called, false);
});

test("management request carries verified actor and never exposes service credentials", async () => {
  const secret = "b".repeat(32);
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(String(url), "https://sire.example/api/torre-control");
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("x-sire-torre-token"), secret);
    assert.deepEqual(JSON.parse(String(init?.body)), { actorEmail: "rector@example.test", action: "create-site", data: { name: "Sede ficticia" } });
    return Response.json({ result: {} }, { status: 201 });
  };
  assert.equal((await cambiarSire("https://sire.example", secret, "rector@example.test", "create-site", { name: "Sede ficticia" }, fetcher)).ok, true);
  const denied = await cambiarSire("https://sire.example", secret, "rector@example.test", "link-member", {}, async () => new Response(null, { status: 403 }));
  assert.equal(denied.ok, false);
  assert.ok(!JSON.stringify(denied).includes(secret));
});

test("SIRE bridge uses server token and refuses redirects and malformed responses", async () => {
  const secret = "a".repeat(32);
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(String(url), "https://sire.example/api/torre-control");
    assert.equal(new Headers(init?.headers).get("x-sire-torre-token"), secret);
    assert.equal(init?.redirect, "error");
    return Response.json({ institutions: [], sites: [], members: [], limited: false });
  };
  assert.equal((await consultarSire("https://sire.example", secret, fetcher)).disponible, true);
  assert.equal((await consultarSire("https://sire.example", secret, async () => Response.json({}))).disponible, false);
  const result = await consultarSire("https://sire.example", secret, async () => { throw new Error(secret); });
  assert.ok(!JSON.stringify(result).includes(secret));
});
