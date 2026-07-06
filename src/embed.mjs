export function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot;
}

export async function makeEmbedder() {
  const { pipeline } = await import("@xenova/transformers");
  const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  return async (text) => {
    const out = await extractor(text.slice(0, 2000), { pooling: "mean", normalize: true });
    return Array.from(out.data);
  };
}
