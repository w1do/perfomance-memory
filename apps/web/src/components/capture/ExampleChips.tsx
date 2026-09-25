/** Три чипа-примера под полем ввода hero: клик только подставляет текст, без отправки (.chip--example). */
const EXAMPLES = [
  'Не люблю файлы длиннее 100 строк',
  'В проекте Дача — всё без покраски',
  'На рыбалке не люблю вставать раньше пяти',
];

export function ExampleChips({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-caption text-text-2">Например:</span>
      {EXAMPLES.map((t) => (
        <button key={t} type="button" className="chip chip--example" onClick={() => onPick(t)}>
          {t}
        </button>
      ))}
    </div>
  );
}
