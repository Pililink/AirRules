// Clash/Mihomo proxy-provider 完整 URL 填充脚本。
// a / b / c / sub 必须直接传入对应订阅或组合订阅的完整 HTTP(S) 下载地址。
const {
  a,
  b,
  c,
  sub,
  aProvider = "A机场",
  bProvider = "B机场",
  cProvider = "C机场",
  provider = "机场1",
} = typeof $arguments !== "undefined" ? $arguments : {};

const files = typeof $files !== "undefined" && Array.isArray($files) ? $files : [];
const initialContent = files.filter((item) => item != null && item !== "").join("\n");
const currentContent = typeof $content !== "undefined" ? $content : null;
// 初次执行时 $content 可能是多个完整文件的拼接结果，应只读取第一个模板；
// 前序脚本修改 $content 后则继续处理该结果，避免还原已写入的内容。
const source = currentContent != null && currentContent !== initialContent
  ? currentContent
  : (files[0] ?? currentContent ?? "");
const yaml = ProxyUtils.yaml.safeLoad(source) || {};

function normalizeProviderUrl(value, providerName) {
  const text = String(value || "").trim();
  if (!/^https?:\/\/[^\s]+$/i.test(text)) {
    throw new Error(
      `Invalid URL for proxy-provider ${providerName}. Pass a complete HTTP(S) URL.`,
    );
  }
  return text;
}

function fillProvider(providerName, providerUrl) {
  if (!providerUrl) return;

  const providers = yaml["proxy-providers"];
  if (!providers?.[providerName]) {
    throw new Error(`Missing proxy-provider: ${providerName}`);
  }

  providers[providerName].url = normalizeProviderUrl(providerUrl, providerName);
}

fillProvider(aProvider, a);
fillProvider(bProvider, b);
fillProvider(cProvider, c);
fillProvider(provider, sub);

$content = ProxyUtils.yaml.dump(yaml);
