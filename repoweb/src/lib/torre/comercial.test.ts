import assert from "node:assert/strict";
import test from "node:test";
import { efectosDePromocion, lineaCongelada, precioEfectivo, transicionSuscripcion } from "./comercial.ts";

test("fundador no reescribe el precio y separa bonificación, congelamiento y comisión", () => {
  const efectos = efectosDePromocion({
    startsOn: "2026-10-07",
    config: {
      bonusMonths: 6,
      commissionPercent: 0,
      frozenMonths: 12,
      productSlugs: ["mercado-presencia", "mercado-pro"],
    },
    lines: [{ id: "lin_presencia", slug: "mercado-presencia", currency: "USD", unitPrice: 32 }],
  });
  const bonus = efectos.find((efecto) => efecto.kind === "bonus");
  const freeze = efectos.find((efecto) => efecto.kind === "freeze");
  const commission = efectos.find((efecto) => efecto.kind === "commission_override");
  assert.equal(bonus?.lineId, "lin_presencia");
  assert.equal(bonus?.percent, 100);
  assert.equal(bonus?.endsOn, "2027-04-07");
  assert.equal(freeze?.amount, 32);
  assert.equal(freeze?.endsOn, "2027-10-07");
  assert.equal(commission?.percent, 0);
  assert.equal(commission?.lineId, null);
  assert.equal(efectos.some((efecto) => efecto.kind === "bonus" && efecto.lineId === "lin_pro"), false);
  const cobro = precioEfectivo(32, efectos.filter((efecto) => efecto.lineId === "lin_presencia").map((efecto) => ({ ...efecto, status: "active" })), "2026-12-01");
  assert.equal(cobro.contracted, 32);
  assert.equal(cobro.effective, 0);
  assert.equal(cobro.frozen, true);
  assert.equal(lineaCongelada(efectos.map((efecto) => ({ ...efecto, status: "active" })), "2026-12-01"), true);
});

test("sin línea el beneficio queda pendiente y no se inventa un precio", () => {
  const efectos = efectosDePromocion({
    startsOn: "2026-10-07",
    config: { bonusMonths: 6, frozenMonths: 12, productSlugs: ["mercado-pro"] },
    lines: [],
  });
  assert.ok(efectos.every((efecto) => efecto.lineId === null));
  assert.equal(efectos.find((efecto) => efecto.kind === "freeze")?.amount, null);
});

test("la suscripción no vuelve de cancelada y no nace suspendida", () => {
  assert.equal(transicionSuscripcion(null, "active"), true);
  assert.equal(transicionSuscripcion(null, "suspended"), false);
  assert.equal(transicionSuscripcion("active", "past_due"), true);
  assert.equal(transicionSuscripcion("active", "cancelled"), true);
  assert.equal(transicionSuscripcion("cancelled", "active"), false);
  assert.equal(transicionSuscripcion("past_due", "active"), true);
});

test("un descuento no se suma al precio contratado", () => {
  const cobro = precioEfectivo(100, [{ kind: "discount", percent: 10, amount: null, status: "active", startsOn: "2026-10-01", endsOn: null }], "2026-10-07");
  assert.equal(cobro.contracted, 100);
  assert.equal(cobro.discount, 10);
  assert.equal(cobro.effective, 90);
});
