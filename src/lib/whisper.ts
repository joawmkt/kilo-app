import OpenAI, { toFile } from "openai";

const MODELO_TRANSCRIPCION = process.env.OPENAI_WHISPER_MODEL || "whisper-1";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta OPENAI_API_KEY en las variables de entorno.");
  }
  client = new OpenAI({ apiKey });
  return client;
}

export async function transcribirAudio(audio: Buffer, nombreArchivo = "audio.ogg"): Promise<string> {
  const archivo = await toFile(audio, nombreArchivo);
  const resultado = await getClient().audio.transcriptions.create({
    file: archivo,
    model: MODELO_TRANSCRIPCION,
    language: "es",
  });
  return resultado.text.trim();
}
