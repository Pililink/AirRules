const {
  a,
  b,
  c,
  sub,
  base,
  target = "ClashMeta",
  aProvider = "A机场",
  bProvider = "B机场",
  cProvider = "C机场",
  provider = "机场1",
} = typeof $arguments !== "undefined" ? $arguments : {};

const files = typeof $files !== "undefined" && Array.isArray($files) ? $files : [];
// Sub-Store 会把上一个文件脚本的结果放在 $content 中，而 $files 仍保留原始来源。
// 必须优先读取 $content，避免后续脚本把前序修改还原。
const source = typeof $content !== "undefined" && $content != null
  ? $content
  : (files[0] || "");
const yaml = ProxyUtils.yaml.safeLoad(source) || {};

function artifactName(value) {
  if (!value) return "";

  const text = decoded(value);
  const match = text.match(/(?:^|\/)download\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : text;
}

function decoded(value) {
  const text = String(value || "").trim();
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function stripTrailingSlash(value) {
  return decoded(value).replace(/\/+$/, "");
}

function subStoreBaseFromUrl(value) {
  const match = decoded(value).match(/^(https?:\/\/[^/]+\/[^/?#]+)(?:\/(?:api|download)\/|\/?$)/);
  return match ? stripTrailingSlash(match[1]) : "";
}

function knownProviderUrls() {
  return Object.values(yaml["proxy-providers"] || {})
    .map((providerConfig) => providerConfig?.url)
    .filter(Boolean);
}

function resolveBase() {
  const requestUrl = typeof $request !== "undefined" ? $request?.url : "";
  const responseUrl = typeof $response !== "undefined" ? $response?.url : "";
  const candidates = [
    base,
    requestUrl,
    responseUrl,
    ...knownProviderUrls(),
  ];

  for (const candidate of candidates) {
    const resolved = subStoreBaseFromUrl(candidate) || stripTrailingSlash(candidate);
    if (resolved) return resolved;
  }

  throw new Error("Missing Sub-Store base URL. Pass base=https://host/token in script arguments.");
}

function downloadUrl(name, subStoreBase) {
  const normalizedName = artifactName(name);
  if (!normalizedName) return "";

  return `${subStoreBase}/download/${encodeURIComponent(normalizedName)}?target=${encodeURIComponent(target)}`;
}

function fillProvider(providerName, subscriptionName, subStoreBase) {
  const normalizedName = artifactName(subscriptionName);
  if (!normalizedName) return;

  const providers = yaml["proxy-providers"];
  if (!providers?.[providerName]) {
    throw new Error(`Missing proxy-provider: ${providerName}`);
  }

  providers[providerName].url = downloadUrl(normalizedName, subStoreBase);
}

const subStoreBase = resolveBase();
fillProvider(aProvider, a, subStoreBase);
fillProvider(bProvider, b, subStoreBase);
fillProvider(cProvider, c, subStoreBase);
fillProvider(provider, sub, subStoreBase);

$content = ProxyUtils.yaml.dump(yaml);
