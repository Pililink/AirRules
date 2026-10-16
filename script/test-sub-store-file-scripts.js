const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const jsonYaml = {
  safeLoad(source) {
    return JSON.parse(source);
  },
  dump(value) {
    return JSON.stringify(value);
  },
};

function runFileScript(relativePath, { content, files, arguments: args }) {
  const context = {
    $arguments: args || {},
    $files: files || [],
    ProxyUtils: { yaml: jsonYaml },
  };
  if (content !== undefined) context.$content = content;

  const script = fs.readFileSync(path.join(root, relativePath), "utf8");
  vm.runInNewContext(script, context, { filename: relativePath });
  return context.$content;
}

function clashTemplate() {
  return {
    "proxy-providers": {
      "机场1": { url: "" },
      "A机场": { url: "" },
      "B机场": { url: "" },
      "C机场": { url: "" },
    },
    proxies: [],
    "proxy-groups": [
      { name: "🏠 家庭网络", type: "select", proxies: ["DIRECT"] },
    ],
  };
}

const original = JSON.stringify(clashTemplate());
const duplicatedFiles = [original, original];
const duplicatedContent = duplicatedFiles.join("\n");
const fillArgs = {
  a: "https://sub.example.com/token/download/Qcloud?target=ClashMeta",
  b: "https://airport.example/subscription?token=b",
  c: "https://sub.example.com/token/download/collection/private%20group?target=ClashMeta&udp=true",
  sub: "https://sub.example.com/token/download/base?target=ClashMeta",
};
const tailscaleArgs = {
  ts: "1",
  ts_accept_routes: "true",
  ts_dialer_proxy: "DIRECT",
  ts_ephemeral: "false",
  ts_group: "🏠 家庭网络",
  ts_hostname: "mihomo",
  ts_name: "🏠 Tailscale",
  ts_state_dir: "./tailscale",
  ts_udp: "true",
};

const filledFromFiles = JSON.parse(
  runFileScript("clash/config/sub-store-fill-clash-providers.js", {
    files: [original],
    arguments: fillArgs,
  }),
);
assert.equal(
  filledFromFiles["proxy-providers"]["A机场"].url,
  "https://sub.example.com/token/download/Qcloud?target=ClashMeta",
);
assert.equal(
  filledFromFiles["proxy-providers"]["B机场"].url,
  "https://airport.example/subscription?token=b",
);
assert.equal(
  filledFromFiles["proxy-providers"]["C机场"].url,
  "https://sub.example.com/token/download/collection/private%20group?target=ClashMeta&udp=true",
);
assert.equal(
  filledFromFiles["proxy-providers"]["机场1"].url,
  "https://sub.example.com/token/download/base?target=ClashMeta",
);
assert.throws(
  () => runFileScript("clash/config/sub-store-fill-clash-providers.js", {
    files: [original],
    arguments: { a: "Qcloud" },
  }),
  /Invalid URL for proxy-provider A机场/,
);

// Sub-Store 会把多个来源拼接到初始 $content；完整模板重复时不能直接解析该字符串。
const filled = runFileScript("clash/config/sub-store-fill-clash-providers.js", {
  content: duplicatedContent,
  files: duplicatedFiles,
  arguments: fillArgs,
});
const chained = JSON.parse(
  runFileScript("clash/config/sub-store-add-tailscale-proxy.js", {
    content: filled,
    files: duplicatedFiles,
    arguments: tailscaleArgs,
  }),
);

assert.equal(
  chained["proxy-providers"]["A机场"].url,
  "https://sub.example.com/token/download/Qcloud?target=ClashMeta",
);
assert.equal(
  chained["proxy-providers"]["C机场"].url,
  "https://sub.example.com/token/download/collection/private%20group?target=ClashMeta&udp=true",
);
assert.equal(chained.proxies[0].name, "🏠 Tailscale");
assert.deepEqual(
  Array.from(chained["proxy-groups"][0].proxies),
  ["🏠 Tailscale", "DIRECT"],
);

const tailscaleFirst = runFileScript(
  "clash/config/sub-store-add-tailscale-proxy.js",
  {
    content: original,
    files: [original],
    arguments: tailscaleArgs,
  },
);
const reverseChained = JSON.parse(
  runFileScript("clash/config/sub-store-fill-clash-providers.js", {
    content: tailscaleFirst,
    files: [original],
    arguments: fillArgs,
  }),
);
assert.equal(reverseChained.proxies[0].name, "🏠 Tailscale");
assert.equal(
  reverseChained["proxy-providers"]["A机场"].url,
  "https://sub.example.com/token/download/Qcloud?target=ClashMeta",
);

