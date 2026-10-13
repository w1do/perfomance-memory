/** Итог импорта: что создано, что пропущено и почему; сообщения сервиса выводятся как текст. */
import type { ImportReport } from '../../lib/schemaTypes';

const ROWS: {
  key: keyof Pick<
    ImportReport,
    'folders_created' | 'rules_created' | 'duplicates' | 'conflicts' | 'errors'
  >;
  label: string;
}[] = [
  { key: 'folders_created', label: 'Создано папок' },
  { key: 'rules_created', label: 'Создано правил' },
  { key: 'duplicates', label: 'Пропущено дублей' },
  { key: 'conflicts', label: 'Пропущено противоречий' },
  { key: 'errors', label: 'Ошибок' },
];

export function ImportReportBody({ report }: { report: ImportReport }) {
  return (
    <div className="flex flex-col gap-md">
      <ul className="flex flex-col gap-2">
        {ROWS.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3">
            <span>{row.label}</span>
            <span className="mono font-semibold">{report[row.key]}</span>
          </li>
        ))}
      </ul>
      {report.messages.length > 0 && (
        <ul className="flex flex-col gap-1 text-caption text-text-2">
          {report.messages.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
