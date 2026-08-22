-- Actualiza el número de WhatsApp de la carnicería piloto: pasamos del
-- número de "Try out WhatsApp" (herramienta de prueba solo para cuentas
-- trial, que dejó de funcionar al hacer upgrade de la cuenta de Twilio) al
-- número real y permanente del Twilio Sandbox for WhatsApp
-- (+14155238886, compartido por todos los usuarios del Sandbox, activado
-- desde la consola legacy de Twilio — 22/08/2026).
update carnicerias
set telefono_whatsapp = 'whatsapp:+14155238886'
where telefono_whatsapp = 'whatsapp:+17372508034';
