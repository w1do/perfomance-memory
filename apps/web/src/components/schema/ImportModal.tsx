/** Импорт схемы: файл → предпросмотр с выбором → отчёт. Записи делает только «Применить». */
import { useState, type ChangeEvent } from 'react';
import { api } from '../../lib/api';
import { readJsonFile } from '../../lib/schemaFile';
import type { ImportPreview, ImportReport, ImportSelection } from '../../lib/schemaTypes';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import { useToast } from '../Toasts';
import { ImportPreviewBody } from './ImportPreviewBody';
import { ImportReportBody } from './ImportReportBody';

type Step = 'file' | 'preview' | 'report';

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Ошибка импорта');

export function ImportModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [step, setStep] = useState<Step>('file');
  const [pkg, setPkg] = useState<unknown>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [all, setAll] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const data = await readJsonFile(file);
      const p = await api.importPreview(data);
      setPkg(data);
      setPreview(p);
      setAll(true);
      setChecked(new Set());
      setStep('preview');
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    const selection: ImportSelection = { all, folders: all ? [] : [...checked] };
    setBusy(true);
    try {
      const r = await api.importApply(pkg, selection);
      setReport(r);
      setStep('report');
      const failed = r.errors > 0 && r.rules_created === 0;
      toast(`Импортировано правил: ${r.rules_created}`, failed ? 'error' : 'success');
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const footer =
    step === 'preview' ? (
      <>
        <button
          className="btn btn-primary"
          disabled={busy || (!all && checked.size === 0)}
          onClick={apply}
        >
          <Icon name="upload" /> Применить
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Отмена
        </button>
      </>
    ) : step === 'report' ? (
      <button className="btn btn-primary" onClick={onClose}>
        Готово
      </button>
    ) : undefined;

  return (
    <Modal
      title="Импорт схемы"
      eyebrow="Поделиться правилами"
      size="lg"
      onClose={onClose}
      footer={footer}
    >
      <div className="flex flex-col gap-md">
        {step === 'file' && (
          <>
            <p>
              Выберите JSON-файл схемы, экспортированный из другого «Сервиса моих предпочтений».
            </p>
            <input
              type="file"
              accept=".json,application/json"
              className="input"
              disabled={busy}
              onChange={onFile}
            />
          </>
        )}
        {step === 'preview' && preview && (
          <>
            {busy && (
              <p role="status" className="text-caption text-text-2">
                Импортирую: считаю эмбеддинги и проверяю дубли — до пары минут…
              </p>
            )}
            <ImportPreviewBody
              preview={preview}
              all={all}
              onAll={setAll}
              checked={checked}
              onToggle={toggle}
            />
          </>
        )}
        {step === 'report' && report && <ImportReportBody report={report} />}
      </div>
    </Modal>
  );
}
