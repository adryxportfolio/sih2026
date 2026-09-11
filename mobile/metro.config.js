const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// supabase-js ships browser/node conditions; RN needs these resolved explicitly.
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ["require", "react-native", "browser", "default"];

module.exports = config;
