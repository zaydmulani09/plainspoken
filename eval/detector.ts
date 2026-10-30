// Free, local AI-text detector for the eval: TMR, a RoBERTa-base classifier
// trained on the RAID benchmark (MIT license), run on CPU through the ONNX
// build in transformers.js. Labels: "ai" and "human".
import { pipeline } from "@huggingface/transformers";

export const DETECTOR = {
  name: "TMR AI text detector (Oxidane/tmr-ai-text-detector)",
  build: "onnx-community/tmr-ai-text-detector-ONNX, fp32, transformers.js 4.3.1, CPU",
  url: "https://huggingface.co/Oxidane/tmr-ai-text-detector",
};

type Classifier = (text: string, opts: { top_k: null }) => Promise<{ label: string; score: number }[]>;
let classifier: Promise<Classifier> | null = null;

// Probability that the text is AI-written. RoBERTa reads at most 512 tokens,
// and the eval texts are shorter than that.
export async function aiProbability(text: string): Promise<number> {
  classifier ??= pipeline("text-classification", "onnx-community/tmr-ai-text-detector-ONNX", { dtype: "fp32" }) as unknown as Promise<Classifier>;
  const out = await (await classifier)(text, { top_k: null });
  return out.find((x) => x.label === "ai")?.score ?? 0;
}
