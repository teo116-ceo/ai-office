// Browser global shims for pure-function tests that transitively import store slices
const noopStorage = {
  getItem: (_key: string) => null,
  setItem: (_key: string, _value: string) => {},
  removeItem: (_key: string) => {},
  clear: () => {},
  length: 0,
  key: (_index: number) => null,
} satisfies Storage

;(globalThis as Record<string, unknown>)['localStorage'] = noopStorage
;(globalThis as Record<string, unknown>)['sessionStorage'] = noopStorage
