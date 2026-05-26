import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  // 검사 제외 경로
  { ignores: ['dist', 'dist-electron', 'node_modules', 'release', 'scripts'] },

  // ─── 공통 TypeScript 규칙 ────────────────────────────────────────────────
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // React Hooks — 규칙 위반은 에러 (잘못된 훅 사용은 런타임 크래시로 이어짐)
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'warn',   // deps 누락은 warn (기존 코드 점진적 개선)

      // Vite HMR — 컴포넌트를 named export로 내보낼 것을 권장
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // TypeScript
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // 일반 품질
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'eqeqeq': ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  // ─── 서버 전용 — Node.js 환경, console 허용 ──────────────────────────────
  {
    files: ['server/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
    },
  },
)
