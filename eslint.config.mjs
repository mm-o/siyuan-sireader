import antfu from '@antfu/eslint-config'
import perfectionist from 'eslint-plugin-perfectionist'

export default antfu(
  {
    type: 'lib',
    stylistic: {
      indent: 2, // 4, or 'tab'
      quotes: 'single', // or 'double'
    },

    vue: true,
    typescript: true,

    formatters: true,

    ignores: [
      'dist',
      'node_modules',
    ],
  },
  {
    files: [
      'src/**/*.vue',
    ],
    rules: {
    },
  },
  {
    files: [
      'src/**/*.ts',
    ],
    rules: {
    },
  },
  {
    rules: {
      'antfu/top-level-function': 'off',
      'antfu/if-newline': 'off',

      'eqeqeq': 'off',

      'no-console': 'off',
      'no-empty': 'off',

      'object-curly-newline': ['error', {
        multiline: true,
        minProperties: 2,
        consistent: true,
      }],
      'object-property-newline': ['error', {
        allowAllPropertiesOnSameLine: false,
      }],

      'style/arrow-parens': ['warn', 'always'],
      'style/brace-style': 'off',
      'style/no-multiple-empty-lines': ['warn', {
        max: 7,
      }],
      'style/operator-linebreak': ['warn', 'before', {
        overrides: {
          '=': 'ignore',
        },
      }],
      'style/padded-blocks': 'off',
      'style/quotes': 'off',

      'ts/consistent-type-imports': 'off',
      'ts/explicit-function-return-type': 'off',
      'ts/no-require-imports': 'off',
      'ts/no-use-before-define': 'warn',
      'ts/prefer-literal-enum-member': 'off',
      'ts/strict-boolean-expressions': 'off',

      'unused-imports/no-unused-vars': 'warn',
      'unused-imports/no-unused-imports': 'warn',
      'unicorn/prefer-dom-node-text-content': 'off',

      'format/prettier': 'off',

      'regexp/optimal-quantifier-concatenation': 'warn',
      'regexp/no-super-linear-backtracking': 'warn',
      'regexp/no-unused-capturing-group': 'warn',

      'style/comma-dangle': ['error', 'always-multiline'],

      'vue/block-order': ['warn', {
        order: ['template', 'script', 'style'],
      }],
      'vue/block-tag-newline': 'off',

      'vue/eqeqeq': ['warn', 'smart'],

      'vue/first-attribute-linebreak': ['warn', {
        multiline: 'below',
      }],
      "vue/no-mutating-props": ["error", {
        shallowOnly: true,
      }],
      'vue/max-attributes-per-line': ['error', {
        singleline: {
          max: 1,
        },
        multiline: {
          max: 1,
        },
      }],
      'vue/attribute-hyphenation': 'off',
      'vue/v-on-event-hyphenation': 'off',

      'vue/html-self-closing': 'off',
      'vue/multiline-html-element-content-newline': 'off',

      'vue/valid-template-root': 'off',

      'vue/object-curly-newline': ['error', {
        multiline: true,
        minProperties: 2,
        consistent: true,
      }],
      'vue/object-property-newline': ['error', {
        allowAllPropertiesOnSameLine: false,
        allowMultiplePropertiesPerLine: true,
      }],
    },
  },
)
