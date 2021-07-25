module.exports = {
  extends: '@loopback/eslint-config',
  plugins: ['eslint-plugin', '@typescript-eslint', 'ava'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/naming-convention': 'off',
    '@typescript-eslint/no-shadow': 'off',

    // disable all mocha rules
    'mocha/handle-done-callback': 'off',
    'mocha/no-exclusive-tests': 'off',
    'mocha/no-identical-title': 'off',
    'mocha/no-nested-tests': 'off',
  },
};
