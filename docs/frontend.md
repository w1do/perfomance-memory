# Интерфейс: оформление и анимации

## Оформление

Всё оформление взято из MCP-склада CMS: жанр `landing`, направление `landing-d1328fa3`, семейство `frost-01`
(«Иней»), пара шрифтов Inter + JetBrains Mono. Токены — в `apps/web/src/styles/tokens.css` и
`apps/web/tailwind.config.ts`; ассеты — в `apps/web/src/assets/` (пути склада — в `manifest.json`, чего не нашлось —
в `missing.json`).

**Авторы и лицензии наборов склада:** иконки Termicons (line) и Universal Icons (line); иллюстрации Tech; фоны
Hero Patterns — автор Steve Schoger ([heropatterns.com](https://heropatterns.com)), CC BY 4.0; фон Icon sheets
«coding»; декор Type ornaments; объёмные иконки CTA icons (extrude); фоны Platform (перспективные сетки, пятна,
орбиты). В интерфейсе подвал показывает только «Сделано для YouTube-канала W1DO_DIGITAL».

### Интерфейс: оформление и анимации

**Откуда токены.** Палитра, шрифты, радиусы, тени и длительности — из `palette_show("frost-01")`:
светлая тема в `apps/web/src/styles/tokens.css`, тёмная — в `tokens-dark.css`. Производные токены
(`--color-muted-strong` для AA на стекле, `--radius-card` 16px, `--motion-duration-fast`) и дословные записи
каталога градиентов `brand_storm` (`--grad-*`) — в `tokens-fx.css`. Компоненты используют только эти переменные
и классы Tailwind из `apps/web/tailwind.config.ts`; сырые цвета допустимы только в `tokens*.css`.

**Из чего собран экран.** Стили разбиты на небольшие файлы, индекс — `styles/app.css`:
`base.css` (оболочка, шапка-стекло после прокрутки), `components.css` и `controls.css` (кнопки, поля, чипы, вкладки
`.seg`, блоки кода, подсказки `.tip`, `.collapse`), `roles.css` (краска роли по `data-role`), `card.css` и
`card-fx.css` (карточка bento, бегущая обводка, подъём и свечение на hover), `icon3d.css` (объёмные иконки),
`backdrop.css` (сияние и сетка фона), `mcp.css` (MCP-полоса и чип в шапке), `motion.css` и `motion-run.css` (анимации).
React-примитивы: `components/ui/Card.tsx`, `components/ui/Tip.tsx`, `components/fx/Icon3D.tsx`,
`components/fx/PageBackdrop.tsx`.

**Как добавить 3D-иконку.**
1. Найдите объёмную иконку на складе CMS (`assets_search`, набор `decor-cta-icons`, стиль extrude) и положите файл
   в `apps/web/src/assets/icons3d/<имя>.svg`.
2. Добавьте запись в `apps/web/src/assets/manifest.json`: ключ `3d-<имя>`, путь склада, набор, подпись.
3. Добавьте имя в тип `Icon3DName` (`src/lib/assets.ts`) и используйте: `<Card icon3d="<имя>" tone="ui">` —
   иконка встанет в правый верхний угол и окрасится градиентом роли карточки; отдельно — `<Icon3D name="<имя>" />`.

**Где крутить прозрачности.** Всё в `tokens-fx.css`: пятна сияния (`--aurora-*-o`), сетка первого экрана
(`--grid-o`), стекло (`--glass-alpha`) и сплошные карточки (`--solid-alpha`), размеры 3D (`--s3d-*`),
z-слои (`--z-*`). Горошек экрана папок — `--texture-opacity` в `tokens*.css`.

**Движение.** Только эффекты из палитры frost-01: появление `fade-up` и `blur-in` (один раз, очередь 80 мс),
`draw`, постоянное движение (`border-run`, `float`, `sheen`, скан пола) — только у двух акцентов, hero и
PREFERENCES.md; фон — медленный `drift`/`breathe` пятен и сетки (только `transform`). Параллакс 3D — один
делегированный `pointermove` с rAF (`hooks/useAmbientMotion.ts`), только для мыши.

**Что отключает reduced motion.** При `prefers-reduced-motion: reduce` все `animation` не объявляются вовсе, переходы
мгновенные, фон и 3D стоят, параллакса нет, `sheen` и скан пола скрыты, у hero остаётся неподвижная дуга обводки;
весь контент виден сразу. На скрытой вкладке (`html[data-idle="paused"]`) все анимации стоят на паузе.
При `prefers-reduced-transparency` стекло становится сплошным, при `forced-colors` декор и 3D скрываются.
