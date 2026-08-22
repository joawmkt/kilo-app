// Utilidades de texto compartidas — normalización simple para comparar
// palabras dichas por WhatsApp/voz sin depender de mayúsculas ni acentos.

const DIACRITICOS = /[̀-ͯ]/g;

export function normalizarTexto(texto: string): string {
  return texto.normalize("NFKD").replace(DIACRITICOS, "").toLowerCase().trim();
}

export function escapeXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
