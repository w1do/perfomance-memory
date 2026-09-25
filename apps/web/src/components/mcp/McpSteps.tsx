/**
 * Шаги подключения MCP: номер в кружке, текст, фрагменты в `обратных кавычках` — моноширинные пилюли.
 * Цвета — токены frost-01 (accent-soft для номера, surface-2 для пилюль).
 */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, i) =>
        i % 2 === 1 ? (
          <code
            key={i}
            className="mono rounded-[6px] bg-surface-2 px-1.5 py-0.5 text-text ring-1 ring-border"
          >
            {part}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function McpSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0">
      {steps.map((s, i) => (
        <li key={s} className="flex items-start gap-3 text-[15px] leading-relaxed text-text-2">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-caption font-semibold text-accent"
          >
            {i + 1}
          </span>
          <span className="min-w-0">
            <span className="sr-only">Шаг {i + 1}. </span>
            <Inline text={s} />
          </span>
        </li>
      ))}
    </ol>
  );
}
