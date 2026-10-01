declare module "node-forge" {
  interface SignedData {
    content: unknown;
    addCertificate(cert: unknown): void;
    addSigner(signer: Record<string, unknown>): void;
    sign(opts?: { detached?: boolean }): void;
    toAsn1(): unknown;
  }
  interface Forge {
    pki: {
      oids: Record<string, string>;
      certificateFromPem(pem: string): unknown;
      certificateFromAsn1(obj: unknown): unknown;
      privateKeyFromPem(pem: string): unknown;
      privateKeyFromAsn1(obj: unknown): unknown;
    };
    pkcs7: { createSignedData(): SignedData };
    pem: { decode(pem: string): { body: string; type: string }[] };
    asn1: {
      toDer(obj: unknown): { getBytes(): string };
      fromDer(der: string): unknown;
    };
    util: {
      createBuffer(data: string, enc?: string): unknown;
      encode64(bytes: string): string;
      decode64(data: string): string;
    };
  }
  const forge: Forge;
  export default forge;
}

declare module "qrcode" {
  const QRCode: {
    toDataURL(text: string, opts?: { margin?: number; width?: number }): Promise<string>;
  };
  export default QRCode;
}
