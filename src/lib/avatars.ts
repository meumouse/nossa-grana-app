// Avatares predefinidos (SVGs em /public/avatars). Guardamos no usuário apenas
// o caminho (ex.: "/avatars/01.svg"); a imagem é servida estaticamente.

export const PRESET_AVATARS = [
  '/avatars/01.svg',
  '/avatars/02.svg',
  '/avatars/03.svg',
  '/avatars/04.svg',
  '/avatars/05.svg',
  '/avatars/06.svg',
  '/avatars/07.svg',
  '/avatars/08.svg',
] as const;

/** É um dos avatares predefinidos (vs. foto enviada como data URI)? */
export function isPresetAvatar(url: string | null | undefined): boolean {
  return !!url && PRESET_AVATARS.includes(url as (typeof PRESET_AVATARS)[number]);
}

/** Iniciais p/ o fallback do avatar a partir de nome/sobrenome/e-mail. */
export function initialsFrom(
  name: string | null,
  surname: string | null,
  email: string,
): string {
  const a = name?.trim()?.[0] ?? '';
  const b = surname?.trim()?.[0] ?? '';
  const initials = (a + b).trim();
  return (initials || email[0] || '?').toUpperCase();
}
