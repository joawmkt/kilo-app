# Carnicom

App/CRM para carnicerías — bot de pedidos por WhatsApp con gestión de stock.

## Etapa 1 — Infraestructura base

Estado actual: proyecto Next.js con ruta de webhook de WhatsApp (Twilio) que
guarda cada mensaje entrante en Supabase. Sin lógica de negocio todavía —
el objetivo de esta etapa es solo que el cableado funcione.

### Setup local

1. `npm install`
2. Copiá `.env.local.example` a `.env.local` y completá con tus credenciales
   reales de Supabase y Twilio.
3. `npm run dev` — corre en http://localhost:3000

### Base de datos

El esquema completo (tablas + Row Level Security) está en
[`supabase/schema.sql`](./supabase/schema.sql). Se corre una sola vez desde
el SQL Editor de tu proyecto de Supabase.

### Webhook de WhatsApp

`POST /api/webhook/whatsapp` — recibe los mensajes entrantes de Twilio,
valida la firma, y los guarda en la tabla `mensajes_whatsapp`. Configurá
esta URL (con tu dominio de Vercel) como "WHEN A MESSAGE COMES IN" en el
sandbox de WhatsApp de Twilio.

### Variables de entorno necesarias

Ver `.env.local.example`. En producción (Vercel) se cargan desde
Project Settings → Environment Variables, nunca committeadas al repo.
