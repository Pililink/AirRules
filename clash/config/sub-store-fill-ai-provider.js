// Clash/Mihomo Sub-Store 文件脚本：填充自建 AI 出口订阅（如购买的 SOCKS5 节点）。
// 模板已内置 AI出口 proxy-provider、🛫 AI 出口 与 🔗 AI 前置 策略组；
// 本脚本只写入订阅地址，可选改写链式前置（provider override.dialer-proxy）。
// 订阅地址可能含节点账号密码，只应保存在私有 Sub-Store 配置中。
const args = typeof $arguments !== "undefined" && $arguments ? $arguments : {};

const files = typeof $files !== "undefined" && Array.isArray($files) ? $files : [];
const initialContent = files.filter((item) => item != null && item !== "").join("\n");
const currentContent = typeof $content !== "undefined" ? $content : null;
// 初次执行时 $content 可能是多个完整文件的拼接结果，应只读取第一个模板；
// 前序脚本修改 $content 后则继续处理该结果，保留已填充的机场 provider URL。
const source = currentContent != null && currentContent !== initialContent
  ? currentContent
  : (files[0] ?? currentContent ?? "");
const yaml = ProxyUtils.yaml.safeLoad(source) || {};

function decoded(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function arg(...names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(args, name) && args[name] != null) {
      const text = decoded(args[name]);
      if (text) return text;
    }
  }
  return "";
}

const url = arg("ai", "ai_url", "url");
const providerName = arg("ai_provider", "provider") || "AI出口";
const dialerProxy = arg("ai_dialer_proxy", "dialer-proxy");

const provider = yaml["proxy-providers"]?.[providerName];
if (!provider) {
  throw new Error(`Missing proxy-provider: ${providerName}`);
}

if (url) {
  if (!/^https?:\/\/[^\s]+$/i.test(url)) {
    throw new Error(`Invalid URL for proxy-provider ${providerName}. Pass a complete HTTP(S) URL.`);
  }
  provider.url = url;
}

if (dialerProxy) {
  const exists = dialerProxy === "DIRECT"
    || (yaml["proxy-groups"] || []).some((item) => item?.name === dialerProxy);
  if (!exists) {
    throw new Error(`Missing proxy-group for dialer-proxy: ${dialerProxy}`);
  }
  provider.override = { ...(provider.override || {}), "dialer-proxy": dialerProxy };
}

$content = ProxyUtils.yaml.dump(yaml);
