/** Фасад передачи схемы для api: экспорт, предпросмотр и применение импорта. Логика — в соседних модулях. */
import type { PrefDeps } from '../preferences/deps.js';
import { applyImport, type Write } from './apply.js';
import { buildSchemaPackage } from './export.js';
import type { ExportInput, ImportReport, ImportSelection, SchemaPackage } from './format.js';
import { previewImport, type ImportPreview } from './preview.js';

export class TransferService {
  constructor(
    private readonly deps: PrefDeps,
    private readonly write: Write,
  ) {}

  export(input: ExportInput): Promise<SchemaPackage> {
    return buildSchemaPackage(this.deps, input);
  }

  preview(raw: unknown): Promise<ImportPreview> {
    return previewImport(this.deps, raw);
  }

  apply(raw: unknown, sel: ImportSelection): Promise<ImportReport> {
    return applyImport(this.deps, this.write, raw, sel);
  }
}
