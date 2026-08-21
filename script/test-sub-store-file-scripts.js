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

console.log("Sub-Store chained file script tests passed");
