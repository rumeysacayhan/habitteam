// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    rules: {
      // React Native'in Animated API'si useRef(new Animated.Value(...)).current
      // desenini kullanır; bu kural React DOM için tasarlandığından 55 yanlış
      // pozitif üretiyor.
      "react-hooks/refs": "off",
    },
  },
]);
