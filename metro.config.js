const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const nonWindowsMsgpackrExtractPackages = [
  'msgpackr-extract-darwin-arm64',
  'msgpackr-extract-darwin-x64',
  'msgpackr-extract-linux-arm',
  'msgpackr-extract-linux-arm64',
  'msgpackr-extract-linux-x64',
];

const optionalNativePackagePaths = nonWindowsMsgpackrExtractPackages.map(
  (packageName) =>
    new RegExp(
      `${escapeRegExp(path.join(__dirname, 'node_modules', '@msgpackr-extract', packageName))}($|[/\\\\])`,
    ),
);

const defaultBlockList = config.resolver.blockList
  ? Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]
  : [];

config.resolver.blockList = [
  ...defaultBlockList,
  ...optionalNativePackagePaths,
];

module.exports = config;