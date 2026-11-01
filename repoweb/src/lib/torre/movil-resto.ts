import type { TorreFnMovil } from "@/lib/torre/movil-tipos";
import {
  grantPromotionCore,
  listLegalCore,
  listProcessorsCore,
  listPromotionsCore,
  offerContractCore,
  publishVersionCore,
  saveDocumentCore,
  saveProcessorCore,
  savePromotionCore,
} from "@/lib/torre/legal-fn";
import { usoMaterialesYaCore } from "@/lib/torre/materiales-ya-fn";
import { analiticaOperacionCore } from "@/lib/torre/operacion-fn";
import { numerosDeNegociosCore } from "@/lib/torre/numeros-fn";
import { panelPantallaCore } from "@/lib/torre/panel-fn";
import { kpisSuperAlToqueCore } from "@/lib/torre/super-al-toque-fn";

// Clave = nombre exacto del export web. La app Flutter llama /api/torre/v1/fn/<clave>.
// El body JSON es el `data` que produce el validator de la función web.
export const restoMovil: Record<string, TorreFnMovil> = {
  listLegal: (email) => listLegalCore(email),
  saveDocument: (email, data) => saveDocumentCore(email, data),
  publishVersion: (email, data) => publishVersionCore(email, data),
  offerContract: (email, data) => offerContractCore(email, data),
  listPromotions: (email) => listPromotionsCore(email),
  savePromotion: (email, data) => savePromotionCore(email, data),
  grantPromotion: (email, data) => grantPromotionCore(email, data),
  listProcessors: (email) => listProcessorsCore(email),
  saveProcessor: (email, data) => saveProcessorCore(email, data),
  panelPantalla: (email, data) => panelPantallaCore(email, data),
  analiticaOperacion: (email, data) => analiticaOperacionCore(email, data),
  numerosDeNegocios: (email, data) => numerosDeNegociosCore(email, data),
  kpisSuperAlToque: (email, data) => kpisSuperAlToqueCore(email, data),
  usoMaterialesYa: (email) => usoMaterialesYaCore(email),
};
