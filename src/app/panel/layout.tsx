import type { Metadata } from "next";
import { MARCA, PRODUCTO } from "@/lib/marca";

// Las tres familias del sistema de diseño, auto-alojadas.
//
// Se usan los paquetes de Fontsource en vez de `next/font/google` a propósito:
// `next/font/google` descarga las fuentes DESDE GOOGLE EN CADA BUILD, y si esa
// llamada falla (red, proxy, un corte del lado de Google) el build entero se
// cae. Fontsource trae los .woff2 dentro del paquete de npm, así que el build
// no depende de ninguna red y las fuentes igual se sirven desde el propio
// dominio, sin que el navegador del cliente le pegue nunca a Google.
//
// Es el mismo criterio que ya venía usando el proyecto ("evita depender de una
// descarga de Google Fonts en cada build"), pero sin resignar las tres familias
// que pide el sistema de diseño.
//
// Archivo y Public Sans son variables (un archivo cubre todos los pesos). De
// IBM Plex Mono se traen solo los tres pesos que se usan en números.
import "@fontsource-variable/archivo";
import "@fontsource-variable/public-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";

export const metadata: Metadata = {
  title: `Panel de ${PRODUCTO} — ${MARCA}`,
  description: `Panel de gestión de ${PRODUCTO}, el sistema de pedidos por WhatsApp de ${MARCA} para carnicerías.`,
};

// Evita el parpadeo de tema: si el carnicero forzó claro u oscuro, se aplica
// antes del primer pintado en vez de después de hidratar.
const SCRIPT_TEMA = `
try {
  var t = localStorage.getItem('carnicom-tema');
  if (t === 'claro' || t === 'oscuro') document.documentElement.setAttribute('data-tema', t);
} catch (e) {}
`;

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel min-h-screen w-full bg-bg font-panel text-ink">
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      {children}
    </div>
  );
}
