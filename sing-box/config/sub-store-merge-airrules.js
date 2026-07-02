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

  const proxies = (await produceArtifact({
    type: artifactType(type),
    name: normalizedName,
    platform: "sing-box",
    produceType: "internal",
  })).filter(isUsableProxy);

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

const metadataNode = new RegExp(
  [
    "剩余流量",
    "流量",
    "距离下次",
    "下次重置",
    "重置剩余",
    "套餐",
    "到期",
    "过期",
    "官网",
    "订阅",
    "更新",
    "跳转域名",
    "请勿连接",
    "不可用",
    "剩余：",
    "expire",
    "traffic",
    "reset",
    "subscription",
    "official",
  ].join("|"),
  "i"
);

function isUsableProxy(proxy) {
  if (!proxy?.tag || proxy.tag === placeholder) return false;
  return !metadataNode.test(proxy.tag);
}

function codePattern(...codes) {
  const boundary = String.raw`(?:^|[\s_\-\[\]()（）【】|/,:：])`;
  return new RegExp(
    `${boundary}(?:${codes.join("|")})(?=$|[\\s_\\-\\[\\]()（）【】|/,:：])`,
    "i"
  );
}

const regionPatterns = {
  hk: [/香港|港|Hong ?Kong/i, codePattern("HK", "HKG")],
  jp: [/日本|东京|大阪|Japan/i, codePattern("JP", "JPN")],
  kr: [/韩国|韩|首尔|Korea/i, codePattern("KR", "KOR")],
  sg: [/新加坡|狮城|坡|Singapore/i, codePattern("SG", "SGP")],
  us: [
    /美国|美|洛杉矶|硅谷|圣何塞|西雅图|达拉斯|凤凰城|纽约|芝加哥|United ?States|America/i,
    codePattern("US", "USA"),
  ],
  tw: [/台湾|台北|新北|Taiwan/i, codePattern("TW", "TWN")],
  eu: [
    /欧洲|英国|伦敦|德国|法国|荷兰|西班牙|意大利|爱尔兰|瑞士|瑞典|芬兰|挪威|波兰|葡萄牙|Europe|London|Germany|France|Netherlands|Spain|Italy/i,
    codePattern("EU", "UK", "GB", "DE", "FR", "NL", "ES", "IT", "IE", "CH", "SE", "FI", "NO", "PL", "PT"),
  ],
};

function matchesRegion(tag, region) {
  return regionPatterns[region].some((pattern) => pattern.test(tag));
}

function regionOf(proxy) {
  for (const region of ["hk", "jp", "sg", "us", "kr", "tw", "eu"]) {
    if (matchesRegion(proxy.tag, region)) return region;
  }
  return "other";
}

function byRegion(proxies, region) {
  return proxies.filter((proxy) => regionOf(proxy) === region).map((proxy) => proxy.tag);
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

function prunePlaceholderOnlyGroups() {
  const placeholderOnlyGroups = new Set(
    template.outbounds
      .filter(
        (outbound) =>
          Array.isArray(outbound.outbounds) &&
          outbound.outbounds.length === 1 &&
          outbound.outbounds[0] === placeholder
      )
      .map((outbound) => outbound.tag)
  );

  for (const outbound of template.outbounds) {
    if (!Array.isArray(outbound.outbounds)) continue;
    if (placeholderOnlyGroups.has(outbound.tag)) continue;

    outbound.outbounds = outbound.outbounds.filter(
      (tag) => !placeholderOnlyGroups.has(tag)
    );
    if (outbound.outbounds.length === 0) {
      outbound.outbounds = [placeholder];
    }

    if (
      Object.prototype.hasOwnProperty.call(outbound, "default") &&
      !outbound.outbounds.includes(outbound.default)
    ) {
      outbound.default = outbound.outbounds[0];
    }
  }
}

function removeOutboundTags(tagsToRemove) {
  const tagSet = new Set(tagsToRemove);
  template.outbounds = template.outbounds.filter((outbound) => !tagSet.has(outbound.tag));

  for (const outbound of template.outbounds) {
    if (!Array.isArray(outbound.outbounds)) continue;

    outbound.outbounds = outbound.outbounds.filter((tag) => !tagSet.has(tag));
    if (outbound.outbounds.length === 0) {
      outbound.outbounds = [placeholder];
    }

    if (
      Object.prototype.hasOwnProperty.call(outbound, "default") &&
      !outbound.outbounds.includes(outbound.default)
    ) {
      outbound.default = outbound.outbounds[0];
    }
  }

  const route = template.route;
  if (route?.final && tagSet.has(route.final)) {
    route.final = "🚀 节点选择";
  }

  for (const rule of route?.rules ?? []) {
    if (rule.outbound && tagSet.has(rule.outbound)) {
      rule.outbound = "🚀 节点选择";
    }
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

const hasA = Boolean(artifactName(a));
const hasB = Boolean(artifactName(b));
const hasC = Boolean(artifactName(c));

const aProxies = await loadProxies(a, aType, "A-");
const bProxies = await loadProxies(b, bType, "B-");
const cProxies = await loadProxies(c, cType, "C-");

addProxies([...aProxies, ...bProxies, ...cProxies]);

setGroup("A-香港节点", byRegion(aProxies, "hk"));
setGroup("A-日本节点", byRegion(aProxies, "jp"));
setGroup("A-韩国节点", byRegion(aProxies, "kr"));
setGroup("A-新加坡节点", byRegion(aProxies, "sg"));
setGroup("A-美国节点", byRegion(aProxies, "us"));
setGroup("A-台湾节点", byRegion(aProxies, "tw"));
setGroup("A-欧洲节点", byRegion(aProxies, "eu"));
setGroup("A-其他地区", byRegion(aProxies, "other"));

setGroup("B-香港节点", byRegion(bProxies, "hk"));
setGroup("B-日本节点", byRegion(bProxies, "jp"));
setGroup("B-韩国节点", byRegion(bProxies, "kr"));
setGroup("B-新加坡节点", byRegion(bProxies, "sg"));
setGroup("B-美国节点", byRegion(bProxies, "us"));
setGroup("B-台湾节点", byRegion(bProxies, "tw"));
setGroup("B-欧洲节点", byRegion(bProxies, "eu"));
setGroup("B-其他地区", byRegion(bProxies, "other"));
if (hasC) {
  setGroup("C全线路优选", tags(cProxies));
}

if (!hasA) {
  removeOutboundTags([
    "A机场全线路自动优选",
    "A机场常用",
    "A-香港节点",
    "A-日本节点",
    "A-韩国节点",
    "A-新加坡节点",
    "A-美国节点",
    "A-台湾节点",
    "A-欧洲节点",
    "A-其他地区",
  ]);
}

if (!hasB) {
  removeOutboundTags([
    "B机场全线路自动优选",
    "B机场常用",
    "B-香港节点",
    "B-日本节点",
    "B-韩国节点",
    "B-新加坡节点",
    "B-美国节点",
    "B-台湾节点",
    "B-欧洲节点",
    "B-其他地区",
  ]);
}

if (!hasC) {
  removeOutboundTags(["C全线路优选"]);
}

prunePlaceholderOnlyGroups();

$content = JSON.stringify(template, null, 2);
