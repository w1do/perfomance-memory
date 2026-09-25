/** Блок кода MCP (.code-block из controls.css): метка <MCP_TOKEN> подсвечена .token-ph, копируется буквально. */
import { Fragment } from 'react';
import { TOKEN } from './snippets';

export function McpCodeBlock({
  label,
  code,
  onCopy,
}: {
  label: string;
  code: string;
  onCopy: (code: string) => void;
}) {
  const parts = code.split(TOKEN);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-caption font-semibold text-text-2">{label}</span>
        <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={() => onCopy(code)}>
          Копировать
        </button>
      </div>
      <pre className="code-block m-0">
        {parts.map((part, i) => (
          <Fragment key={i}>
            {i > 0 && <mark className="token-ph">{TOKEN}</mark>}
            {part}
          </Fragment>
        ))}
      </pre>
    </div>
  );
}
