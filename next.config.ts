import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Por defecto Next corta los Server Actions en 1 MB, pensando en
      // formularios de texto. El simulador manda audios grabados en el
      // navegador (opus, ~1 MB por minuto), así que con el tope de fábrica un
      // audio de más de un minuto fallaba sin explicación clara.
      // Este número tiene que quedar por encima de LIMITE_AUDIO_BYTES, en
      // src/app/panel/(interno)/simulador/acciones.ts.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
