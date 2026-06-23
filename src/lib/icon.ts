/**
 * Resolve a skill icon path to a URL under the app's base path (U9).
 *
 * Skill `icon` fields are repo-relative (`img/abilities/<tree>/<Name>.png`). They
 * must be joined onto `import.meta.env.BASE_URL` — NOT served from an absolute
 * `/img/...` — so the build works under a GitHub Pages project path
 * (`/<repo>/`). Any leading slash on the icon is stripped so the result always
 * stays under the base.
 */
export function iconSrc(icon: string, base: string): string {
  const b = base.endsWith('/') ? base : base + '/'
  return b + icon.replace(/^\/+/, '')
}
