import type { Metadata } from "next";
import { MARCA, PRODUCTO } from "@/lib/marca";
import "./globals.css";

// Layout raíz del SaaS.
//
// Este repositorio es SOLO la aplicación. La presentación del producto y las
// páginas legales viven en el sitio de la empresa (ainnova.com.ar), que es un
// proyecto aparte: son dos cosas distintas y conviene que se desplieguen y se
// rompan por separado.
//
// Las tipografías del panel se cargan en `src/app/panel/layout.tsx`, no acá,
// para que `/conectar` y el redirect de la raíz no arrastren tres familias que
// no usan.

export const metadata: Metadata = {
  title: {
    default: `${PRODUCTO} — Pedidos por WhatsApp para carnicerías`,
    template: `%s — ${PRODUCTO}`,
  },
  description: `${PRODUCTO} toma los pedidos de tu carnicería por WhatsApp con un asistente que consulta tu stock real. Un producto de ${MARCA}.`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
