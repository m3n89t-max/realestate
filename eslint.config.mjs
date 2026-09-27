import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'

export default defineConfig([
    ...nextVitals,
    ...nextTypeScript,
    {
        // Keep legacy debt visible without making the newly restored lint command unusable.
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-require-imports': 'warn',
            'react-hooks/immutability': 'warn',
            'react-hooks/rules-of-hooks': 'warn',
            'react-hooks/set-state-in-effect': 'warn',
        },
    },
    globalIgnores([
        '.next/**',
        'dist/**',
        'dist-agent/**',
        'node_modules/**',
        'supabase/functions/**',
        'tmp/**',
    ]),
])
