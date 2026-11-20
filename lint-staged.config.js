export default {
  '*.{ts,tsx}': (files) => [
    `eslint --fix --max-warnings=0 ${files.join(' ')}`,
    `prettier --write ${files.join(' ')}`,
  ],
  '*.{css,scss}': (files) => [
    `stylelint --fix ${files.join(' ')}`,
    `prettier --write ${files.join(' ')}`,
  ],
};
