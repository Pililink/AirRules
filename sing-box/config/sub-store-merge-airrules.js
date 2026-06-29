const {
  a,
  b,
  c,
  aType = "subscription",
  bType = "subscription",
  cType = "subscription",
  placeholder = "未配置节点-拒绝占位",
} = $arguments;

const template = JSON.parse($files?.[0] ?? $content);

function artifactType(type) {
  return /^(1|col|collection|组合订阅)$/i.test(String(type))
    ? "collection"
    : "subscription";
}

function artifactName(value) {
  if (!value) return "";

  const text = String(value).trim();
  try {
    const url = new URL(text);
    const parts = url.pathname.split("/").filter(Boolean);
    const downloadIndex = parts.lastIndexOf("download");
    if (downloadIndex >= 0 && parts[downloadIndex + 1]) {
      return decodeURIComponent(parts[downloadIndex + 1]);
    }
  } catch {}

  const match = text.match(/(?:^|\/)download\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : text;
}

async function loadProxies(name, type, prefix) {
  const normalizedName = artifactName(name);
  if (!normalizedName) return [];

  const proxies = await produceArtifact({
    type: artifactType(type),
    name: normalizedName,
    platform: "sing-box",
    produceType: "internal",
  });

  const tagMap = new Map(
    proxies.map((proxy) => [proxy.tag, `${prefix}${proxy.tag}`])
  );

  return proxies.map((proxy) => {
    const cloned = JSON.parse(JSON.stringify(proxy));
    cloned.tag = tagMap.get(proxy.tag);
    if (cloned.detour && tagMap.has(cloned.detour)) {
      cloned.detour = tagMap.get(cloned.detour);
    }
    return cloned;
  });
}

function tags(proxies) {
  return proxies.map((proxy) => proxy.tag);
}

function byPattern(proxies, pattern) {
  return proxies.filter((proxy) => pattern.test(proxy.tag)).map((proxy) => proxy.tag);
}

function excluding(proxies, pattern) {
  return proxies.filter((proxy) => !pattern.test(proxy.tag)).map((proxy) => proxy.tag);
}

function setGroup(tag, outbounds) {
  const group = template.outbounds.find((outbound) => outbound.tag === tag);
  if (!group || !Array.isArray(group.outbounds)) return;

  const next = outbounds.length > 0 ? outbounds : [placeholder];
  group.outbounds = [...new Set(next)];

  if (Object.prototype.hasOwnProperty.call(group, "default")) {
    group.default = group.outbounds[0];
  }
}

function addProxies(proxies) {
  const existing = new Set(template.outbounds.map((outbound) => outbound.tag));
  for (const proxy of proxies) {
    if (existing.has(proxy.tag)) continue;
    template.outbounds.push(proxy);
    existing.add(proxy.tag);
  }
}

const hk = /(香港|港|HK|HKG|Hong ?Kong)/i;
const jp = /(日本|东京|大阪|JP|Japan)/i;
const kr = /(韩国|韩|首尔|KR|Korea)/i;
const sg = /(新加坡|狮城|坡|SG|Singapore)/i;
const us = /(美国|美|洛杉矶|硅谷|圣何塞|西雅图|达拉斯|凤凰城|纽约|芝加哥|US|USA|United ?States|America)/i;
const tw = /(台湾|台北|新北|TW|Taiwan)/i;
const eu = /(欧洲|英国|伦敦|德国|法国|荷兰|西班牙|意大利|EU|Europe|UK|London|DE|Germany|FR|France|NL|Netherlands|ES|IT)/i;
const knownRegion = new RegExp(
  `${hk.source}|${jp.source}|${kr.source}|${sg.source}|${us.source}|${tw.source}|${eu.source}`,
  "i"
);

const aProxies = await loadProxies(a, aType, "A-");
const bProxies = await loadProxies(b, bType, "B-");
const cProxies = await loadProxies(c, cType, "C-");

addProxies([...aProxies, ...bProxies, ...cProxies]);

setGroup("A-香港节点", byPattern(aProxies, hk));
setGroup("A-日本节点", byPattern(aProxies, jp));
setGroup("A-韩国节点", byPattern(aProxies, kr));
setGroup("A-新加坡节点", byPattern(aProxies, sg));
setGroup("A-美国节点", byPattern(aProxies, us));
setGroup("A-台湾节点", byPattern(aProxies, tw));
setGroup("A-欧洲节点", byPattern(aProxies, eu));
setGroup("A-其他地区", excluding(aProxies, knownRegion));

setGroup("B-香港节点", byPattern(bProxies, hk));
setGroup("B-日本节点", byPattern(bProxies, jp));
setGroup("B-韩国节点", byPattern(bProxies, kr));
setGroup("B-新加坡节点", byPattern(bProxies, sg));
setGroup("B-美国节点", byPattern(bProxies, us));
setGroup("B-台湾节点", byPattern(bProxies, tw));
setGroup("B-欧洲节点", byPattern(bProxies, eu));
setGroup("B-其他地区", excluding(bProxies, knownRegion));
setGroup("C全线路优选", tags(cProxies));

$content = JSON.stringify(template, null, 2);
