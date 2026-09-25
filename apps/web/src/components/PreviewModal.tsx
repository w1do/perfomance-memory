/**
 * Превью обогащения перед сохранением: Modal lg (3D new-entry, роль ai), bento в две колонки от 768 —
 * текст на всю ширину, поля правила и папки, ограничения; одна сплошная кнопка «Сохранить» закреплена внизу.
 */
import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { resultMessage } from '../lib/saveMessage';
import type { Enrichment, FolderNode, Preview } from '../lib/types';
import { ConstraintEditor } from './ConstraintEditor';
import { splitList, splitPath } from './Field';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { PreviewMetaSection, type MetaText } from './preview/PreviewMetaSection';
import { PreviewTextSection } from './preview/PreviewTextSection';
import { useToast } from './Toasts';

export { resultMessage } from '../lib/saveMessage';

function flatPaths(nodes: FolderNode[]): string[] {
  return nodes.flatMap((n) => [n.path.join(' / '), ...flatPaths(n.children)]);
}

const metaOf = (e: Enrichment): MetaText => ({
  path: e.folder_path.join(' / '),
  tags: e.tags.join(', '),
  applies: e.applies_to.join(', '),
});

export function PreviewModal({
  preview,
  folders,
  source,
  onClose,
}: {
  preview: Preview;
  folders: FolderNode[];
  source: 'voice' | 'text';
  onClose: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState(preview.text);
  const [e, setE] = useState<Enrichment>(preview.enrichment);
  const [meta, setMeta] = useState<MetaText>(() => metaOf(preview.enrichment));
  const [similar, setSimilar] = useState(preview.similar_folders);
  const [busy, setBusy] = useState<'save' | 'redo' | null>(null);
  const paths = useMemo(() => flatPaths(folders), [folders]);
  const target = splitPath(meta.path);
  const exists = paths.some((p) => p.toLowerCase() === target.join(' / ').toLowerCase());

  const redo = async () => {
    setBusy('redo');
    try {
      const p = await api.preview(text);
      setE(p.enrichment);
      setMeta(metaOf(p.enrichment));
      setSimilar(p.similar_folders);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    try {
      const enrichment: Enrichment = {
        ...e,
        folder_path: target,
        tags: splitList(meta.tags),
        applies_to: splitList(meta.applies),
        constraints: e.constraints.filter((c) => c.metric.trim()),
        details: e.details?.trim() ? e.details : null,
        project: e.project?.trim() ? e.project : null,
      };
      const result = await api.save({ ...preview, text, enrichment }, source);
      toast(resultMessage(result));
      onClose();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      size="lg"
      icon3d="new-entry"
      tone="ai"
      eyebrow="Превью обогащения"
      title="Проверьте перед сохранением"
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={busy !== null || !e.statement.trim() || !target.length}
          >
            <Icon name="check" /> {busy === 'save' ? 'Сохраняю…' : 'Сохранить'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Отмена
          </button>
        </>
      }
    >
      <div className="grid gap-md md:grid-cols-2">
        <PreviewTextSection
          source={source}
          text={text}
          onText={setText}
          onRedo={redo}
          busy={busy}
        />
        <PreviewMetaSection
          e={e}
          setE={setE}
          meta={meta}
          setMeta={setMeta}
          paths={paths}
          exists={exists}
          similar={similar}
        />
        <section className="flex flex-col gap-sm md:col-span-2">
          <span className="eyebrow">Ограничения</span>
          <ConstraintEditor
            value={e.constraints}
            onChange={(constraints) => setE({ ...e, constraints })}
          />
        </section>
      </div>
    </Modal>
  );
}
