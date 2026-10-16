// Clash/Mihomo Sub-Store 文件脚本：按参数新增一个分流策略组及其规则源。
// 候选默认复制自 🚀 节点选择；每个规则源 URL 生成一个 rule-provider 与一条 RULE-SET 规则。
// 规则默认插在 RULE-SET,proxy（🪜 代理域名）之前，保证先于泛代理规则命中，
// 同时仍在 myignore / cn 等本仓库与直连覆盖规则之后。
const args = typeof $arguments !== "undefined" && $arguments ? $arguments : {};

const files = typeof $files !== "undefined" && Array.isArray($files) ? $files : [];
const initialContent = files.filter((item) => item != null && item !== "").join("\n");
const currentContent = typeof $content !== "undefined" ? $content : null;
// 初次执行时 $content 可能是多个完整文件的拼接结果，应只读取第一个模板；
// 前序脚本修改 $content 后则继续处理该结果，保留已填充的 provider URL。
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

function boolArg(value, fallback) {
  if (!value) return fallback;
  const text = value.toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  throw new Error(`Invalid boolean argument: ${value}`);
}

const groupName = arg("name", "group");
if (!groupName) {
  throw new Error("Missing group name. Pass name=<策略组名称>.");
}

// 多个规则源用 | 分隔；可整体编码，也可逐个 encodeURIComponent 后再用 | 连接。
const urls = arg("url", "urls")
  .split("|")
  .map((item) => decoded(item))
  .filter(Boolean);
if (!urls.length) {
  throw new Error("Missing rule source URL. Pass url=<规则源URL编码>，多个用 | 分隔。");
}
for (const url of urls) {
  if (!/^https?:\/\/[^\s|]+$/i.test(url)) {
    throw new Error(`Invalid rule source URL: ${url}. Pass a complete HTTP(S) URL.`);
  }
}

const likeName = arg("like", "proxies_from") || "🚀 节点选择";
const beforeGroup = arg("before_group") || "🐟 漏网之鱼";
const beforeRule = arg("before_rule") || "RULE-SET,proxy,";
const behaviorArg = arg("behavior");
const formatArg = arg("format");
const intervalArg = arg("interval");
const interval = intervalArg ? Number(intervalArg) : 86400;
if (!Number.isInteger(interval) || interval <= 0) {
  throw new Error(`Invalid interval: ${intervalArg}`);
}
const noResolve = boolArg(arg("no_resolve", "no-resolve"), false);

const groups = Array.isArray(yaml["proxy-groups"]) ? yaml["proxy-groups"] : [];
yaml["proxy-groups"] = groups;
if (groups.some((item) => item?.name === groupName)) {
  throw new Error(`Proxy-group already exists: ${groupName}`);
}
const like = groups.find((item) => item?.name === likeName);
if (!like) {
  throw new Error(`Missing proxy-group to copy from: ${likeName}`);
}

const group = { name: groupName, type: "select" };
if (Array.isArray(like.proxies) && like.proxies.length) group.proxies = [...like.proxies];
if (Array.isArray(like.use) && like.use.length) group.use = [...like.use];
if (!group.proxies && !group.use) {
  throw new Error(`Proxy-group ${likeName} has no proxies or use to copy.`);
}
const groupIndex = groups.findIndex((item) => item?.name === beforeGroup);
groups.splice(groupIndex === -1 ? groups.length : groupIndex, 0, group);

// provider 名称取分组名中的 ASCII 字母数字；纯中文 / emoji 时退回稳定哈希。
function slug(text) {
  const ascii = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (ascii) return ascii;
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return hash.toString(36);
}

function detectFormat(url) {
  const pathname = url.split(/[?#]/)[0].toLowerCase();
  if (pathname.endsWith(".mrs")) return "mrs";
  if (pathname.endsWith(".yaml") || pathname.endsWith(".yml")) return "yaml";
  return "text";
}

const providers = yaml["rule-providers"] && typeof yaml["rule-providers"] === "object"
  ? yaml["rule-providers"]
  : {};
yaml["rule-providers"] = providers;
// 多次执行本脚本时 ASCII 部分可能相同（如 📺 Twitch 与 Twitch 备用），冲突时追加序号。
function uniqueKey(preferred) {
  let key = preferred;
  for (let n = 2; Object.prototype.hasOwnProperty.call(providers, key); n += 1) {
    key = `${preferred}-${n}`;
  }
  return key;
}
const base = `rg-${slug(groupName)}`;
const newRules = urls.map((url, index) => {
  const key = uniqueKey(urls.length === 1 ? base : `${base}-${index + 1}`);
  const format = formatArg || detectFormat(url);
  // mrs 只支持 domain / ipcidr，未指定时按 domain 处理。
  const behavior = behaviorArg || (format === "mrs" ? "domain" : "classical");
  const ext = format === "yaml" ? "yaml" : format === "mrs" ? "mrs" : "list";
  providers[key] = {
    type: "http",
    behavior,
    format,
    path: `./rule_provider/${key}.${ext}`,
    url,
    interval,
  };
  return `RULE-SET,${key},${groupName}${noResolve ? ",no-resolve" : ""}`;
});

const rules = Array.isArray(yaml.rules) ? yaml.rules : [];
yaml.rules = rules;
let ruleIndex = rules.findIndex((item) => typeof item === "string" && item.startsWith(beforeRule));
if (ruleIndex === -1) {
  ruleIndex = rules.findIndex((item) => typeof item === "string" && /^(GEOSITE|GEOIP|MATCH),/.test(item));
}
rules.splice(ruleIndex === -1 ? rules.length : ruleIndex, 0, ...newRules);

$content = ProxyUtils.yaml.dump(yaml);
