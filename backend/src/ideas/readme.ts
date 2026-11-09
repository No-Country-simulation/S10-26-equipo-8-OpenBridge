import type { RepoRef } from '../ingest/github.js';

// Unos 3.000 tokens: deja lugar a las instrucciones y los ejemplos dentro
// del contexto de 8.192 que se le pide a Ollama (ver model.ts).
const DEFAULT_MAX_CHARS = 12_000;

// La API REST encuentra el README aunque se llame readme.rst o README.markdown.
// Devuelve null si el repo no tiene.
export async function fetchReadme(
  { owner, name }: RepoRef,
  { token }: { token: string },
): Promise<string | null> {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/readme`,
    {
      headers: {
        Accept: 'application/vnd.github.raw+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub respondió ${response.status} al pedir el README`);
  return response.text();
}

// Bloques de código y código inline: se dejan intactos, porque ahí `<` y `>`
// son genéricos o comparaciones, no HTML.
const CODE = /(```[\s\S]*?```|`[^`\n]*`)/;
const HTML_TAG = /<\/?[a-zA-Z][\w-]*(?:\s[^<>]*)?\/?>/g;

function cleanProse(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(HTML_TAG, '');
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  let cut = text.slice(0, maxChars);
  if (text[maxChars] !== '\n') {
    const lastBreak = cut.lastIndexOf('\n');
    if (lastBreak > 0) cut = cut.slice(0, lastBreak);
  }
  cut = cut.trimEnd();
  // Un bloque de código sin cerrar confunde al modelo.
  const fences = cut.match(/^```/gm)?.length ?? 0;
  return fences % 2 === 1 ? `${cut}\n\`\`\`` : cut;
}

// Deja solo el texto útil para el modelo: los badges, imágenes y HTML
// gastan contexto sin decir nada sobre cómo se integra la herramienta.
export function cleanReadme(markdown: string, maxChars = DEFAULT_MAX_CHARS): string {
  // Recortar antes de limpiar acota el costo de las regex en READMEs enormes.
  const text = markdown
    .slice(0, maxChars * 4)
    .split(CODE)
    .map((part, index) => (index % 2 === 1 ? part : cleanProse(part)))
    .join('')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return truncate(text, maxChars);
}
