// Clash/Mihomo proxy-provider 最终 URL 直填脚本。
// 按模板传入所需参数，未传入的 provider 保持不变：
// provider_url -> 机场1；a -> A机场；b -> B机场；c -> C机场。
const {
  provider_url: providerUrl,
  a,
  b,
  c,
} = typeof $arguments !== "undefined" ? $arguments : {};

const files = typeof $files !== "undefined" && Array.isArray($files) ? $files : [];
const initialContent = files.filter((item) => item != null && item !== "").join("\n");
const currentContent = typeof $content !== "undefined" ? $content : null;
// 初次执行时忽略多个完整来源的拼接，只处理第一个模板；链式执行时处理当前结果。
const source = currentContent != null && currentContent !== initialContent
  ? currentContent
  : (files[0] ?? currentContent ?? "");
const yaml = ProxyUtils.yaml.safeLoad(source) || {};

function decoded(value) {
  const text = String(value || "").trim();
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function normalizeProviderUrl(value) {
  const text = decoded(value);
  if (!/^https?:\/\/[^\s]+$/i.test(text)) {
    throw new Error("Invalid provider_url. Expected a complete HTTP(S) subscription URL.");
  }
  return text;
}

function fillProvider(providerName, url) {
  if (!url) return;

  const provider = yaml["proxy-providers"]?.[providerName];
  if (!provider) {
    throw new Error(`Missing proxy-provider: ${providerName}`);
  }

  provider.url = normalizeProviderUrl(url);
}

fillProvider("机场1", providerUrl);
fillProvider("A机场", a);
fillProvider("B机场", b);
fillProvider("C机场", c);

$content = ProxyUtils.yaml.dump(yaml);
