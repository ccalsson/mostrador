/** Deja la foto en JPEG, lado mayor 720 px, para la lista del celular. */
export function fotoParaMovil(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const imagen = new Image();
    imagen.onload = () => {
      const escala = Math.min(1, 720 / Math.max(imagen.width, imagen.height));
      const ancho = Math.max(1, Math.round(imagen.width * escala));
      const alto = Math.max(1, Math.round(imagen.height * escala));
      const lienzo = document.createElement("canvas");
      lienzo.width = ancho;
      lienzo.height = alto;
      const ctx = lienzo.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("No se pudo preparar la foto."));
        return;
      }
      ctx.drawImage(imagen, 0, 0, ancho, alto);
      URL.revokeObjectURL(url);
      resolve(lienzo.toDataURL("image/jpeg", 0.78));
    };
    imagen.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la foto."));
    };
    imagen.src = url;
  });
}