const directFilled = JSON.parse(
  runFileScript("clash/config/sub-store-fill-free-clash-provider.js", {
    content: tailscaleFirst,
    files: [original],
    arguments: { a: "https://airport.example/subscription" },
  }),
);
assert.equal(directFilled.proxies[0].name, "🏠 Tailscale");
assert.equal(
  directFilled["proxy-providers"]["A机场"].url,
  "https://airport.example/subscription",
);

const originalLoon = "[Remote Proxy]\nA机场 =\nC机场 =\n\n[Proxy Group]\n测试 = select,DIRECT\n";
const currentLoon = `# previous-script-change\n${originalLoon}`;
const loonArgs = {
  a: "https://sub.example.com/token/download/Qcloud?target=Loon",
  c: "https://sub.example.com/token/download/collection/private%20group?target=Loon&udp=true",
};
const chainedLoon = runFileScript("loon/config/sub-store-fill-loon-proxies.js", {
  content: currentLoon,
  files: [originalLoon],
  arguments: loonArgs,
});
assert.match(chainedLoon, /^# previous-script-change/m);
assert.match(
  chainedLoon,
  /^A机场 = https:\/\/sub\.example\.com\/token\/download\/Qcloud\?target=Loon$/m,
);
assert.match(
  chainedLoon,
  /^C机场 = https:\/\/sub\.example\.com\/token\/download\/collection\/private%20group\?target=Loon&udp=true$/m,
);
assert.throws(
  () => runFileScript("loon/config/sub-store-fill-loon-proxies.js", {
    files: [originalLoon],
    arguments: { a: "Qcloud" },
  }),
  /Invalid URL for remote proxy A机场/,
);

const ruleGroupTemplate = JSON.stringify({
  "proxy-providers": { "A机场": { url: "" } },
  "proxy-groups": [
    { name: "🚀 节点选择", type: "select", proxies: ["A机场常用", "🎯 全球直连"] },
    { name: "🐟 漏网之鱼", type: "select", proxies: ["🚀 节点选择", "🎯 全球直连"] },
  ],
  "rule-providers": { proxy: { type: "http" } },
  rules: ["RULE-SET,cn,🇨🇳 直连域名", "RULE-SET,proxy,🪜 代理域名", "MATCH,🐟 漏网之鱼"],
});
const twitchYaml = "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Twitch/Twitch_No_Resolve.yaml";
const twitchMrs = "https://example.com/geosite/twitch.mrs";
const ruleGroupFilled = runFileScript("clash/config/sub-store-fill-clash-providers.js", {
  files: [ruleGroupTemplate],
  arguments: { a: fillArgs.a },
});
const ruleGroup = JSON.parse(
  runFileScript("clash/config/sub-store-add-rule-group.js", {
    content: ruleGroupFilled,
    files: [ruleGroupTemplate],
    arguments: {
      name: encodeURIComponent("📺 Twitch"),
      url: `${encodeURIComponent(twitchYaml)}|${encodeURIComponent(twitchMrs)}`,
    },
  }),
);
// 前序脚本已改写 $content 时继续处理该结果。
assert.equal(
  ruleGroup["proxy-providers"]["A机场"].url,
  "https://sub.example.com/token/download/Qcloud?target=ClashMeta",
);
const twitchGroups = JSON.parse(
  runFileScript("clash/config/sub-store-add-rule-group.js", {
    files: [ruleGroupTemplate],
    arguments: {
      name: "📺 Twitch",
      url: encodeURIComponent(`${twitchYaml}|${twitchMrs}`),
    },
  }),
);
assert.deepEqual(
  twitchGroups["proxy-groups"].map((item) => item.name),
  ["🚀 节点选择", "📺 Twitch", "🐟 漏网之鱼"],
);
assert.deepEqual(Array.from(twitchGroups["proxy-groups"][1].proxies), ["A机场常用", "🎯 全球直连"]);
assert.deepEqual(twitchGroups.rules, [
  "RULE-SET,cn,🇨🇳 直连域名",
  "RULE-SET,rg-twitch-1,📺 Twitch",
  "RULE-SET,rg-twitch-2,📺 Twitch",
  "RULE-SET,proxy,🪜 代理域名",
  "MATCH,🐟 漏网之鱼",
]);
assert.deepEqual(twitchGroups["rule-providers"]["rg-twitch-1"], {
  type: "http",
  behavior: "classical",
  format: "yaml",
  path: "./rule_provider/rg-twitch-1.yaml",
  url: twitchYaml,
  interval: 86400,
});
assert.equal(twitchGroups["rule-providers"]["rg-twitch-2"].format, "mrs");
assert.equal(twitchGroups["rule-providers"]["rg-twitch-2"].behavior, "domain");
// 同一文件上多次挂载：后一个脚本在前一个结果上继续追加，provider 名冲突时自动加序号。
const firstGroup = runFileScript("clash/config/sub-store-add-rule-group.js", {
  files: [ruleGroupTemplate],
  arguments: { name: "📺 Twitch", url: twitchYaml },
});
const secondGroup = runFileScript("clash/config/sub-store-add-rule-group.js", {
  content: firstGroup,
  files: [ruleGroupTemplate],
  arguments: { name: "Twitch 备用", url: twitchMrs },
});
const thirdGroup = JSON.parse(
  runFileScript("clash/config/sub-store-add-rule-group.js", {
    content: secondGroup,
    files: [ruleGroupTemplate],
    arguments: { name: "🎵 Spotify", url: "https://example.com/spotify.list" },
  }),
);
assert.deepEqual(
  thirdGroup["proxy-groups"].map((item) => item.name),
  ["🚀 节点选择", "📺 Twitch", "Twitch 备用", "🎵 Spotify", "🐟 漏网之鱼"],
);
assert.deepEqual(thirdGroup.rules, [
  "RULE-SET,cn,🇨🇳 直连域名",
  "RULE-SET,rg-twitch,📺 Twitch",
  "RULE-SET,rg-twitch-2,Twitch 备用",
  "RULE-SET,rg-spotify,🎵 Spotify",
  "RULE-SET,proxy,🪜 代理域名",
  "MATCH,🐟 漏网之鱼",
]);
assert.equal(thirdGroup["rule-providers"]["rg-twitch-2"].url, twitchMrs);
assert.equal(thirdGroup["rule-providers"]["rg-spotify"].format, "text");
// 后挂的分组可以复制先挂的自定义分组。
const likeCustom = JSON.parse(
  runFileScript("clash/config/sub-store-add-rule-group.js", {
    content: JSON.stringify(thirdGroup),
    files: [ruleGroupTemplate],
    arguments: { name: "📺 直播合集", url: twitchYaml, like: "📺 Twitch" },
  }),
);
assert.deepEqual(
  Array.from(likeCustom["proxy-groups"].find((item) => item.name === "📺 直播合集").proxies),
  ["A机场常用", "🎯 全球直连"],
);
assert.throws(
  () => runFileScript("clash/config/sub-store-add-rule-group.js", {
    content: firstGroup,
    files: [ruleGroupTemplate],
    arguments: { name: "📺 Twitch", url: twitchYaml },
  }),
  /Proxy-group already exists: 📺 Twitch/,
);
const singleSource = JSON.parse(
  runFileScript("clash/config/sub-store-add-rule-group.js", {
    files: [ruleGroupTemplate],
    arguments: { name: "📺 直播", url: twitchYaml, like: "🐟 漏网之鱼" },
  }),
);
const liveKey = Object.keys(singleSource["rule-providers"]).find((key) => key.startsWith("rg-"));
assert.match(liveKey, /^rg-[0-9a-z]+$/);
assert.deepEqual(Array.from(singleSource["proxy-groups"][1].proxies), ["🚀 节点选择", "🎯 全球直连"]);
assert.throws(
  () => runFileScript("clash/config/sub-store-add-rule-group.js", {
    files: [ruleGroupTemplate],
    arguments: { name: "🚀 节点选择", url: twitchYaml },
  }),
  /Proxy-group already exists/,
);
assert.throws(
  () => runFileScript("clash/config/sub-store-add-rule-group.js", {
    files: [ruleGroupTemplate],
    arguments: { name: "📺 Twitch", url: "Twitch" },
  }),
  /Invalid rule source URL/,
);
assert.throws(
  () => runFileScript("clash/config/sub-store-add-rule-group.js", {
    files: [ruleGroupTemplate],
    arguments: { name: "📺 Twitch", url: twitchYaml, like: "不存在" },
  }),
  /Missing proxy-group to copy from/,
);

console.log("Sub-Store chained file script tests passed");
