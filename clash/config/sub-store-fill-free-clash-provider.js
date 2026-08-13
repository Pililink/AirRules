// 免费节点池专用 Sub-Store 文件脚本。
// 唯一必填参数：provider_url，值为最终的 Clash/Mihomo 订阅地址。
const { provider_url: providerUrl } = typeof $arguments !== "undefined" ? $arguments : {};

const PROVIDER_NAME = "机场1";

const files = typeof $files !== "undefined" && Array.isArray($files) ? $files : [];
const source = files.length > 0
  ? files[0]
  : (typeof $content !== "undefined" ? $content : "");
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

const provider = yaml["proxy-providers"]?.[PROVIDER_NAME];
if (!provider) {
  throw new Error(`Missing proxy-provider: ${PROVIDER_NAME}`);
}

provider.url = normalizeProviderUrl(providerUrl);

$content = ProxyUtils.yaml.dump(yaml);
