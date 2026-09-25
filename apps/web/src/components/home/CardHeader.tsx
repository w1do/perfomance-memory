/** Шапка карточки главной (.card-head): eyebrow, h2.text-h3 и подпись; правый верх свободен под 3D-иконку. */
import type { ReactNode } from 'react';

export function CardHeader({
  id,
  eyebrow,
  title,
  sub,
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="card-head mb-md">
      <div className="eyebrow">{eyebrow}</div>
      <h2 id={id} className="text-h3">
        {title}
      </h2>
      {sub && <p className="m-0 mt-1 text-text-2">{sub}</p>}
    </div>
  );
}
