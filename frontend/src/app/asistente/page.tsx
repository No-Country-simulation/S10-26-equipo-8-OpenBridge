import type { Metadata } from 'next';
import { AssistantWorkspace } from '@/components/assistant/assistant-workspace';

export const metadata: Metadata = {
  title: 'Asistente · OpenBridge',
  description: 'Describí tu negocio y recibí una arquitectura con herramientas open source.',
};

export default function AsistentePage() {
  return (
    <main className="flex flex-1 flex-col">
      <AssistantWorkspace />
    </main>
  );
}
