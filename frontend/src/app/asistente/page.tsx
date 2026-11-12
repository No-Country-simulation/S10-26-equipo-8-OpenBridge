import type { Metadata } from 'next';
import { AssistantWorkspace } from '@/components/assistant/assistant-workspace';

export const metadata: Metadata = {
  title: 'Asistente · OpenBridge',
  description: 'Describí tu negocio y recibí una arquitectura con herramientas open source.',
};

export default async function AsistentePage({ searchParams }: PageProps<'/asistente'>) {
  const { description } = await searchParams;
  const initial = (Array.isArray(description) ? description[0] : description)?.trim() ?? '';

  return (
    <main className="flex flex-1 flex-col">
      <AssistantWorkspace initialDescription={initial} />
    </main>
  );
}
