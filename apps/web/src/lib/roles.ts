/** Роли-краски интерфейса (PROMPT §7.1): имена совпадают с токенами --role-* из tokens.css. */
export type Role = 'like' | 'dislike' | 'ui' | 'ai' | 'mcp' | 'service' | 'enrich' | 'net';
/** Краска карточки или 3D-иконки: роль или основной акцент frost-01. */
export type Tone = Role | 'accent';
