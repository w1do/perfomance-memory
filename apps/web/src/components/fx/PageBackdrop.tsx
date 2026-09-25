/**
 * Фон страницы (backdrop.css): сияние из записей каталога градиентов brand_storm (fixed) и сетка
 * первого экрана из backgrounds/grid-tile.svg (главная) или горошек texture.svg (остальные экраны).
 */
export function PageBackdrop({ page }: { page: 'home' | 'folders' | 'login' }) {
  return (
    <>
      <div className="aurora" aria-hidden="true">
        <span className="aurora__wash" />
        <span className="aurora__spot aurora__spot--a" />
        <span className="aurora__spot aurora__spot--b" />
        <span className="aurora__spot aurora__spot--c" />
        {page !== 'home' && <span className="aurora__dots" />}
      </div>
      {page === 'home' && (
        <div className="grid-band" aria-hidden="true">
          <span className="grid-band__tile" />
        </div>
      )}
    </>
  );
}
