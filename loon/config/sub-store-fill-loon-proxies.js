const {
  a,
  c,
  base,
  target = "Loon",
  aProvider = "A机场",
  cProvider = "C机场",
} = typeof $arguments !== "undefined" ? $arguments : {};

const files = typeof $files !== "undefined" && Array.isArray($files) ? $files : [];
let content = String(files.length > 0 ? files[0] : (typeof $content !== "undefined" ? $content : ""));

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
  const match = decoded(value).match(
    /^(https?:\/\/[^/?#]+(?:\/[^/?#]+)?)\/(?:api|download)(?:\/|$)/,
  );
  return match ? stripTrailingSlash(match[1]) : "";
}

function knownRemoteProxyUrls(source) {
  const headerIndex = source.search(/^\[Remote Proxy\]\s*$/m);
  if (headerIndex < 0) return [];

  const sectionStart = source.indexOf("\n", headerIndex);
  const nextHeaderOffset = source.slice(sectionStart + 1).search(/^\[/m);
  const sectionEnd = nextHeaderOffset < 0
    ? source.length
    : sectionStart + 1 + nextHeaderOffset;

  return source
    .slice(sectionStart + 1, sectionEnd)
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*[^=]+?\s*=\s*(https?:\/\/\S+)/)?.[1])
    .filter(Boolean);
}

function resolveBase() {
  if (base) return stripTrailingSlash(base);

  const requestUrl = typeof $request !== "undefined" ? $request?.url : "";
  const responseUrl = typeof $response !== "undefined" ? $response?.url : "";
  const candidates = [requestUrl, responseUrl, ...knownRemoteProxyUrls(content)];

  for (const candidate of candidates) {
    const resolved = subStoreBaseFromUrl(candidate);
    if (resolved) return resolved;
  }

  throw new Error("Missing Sub-Store base URL. Pass base=https://host/token in script arguments.");
}

function artifactPath(value) {
  const text = decoded(value);
  const downloadMatch = text.match(/(?:^|\/)download\/((?:collection\/)?[^/?#]+)/);
  const path = downloadMatch ? downloadMatch[1] : text;
  const segments = path.split("/").filter(Boolean);

  if (segments[0] === "collection" && segments.length === 2) {
    return `collection/${encodeURIComponent(decoded(segments[1]))}`;
  }
  if (segments.length === 1) {
    return encodeURIComponent(decoded(segments[0]));
  }

  throw new Error(`Invalid Sub-Store subscription or collection: ${text}`);
}

function downloadUrl(value, subStoreBase) {
  return `${subStoreBase}/download/${artifactPath(value)}?target=${encodeURIComponent(target)}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fillRemoteProxy(providerName, subscription, subStoreBase) {
  if (!subscription) return;

  const headerIndex = content.search(/^\[Remote Proxy\]\s*$/m);
  if (headerIndex < 0) throw new Error("Missing [Remote Proxy] section");

  const sectionStart = content.indexOf("\n", headerIndex);
  const nextHeaderOffset = content.slice(sectionStart + 1).search(/^\[/m);
  const sectionEnd = nextHeaderOffset < 0
    ? content.length
    : sectionStart + 1 + nextHeaderOffset;
  const section = content.slice(sectionStart + 1, sectionEnd);
  const linePattern = new RegExp(`^(\\s*)${escapeRegExp(providerName)}\\s*=.*$`, "m");

  if (!linePattern.test(section)) {
    throw new Error(`Missing remote proxy: ${providerName}`);
  }

  const replaced = section.replace(
    linePattern,
    (_, indentation) => `${indentation}${providerName} = ${downloadUrl(subscription, subStoreBase)}`,
  );
  content = content.slice(0, sectionStart + 1) + replaced + content.slice(sectionEnd);
}

const subStoreBase = resolveBase();
fillRemoteProxy(aProvider, a, subStoreBase);
fillRemoteProxy(cProvider, c, subStoreBase);

$content = content;
