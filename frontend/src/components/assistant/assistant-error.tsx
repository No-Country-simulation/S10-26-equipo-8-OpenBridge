import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AssistantError } from '@/lib/assistant';

function describe(error: AssistantError) {
  switch (error.code) {
    case 'VALIDATION_ERROR':
      return {
        title: 'La descripción no es válida',
        text: 'Tiene que tener entre 20 y 2.000 caracteres.',
      };
    case 'INSUFFICIENT_CONTEXT':
      return {
        title: 'Necesitamos un poco más de contexto',
        text: 'Contanos de qué industria es, quiénes lo usan y a qué escala.',
      };
    case 'RATE_LIMITED':
      return {
        title: 'Hiciste muchas consultas seguidas',
        text: error.retryAfterSeconds
          ? `Esperá ${error.retryAfterSeconds} segundos y probá de nuevo. Tu consulta quedó guardada.`
          : 'Esperá un minuto y probá de nuevo. Tu consulta quedó guardada.',
      };
    case 'UPSTREAM_TIMEOUT':
      return {
        title: 'No pudimos generar la arquitectura',
        text: 'El asistente no respondió a tiempo. Tu consulta quedó guardada.',
      };
    default:
      return {
        title: 'No pudimos generar la arquitectura',
        text: 'Algo salió mal de nuestro lado. Tu consulta quedó guardada.',
      };
  }
}

export function AssistantErrorMessage({
  error,
  onRetry,
}: {
  error: AssistantError;
  onRetry: () => void;
}) {
  const { title, text } = describe(error);
  // Con una descripción vaga o inválida reintentar igual no sirve: hay que editarla.
  const editFirst = error.code === 'VALIDATION_ERROR' || error.code === 'INSUFFICIENT_CONTEXT';
  // Si faltó contexto, el modelo dice qué le falta: esas preguntas reemplazan el texto genérico.
  const questions =
    error.code === 'INSUFFICIENT_CONTEXT'
      ? error.details.map((d) => d.issue?.trim()).filter((q): q is string => !!q)
      : [];

  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-6 text-center">
      <TriangleAlert className="size-6 text-health-risk" strokeWidth={1.5} aria-hidden="true" />
      <p className="mt-1 text-sm font-semibold">{title}</p>
      {questions.length > 0 ? (
        <>
          <ul className="max-w-110 list-disc space-y-1 pl-5 text-left text-[13px] leading-5 text-muted-foreground">
            {questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <p className="max-w-90 text-[13px] leading-5 text-muted-foreground">
            Respondé en la conversación y vuelvo a armar la propuesta.
          </p>
        </>
      ) : (
        <p className="max-w-90 text-[13px] leading-5 text-muted-foreground">
          {error.code === 'INSUFFICIENT_CONTEXT'
            ? `${text} Respondé en la conversación y vuelvo a armar la propuesta.`
            : text}
        </p>
      )}
      {!editFirst && (
        <Button type="button" variant="outline" onClick={onRetry} className="mt-2 gap-2">
          <RotateCcw className="size-4" strokeWidth={1.5} aria-hidden="true" />
          Reintentar
        </Button>
      )}
    </div>
  );
}
