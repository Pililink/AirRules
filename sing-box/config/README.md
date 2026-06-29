# Sing-box 配置说明

本目录放置与 `clash/config/2-subscription-clash-rule-set.yaml`、`clash/config/3-subscription-clash-rule-set.yaml` 对齐的 Sing-box 路由与策略组模板。

## 文件

- `subscription-sing-box-rule-set.json`：对应单机场/单订阅配置。
- `3-subscription-sing-box-rule-set.json`：对应三个机场的 Clash 配置。

## 使用边界

官方 Sing-box 核心配置没有 Mihomo/Clash 的 `proxy-providers` 与 `filter` 等价能力，因此这里不直接写机场订阅 URL，也不自动按节点名称正则拆分地区组。模板里保留了 Clash 的策略组层级，并将各地区组临时指向 `未配置节点-拒绝占位`。该占位是指向本机 discard 端口的 HTTP 出站，只用于让模板通过 Sing-box 校验，避免使用 Sing-box 1.13 已移除的 `block` 出站类型，也避免未替换节点时误走直连。

使用时需要先通过客户端、Sub-Store 或其他订阅转换工具把机场订阅转换为 Sing-box `outbounds`，再用真实节点 tag 替换这些地区组里的 `未配置节点-拒绝占位`：

- `A-香港节点`、`A-日本节点`、`A-新加坡节点`、`A-美国节点`、`A-韩国节点`、`A-台湾节点`、`A-欧洲节点`、`A-其他地区`
- `B-美国节点`、`B-新加坡节点`、`B-香港节点`、`B-日本节点`、`B-韩国节点`、`B-台湾节点`、`B-欧洲节点`、`B-其他地区`
- 三机场模板额外包含 `C全线路优选`

模板默认启用 `experimental.clash_api.external_controller` 为 `127.0.0.1:9090`，用于让 GUI 或 Dashboard 读取并切换 `selector`/`urltest` 分组。如果本机已有其他 Clash/Mihomo/Sing-box 占用 9090 端口，请改成其他本地端口。

## 规则集来源

公共规则集使用 DustinWin 的 Sing-box 兼容 SRS release：

`https://github.com/DustinWin/ruleset_geodata/releases/download/sing-box-ruleset-compatible/<name>.srs`

这里选用 `sing-box-ruleset-compatible` 是为了兼容 Sing-box 1.13.x 稳定版。若你已升级到 1.14.x，可将 URL 中的 `sing-box-ruleset-compatible` 替换为 `sing-box-ruleset`，并按官方文档把远程规则集的 `download_detour` 迁移到新的 `http_client` 写法。

自定义规则集引用本仓库已编译的 SRS：

- `https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/sing-box/rules_srs/ignore.srs`
- `https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/sing-box/rules_srs/proxy.srs`

## 参考文档

- Sing-box 规则集：`https://sing-box.sagernet.org/zh/configuration/rule-set/`
- Sing-box 路由规则：`https://sing-box.sagernet.org/zh/configuration/route/rule/`
- Sing-box Selector/URLTest 出站：`https://sing-box.sagernet.org/zh/configuration/outbound/selector/`、`https://sing-box.sagernet.org/zh/configuration/outbound/urltest/`

## Sub-Store 动态生成

在 Sub-Store 中先创建 A/B/C 机场订阅或组合订阅，然后在文件管理中创建远程文件：

- 单订阅模板：`https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/sing-box/config/subscription-sing-box-rule-set.json`
- 3 机场模板：`https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/sing-box/config/3-subscription-sing-box-rule-set.json`

文件脚本操作使用：

`https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/sing-box/config/sub-store-merge-airrules.js#a=A机场订阅名称&b=B机场订阅名称`

如果 A/B 是组合订阅，追加 `aType=collection&bType=collection`。三机场模板额外追加 `c=C机场订阅名称`，如果 C 是组合订阅再追加 `cType=collection`。
