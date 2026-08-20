// Clash/Mihomo Sub-Store 文件脚本：向完整 YAML 注入本机 Tailscale 出站。
// 这不是机场 proxy-provider。type: tailscale 由 Mihomo 内嵌 tsnet 登录，
// 会在 Tailnet 上形成一台独立设备；state-dir 只对下载该配置的本机有效。
//
// 推荐不传 auth-key：首次命中家庭网段时从 Mihomo 日志打开登录 URL。
// 私有 Sub-Store 才可传 ts_auth_key / auth-key；不要把密钥写进公开仓库或公开文件 URL。
const args = typeof $arguments !== "undefined" && $arguments ? $arguments : {};

const files = typeof $files !== "undefined" && Array.isArray($files) ? $files : [];
// Sub-Store 会把上一个文件脚本的结果放在 $content 中，而 $files 仍保留原始来源。
// 必须优先读取 $content，避免注入 Tailscale 时清掉已填充的 provider URL。
const source = typeof $content !== "undefined" && $content != null
  ? $content
  : (files[0] || "");
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

function boolArg(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  const text = decoded(value).toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  throw new Error(`Invalid boolean argument: ${value}`);
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

const enabledRaw = arg("ts", "enable", "enabled");
if (enabledRaw && !boolArg(enabledRaw, true)) {
  $content = ProxyUtils.yaml.dump(yaml);
} else {
  const proxyName = arg("ts_name", "name") || "🏠 Tailscale";
  const groupName = arg("ts_group", "group") || "🏠 家庭网络";
  const hostname = arg("ts_hostname", "hostname") || "mihomo-home";
  const stateDir = arg("ts_state_dir", "state-dir") || "./tailscale";
  const dialerProxy = arg("ts_dialer_proxy", "dialer-proxy") || "DIRECT";
  const controlUrl = arg("ts_control_url", "control-url");
  const authKey = arg("ts_auth_key", "auth-key", "auth_key");
  const udp = boolArg(arg("ts_udp", "udp"), true);
  const acceptRoutes = boolArg(arg("ts_accept_routes", "accept-routes"), true);
  const ephemeral = boolArg(arg("ts_ephemeral", "ephemeral"), false);

  if (!Array.isArray(yaml.proxies)) yaml.proxies = [];
  if (!Array.isArray(yaml["proxy-groups"])) {
    throw new Error("Missing proxy-groups. This script expects a full Clash/Mihomo YAML template.");
  }

  yaml.proxies = yaml.proxies.filter((item) => item?.name !== proxyName);

  const proxy = {
    name: proxyName,
    type: "tailscale",
    hostname,
    "state-dir": stateDir,
    ephemeral,
    udp,
    "accept-routes": acceptRoutes,
    "dialer-proxy": dialerProxy,
  };
  if (controlUrl) proxy["control-url"] = controlUrl;
  if (authKey) proxy["auth-key"] = authKey;

  yaml.proxies.push(proxy);

  const group = yaml["proxy-groups"].find((item) => item?.name === groupName);
  if (!group) {
    throw new Error(`Missing proxy-group: ${groupName}`);
  }
  if (!Array.isArray(group.proxies)) group.proxies = [];
  group.proxies = group.proxies.filter((item) => item !== proxyName);
  group.proxies.unshift(proxyName);
  if (!group.proxies.includes("DIRECT")) group.proxies.push("DIRECT");

  $content = ProxyUtils.yaml.dump(yaml);
}
