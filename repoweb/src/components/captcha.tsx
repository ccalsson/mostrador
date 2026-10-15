import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void },
  ) => string;
  remove: (id: string) => void;
};

export function Captcha({ onToken }: { onToken: (token: string) => void }) {
  const site = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();
  const caja = useRef<HTMLDivElement>(null);
  const aviso = useRef(onToken);
  aviso.current = onToken;

  useEffect(() => {
    if (!site || !caja.current) return;
    let id = "";
    let cancelado = false;
    const arrancar = () => {
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (!api || !caja.current || cancelado) return;
      id = api.render(caja.current, {
        sitekey: site,
        callback: (token) => aviso.current(token),
        "expired-callback": () => aviso.current(""),
      });
    };
    const previo = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
    if ((window as unknown as { turnstile?: TurnstileApi }).turnstile) arrancar();
    else if (previo) previo.addEventListener("load", arrancar, { once: true });
    else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.dataset.turnstile = "1";
      script.onload = arrancar;
      document.head.appendChild(script);
    }
    return () => {
      cancelado = true;
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (id && api) api.remove(id);
    };
  }, [site]);

  if (!site) return null;
  return <div ref={caja} className="min-h-16" />;
}
