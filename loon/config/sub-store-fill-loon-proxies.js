// Loon [Remote Proxy] 完整 URL 填充脚本。
// a / c 必须直接传入对应订阅或组合订阅的完整 HTTP(S) 下载地址。
const {
  a,
  c,
  aProvider = "A机场",
  cProvider = "C机场",
} = typeof $arguments !== "undefined" ? $arguments : {};

const files = typeof $files !== "undefined" && Array.isArray($files) ? $files : [];
const initialContent = files.filter((item) => item != null && item !== "").join("\n");
const currentContent = typeof $content !== "undefined" ? $content : null;
// 初次执行时忽略多个完整来源的拼接，只处理第一个模板；链式执行时处理当前结果。
let content = String(
  currentContent != null && currentContent !== initialContent
    ? currentContent
    : (files[0] ?? currentContent ?? ""),
);

function normalizeRemoteProxyUrl(value, providerName) {
  const text = String(value || "").trim();
  if (!/^https?:\/\/[^\s]+$/i.test(text)) {
    throw new Error(
      `Invalid URL for remote proxy ${providerName}. Pass a complete HTTP(S) URL.`,
    );
  }
  return text;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fillRemoteProxy(providerName, providerUrl) {
  if (!providerUrl) return;

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

  const remoteProxyUrl = normalizeRemoteProxyUrl(providerUrl, providerName);
  const replaced = section.replace(
    linePattern,
    (_, indentation) => `${indentation}${providerName} = ${remoteProxyUrl}`,
  );
  content = content.slice(0, sectionStart + 1) + replaced + content.slice(sectionEnd);
}

fillRemoteProxy(aProvider, a);
fillRemoteProxy(cProvider, c);

$content = content;
