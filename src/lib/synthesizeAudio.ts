import { CartesiaClient } from "@cartesia/cartesia-js";

export async function synthesizeAudio(chunk: string): Promise<ArrayBuffer> {
  const CartesiaKey = process.env.CARTESIA_API_KEY;
  const client = new CartesiaClient({ apiKey: CartesiaKey });

  const response = await client.tts.bytes({
    modelId: "sonic-2",
    transcript: chunk,
    voice: {
      mode: "id",
      id: "f9836c6e-a0bd-460e-9d3c-f7299fa60f94",
    },
    language: "en",
    outputFormat: {
      container: "mp3",
      sampleRate: 48000, 
      bitRate: 128000,   
    }
  });

  return response;
}
