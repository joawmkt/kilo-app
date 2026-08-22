import type { Metadata } from "next";
import "./globals.css";

// Usamos la pila de fuentes del sistema en vez de next/font/google: evita
// depender de una descarga de Google Fonts en cada build (más simple y
// más robusto para el MVP).

export const metadata: Metadata = {
  title: "Carnicom",
  description: "Panel de gestión para carnicerías — Etapa 1",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
