module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo bundles the Reanimated/Worklets plugin and the
    // expo-router transform, so no extra plugins are needed here.
    presets: [["babel-preset-expo", { jsxImportSource: "react" }]],
  };
};
