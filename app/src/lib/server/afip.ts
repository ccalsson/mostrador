import forge from "node-forge";
import QRCode from "qrcode";

const URLS = {
  homo: {
    wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    wsfe: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  },
  prod: {
    wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
    wsfe: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
  },
} as const;

export type Ambiente = keyof typeof URLS;

type Token = { token: string; sign: string; exp: number };
const cache = new Map<string, Token>();

function xml(value: string | number) {
  return String(value)
    .replace(/&/g, "&\u0061mp;")
    .replace(/</g, "&\u006ct;")
    .replace(/>/g, "&\u0067t;")
    .replace(/"/g, "&\u0071uot;");
}

function decodeXml(value: string) {
  return value
    .replace(/&\u006ct;/g, "<")
    .replace(/&\u0067t;/g, ">")
    .replace(/&\u0071uot;/g, '"')
    .replace(/&\u0061pos;/g, "'")
    .replace(/&#0*39;/g, "'")
    .replace(/&\u0061mp;/g, "&");
}

function tags(source: string, name: string) {
  const re = new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, "g");
  return [...source.matchAll(re)].map((m) => decodeXml(m[1].trim()));
}

function tag(source: string, name: string) {
  return tags(source, name)[0] ?? null;
}

export function isoAR(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}-03:00`;
}

export function hoyAR() {
  return isoAR(new Date()).slice(0, 10);
}

function extraerPem(raw: string, etiqueta: string) {
  const text = raw.replace(/^\uFEFF/, "").trim();
  const match = text.match(new RegExp(`-----BEGIN ${etiqueta}-----[\\s\\S]+?-----END ${etiqueta}-----`));
  return match?.[0] ?? null;
}

function leerCert(raw: string) {
  const pem = extraerPem(raw, "CERTIFICATE");
  if (pem) return forge.pki.certificateFromPem(pem);
  const der = forge.util.decode64(raw.replace(/^\uFEFF/, "").replace(/\s/g, ""));
  return forge.pki.certificateFromAsn1(forge.asn1.fromDer(der));
}

function leerClave(raw: string) {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (/BEGIN ENCRYPTED PRIVATE KEY/.test(text) || /Proc-Type:\s*4,ENCRYPTED/.test(text)) {
    throw new Error("La clave privada tiene contraseña. Volvé a exportarla sin clave.");
  }
  const pem = extraerPem(text, "RSA PRIVATE KEY") ?? extraerPem(text, "PRIVATE KEY");
  if (pem) {
    try {
      return forge.pki.privateKeyFromPem(pem);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      if (/encrypted/i.test(msg)) {
        throw new Error("La clave privada tiene contraseña. Volvé a exportarla sin clave.");
      }
      throw new Error("No pude leer el certificado o la clave. Tienen que ser PEM, sin contraseña.");
    }
  }
  const der = forge.util.decode64(text.replace(/\s/g, ""));
  return forge.pki.privateKeyFromAsn1(forge.asn1.fromDer(der));
}

export function firmarTra(certPem: string, keyPem: string) {
  const ahora = Date.now();
  const tra = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(ahora / 1000)}</uniqueId>
    <generationTime>${isoAR(new Date(ahora - 10 * 60 * 1000))}</generationTime>
    <expirationTime>${isoAR(new Date(ahora + 12 * 60 * 60 * 1000))}</expirationTime>
  </header>
  <service>wsfe</service>
</loginTicketRequest>`;
  let cert: unknown;
  let key: unknown;
  try {
    cert = leerCert(certPem);
    key = leerClave(keyPem);
  } catch (error) {
    if (error instanceof Error && /contraseña|PEM/.test(error.message)) throw error;
    throw new Error("No pude leer el certificado o la clave. Tienen que ser PEM, sin contraseña.");
  }
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign({ detached: false });
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

function textoArca(raw: string) {
  const msg = raw.replace(/\bAFIP\b/gi, "ARCA");
  if (/inhabilit/i.test(msg)) {
    return `ARCA inhabilitó este CUIT para emitir. Regularizalo en ARCA antes de facturar. ${msg}`;
  }
  return msg;
}

async function soap(url: string, action: string, inner: string) {
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>${inner}</soap:Body>
</soap:Envelope>`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: action,
    },
    body: envelope,
  });
  const text = await res.text();
  if (/<(?:[\w.-]+:)?Fault[\s>]/.test(text) || /<(?:[\w.-]+:)?faultstring[\s>]/.test(text)) {
    throw new Error(textoArca(tag(text, "faultstring") ?? "ARCA rechazó el pedido."));
  }
  if (!res.ok) throw new Error(`ARCA no respondió (${res.status}).`);
  return text;
}

export function credencialesDeLogin(body: string) {
  const inner = tag(body, "loginCmsReturn") ?? body;
  const token = tag(inner, "token");
  const sign = tag(inner, "sign");
  const expira = tag(inner, "expirationTime");
  return { token, sign, expira };
}

export function invalidarWsaa(ambiente: Ambiente, certPem: string) {
  cache.delete(`${ambiente}:${certPem.slice(0, 40)}`);
}

export async function loginWsaa(ambiente: Ambiente, certPem: string, keyPem: string) {
  const clave = `${ambiente}:${certPem.slice(0, 40)}`;
  const vigente = cache.get(clave);
  if (vigente && vigente.exp > Date.now() + 60_000) return vigente;
  const cms = firmarTra(certPem, keyPem);
  const body = await soap(
    URLS[ambiente].wsaa,
    "urn:LoginCms",
    `<loginCms xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><in0>${cms}</in0></loginCms>`,
  );
  const { token, sign, expira } = credencialesDeLogin(body);
  if (!token || !sign) throw new Error(textoArca(tag(body, "faultstring") ?? "ARCA no entregó el ticket de acceso."));
  const guardado = { token, sign, exp: expira ? Date.parse(expira) : Date.now() + 10 * 60 * 60 * 1000 };
  cache.set(clave, guardado);
  return guardado;
}

export async function feDummy(ambiente: Ambiente) {
  const body = await soap(URLS[ambiente].wsfe, "http://ar.gov.afip.dif.FEV1/FEDummy", `<FEDummy xmlns="http://ar.gov.afip.dif.FEV1/"/>`);
  return {
    app: tag(body, "AppServer"),
    db: tag(body, "DbServer"),
    auth: tag(body, "AuthServer"),
  };
}

function authXml(cuit: string, acceso: Token) {
  return `<Auth><Token>${xml(acceso.token)}</Token><Sign>${xml(acceso.sign)}</Sign><Cuit>${cuit}</Cuit></Auth>`;
}

export async function ultimoAutorizado(
  ambiente: Ambiente,
  cuit: string,
  acceso: Token,
  puntoVenta: number,
  cbteTipo: number,
) {
  const body = await soap(
    URLS[ambiente].wsfe,
    "http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado",
    `<FECompUltimoAutorizado xmlns="http://ar.gov.afip.dif.FEV1/">${authXml(cuit, acceso)}<PtoVta>${puntoVenta}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo></FECompUltimoAutorizado>`,
  );
  const errores = mensajes(body);
  if (errores) throw new Error(errores);
  const nro = tag(body, "CbteNro");
  if (nro == null) throw new Error("ARCA no dijo cuál fue el último comprobante.");
  return Number(nro);
}

export type Solicitud = {
  puntoVenta: number;
  cbteTipo: number;
  numero: number;
  fecha: string;
  docTipo: number;
  docNro: string;
  neto: number;
  iva: number;
  total: number;
  alicuotaId: number;
  condicionId: number;
  asoc?: { tipo: number; ptoVta: number; nro: number; cuit: string; fecha: string };
};

function dinero(n: number) {
  return n.toFixed(2);
}

export async function solicitarCae(ambiente: Ambiente, cuit: string, acceso: Token, s: Solicitud) {
  const discrimina = s.cbteTipo !== 11 && s.cbteTipo !== 13;
  const ivaXml = discrimina
    ? `<Iva><AlicIva><Id>${s.alicuotaId}</Id><BaseImp>${dinero(s.neto)}</BaseImp><Importe>${dinero(s.iva)}</Importe></AlicIva></Iva>`
    : "";
  const asoc = s.asoc
    ? `<CbtesAsoc><CbteAsoc><Tipo>${s.asoc.tipo}</Tipo><PtoVta>${s.asoc.ptoVta}</PtoVta><Nro>${s.asoc.nro}</Nro><Cuit>${s.asoc.cuit}</Cuit><CbteFch>${s.asoc.fecha}</CbteFch></CbteAsoc></CbtesAsoc>`
    : "";
  const det = `<FECAEDetRequest>
      <Concepto>1</Concepto>
      <DocTipo>${s.docTipo}</DocTipo>
      <DocNro>${s.docNro}</DocNro>
      <CbteDesde>${s.numero}</CbteDesde>
      <CbteHasta>${s.numero}</CbteHasta>
      <CbteFch>${s.fecha}</CbteFch>
      <ImpTotal>${dinero(s.total)}</ImpTotal>
      <ImpTotConc>0.00</ImpTotConc>
      <ImpNeto>${dinero(s.neto)}</ImpNeto>
      <ImpOpEx>0.00</ImpOpEx>
      <ImpTrib>0.00</ImpTrib>
      <ImpIVA>${dinero(s.iva)}</ImpIVA>
      <MonId>PES</MonId>
      <MonCotiz>1</MonCotiz>
      <CondicionIVAReceptorId>${s.condicionId}</CondicionIVAReceptorId>
      ${asoc}
      ${ivaXml}
    </FECAEDetRequest>`;
  const body = await soap(
    URLS[ambiente].wsfe,
    "http://ar.gov.afip.dif.FEV1/FECAESolicitar",
    `<FECAESolicitar xmlns="http://ar.gov.afip.dif.FEV1/">${authXml(cuit, acceso)}
      <FeCAEReq>
        <FeCabReq><CantReg>1</CantReg><PtoVta>${s.puntoVenta}</PtoVta><CbteTipo>${s.cbteTipo}</CbteTipo></FeCabReq>
        <FeDetReq>${det}</FeDetReq>
      </FeCAEReq>
    </FECAESolicitar>`,
  );
  const resultado = tag(body, "Resultado");
  const cae = tag(body, "CAE");
  const vto = tag(body, "CAEFchVto");
  const obs = mensajes(body);
  if (resultado !== "A" || !cae) {
    throw new Error(obs || "ARCA no autorizó el comprobante.");
  }
  return { cae, vto: vto ?? "", obs };
}

function mensajes(body: string) {
  const codigos = tags(body, "Code");
  const textos = tags(body, "Msg");
  if (!textos.length) return null;
  return textoArca(textos.map((msg, i) => (codigos[i] ? `${codigos[i]}: ${msg}` : msg)).join(" "));
}

export async function consultarComprobante(
  ambiente: Ambiente,
  cuit: string,
  acceso: Token,
  puntoVenta: number,
  cbteTipo: number,
  numero: number,
) {
  const body = await soap(
    URLS[ambiente].wsfe,
    "http://ar.gov.afip.dif.FEV1/FECompConsultar",
    `<FECompConsultar xmlns="http://ar.gov.afip.dif.FEV1/">${authXml(cuit, acceso)}
      <FeCompConsReq><CbteTipo>${cbteTipo}</CbteTipo><CbteNro>${numero}</CbteNro><PtoVta>${puntoVenta}</PtoVta></FeCompConsReq>
    </FECompConsultar>`,
  );
  const cae = tag(body, "CodAutorizacion") ?? tag(body, "CAE");
  if (cae) return { cae, vto: tag(body, "FchVto") ?? tag(body, "CAEFchVto") ?? "" };
  const err = mensajes(body);
  if (!err || /602|no se encontr|no existe/i.test(err)) return null;
  throw new Error(err);
}

function ambiguo(msg: string) {
  return /no respondi|fetch|network|ECONN|aborted|timed out|timeout|socket/i.test(msg);
}

export async function autorizarCae(
  ambiente: Ambiente,
  cuit: string,
  acceso: Token,
  solicitud: Omit<Solicitud, "numero">,
) {
  const pedir = async (numero: number) => {
    try {
      const cae = await solicitarCae(ambiente, cuit, acceso, { ...solicitud, numero });
      return { numero, ...cae };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!ambiguo(msg)) throw error;
      const ya = await consultarComprobante(
        ambiente,
        cuit,
        acceso,
        solicitud.puntoVenta,
        solicitud.cbteTipo,
        numero,
      ).catch(() => null);
      if (ya?.cae) return { numero, cae: ya.cae, vto: ya.vto, obs: null as string | null };
      throw error;
    }
  };

  let numero = (await ultimoAutorizado(ambiente, cuit, acceso, solicitud.puntoVenta, solicitud.cbteTipo)) + 1;
  try {
    return await pedir(numero);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/\b600\b|\b601\b/.test(msg) || (!/10016/.test(msg) && !ambiguo(msg))) throw error;
    numero = (await ultimoAutorizado(ambiente, cuit, acceso, solicitud.puntoVenta, solicitud.cbteTipo)) + 1;
    return pedir(numero);
  }
}

export async function qrFactura(input: {
  fecha: string;
  cuit: string;
  ptoVta: number;
  tipoCmp: number;
  nroCmp: number;
  importe: number;
  tipoDocRec: number;
  nroDocRec: string;
  cae: string;
}) {
  const payload = {
    ver: 1,
    fecha: input.fecha,
    cuit: Number(input.cuit),
    ptoVta: input.ptoVta,
    tipoCmp: input.tipoCmp,
    nroCmp: input.nroCmp,
    importe: input.importe,
    moneda: "PES",
    ctz: 1,
    tipoDocRec: input.tipoDocRec,
    nroDocRec: Number(input.nroDocRec),
    tipoCodAut: "E",
    codAut: Number(input.cae),
  };
  const url = `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(payload)).toString("base64")}`;
  const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 180 });
  return { url, dataUrl };
}
