# AirRules

这个仓库用于维护自己的 Clash 及分流规则文件，当前核心配置放在 `clash/config/` 下，包含基础线路分组与规则集。  

## 当前配置结构

- `clash/config/base-clash-ruleset.yaml`
  - 代理集配置（`proxy-providers`）
  - 代理组策略（`proxy-groups`）
  - 规则集定义（`rule-providers`）
  - 路由规则（`rules`）
- `clash/ruleset/` 存放自定义覆盖规则；当前 Clash 模板的通用规则源使用 ACL4SSR `Clash/Providers`

## 关键策略说明

### 人工智能分组（`🤖 人工智能`）优先策略

`🤖 人工智能` 已设置为优先走 **美国节点**：

- `🇺🇸 美国节点`：`type: url-test`
  - 入口探测：`https://www.gstatic.com/generate_204`
  - 覆盖范围：通过 `filter` 匹配美国节点
  - 刷新间隔：`interval: 120`
- `🤖 人工智能` 的候选顺序为：
  1. `🇺🇸 美国节点`
  2. 其它地区分组（香港、日本、韩国、新加坡、台湾、欧洲、土耳其、印度、俄罗斯、其他）
  3. `🚀 节点选择`

AI 分组默认使用美国节点的延迟自动选择，其他地区和主节点组保留为手动备选。

### 其他分组

- 基础区域组仍使用 `url-test`，用于自动测试响应延迟与可用性。
- 关键用途规则：
  - `🚀 节点选择` 作为总入口
  - `🐟 漏网之鱼` 兜底全部流量
  - `📲 电报消息 / 🎮 游戏服务 / 🍎 苹果服务 / 🪟 微软服务 / 🇬 谷歌服务` 按用途分流
  - 规则源使用 ACL4SSR 的 `LocalAreaNetwork / UnBan / BanAD / BanProgramAD / ProxyGFWlist / ChinaDomain / ChinaIp` 以及常用服务规则集
  - `clash/ruleset/ignore.list` 和 `clash/ruleset/proxy.list` 作为自定义直连/代理覆盖规则，优先级高于 ACL4SSR 通用代理规则

## 使用方式（简要）

- 每次修改 `clash/config/base-clash-ruleset.yaml` 后，确保 Clash 重新加载配置。
- 更新订阅或远程规则前可先检查 `rule-providers` 链接是否可达。
- 对于远程规则文件变化，确认 `path` 目录（如 `./rule_provider/`、`./proxy_provider/`）存在对应文件或能被规则源自动更新。

## 兼容建议

- `fallback` 组与 `url-test` 可共存：上层 select 组（如 `🤖 人工智能`）决定优先级，底层各组决定各自选择逻辑。
- 建议在高并发环境中降低无效测试比例：保持较小 `interval` 的 `fallback/url-test` 对可用性更敏感的组，避免过度拉低测试效率。

## 本地记录

本仓库最近的调整重点：

- 将 `🇺🇸 美国节点` 放到 `🤖 人工智能` 的第一候选
- 保留原有各国家地区 `url-test` 组，继续作为稳定备选线路

## Sub-Store 使用说明（base/AB/AC/ABC）

`base-clash-ruleset.yaml`、`2-subscription-clash-rule-set.yaml`（AB）、`2-subscription-ac-clash-rule-set.yaml`（AC）和 `3-subscription-clash-rule-set.yaml`（ABC）可以直接作为 Sub-Store 远程文件托管使用，建议按文件分别建立订阅。若你只做规则定制，这些文件本身更推荐只维护 `proxy-groups` 与 `rules`，把机场订阅链接留空，避免暴露个人链接。

### 1. 新增远程文件

在 Sub-Store 中按以下方式新增文件：

- 文件选择 > 创建文件
- 类型：`文件`
- 来源：`远程`
- 地址：粘贴以下对应 URL
  - base：
    `https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/clash/config/base-clash-ruleset.yaml`
  - 2-subscription（AB）：
    `https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/clash/config/2-subscription-clash-rule-set.yaml`
  - 2-subscription（AC）：
    `https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/clash/config/2-subscription-ac-clash-rule-set.yaml`
  - 3-subscription（ABC）：
    `https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/clash/config/3-subscription-clash-rule-set.yaml`

### 2. 编辑文件脚本（动态填充订阅地址）

在 Sub-Store 中先创建所需的 A/B/C 机场订阅或组合订阅，然后在文件管理的脚本操作中使用：

- 2-subscription（AB）：
  `https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/clash/config/sub-store-fill-clash-providers.js#a=Qcloud&b=private#noCache`
- 2-subscription（AC）：
  `https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/clash/config/sub-store-fill-clash-providers.js#a=Qcloud&c=第三机场订阅名称#noCache`
- 3-subscription（ABC）：
  `https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/clash/config/sub-store-fill-clash-providers.js#a=Qcloud&b=private&c=第三机场订阅名称#noCache`
- base：
  `https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/clash/config/sub-store-fill-clash-providers.js#sub=机场订阅名称#noCache`

脚本参数会自动写入对应的 `proxy-providers`：

- `a` -> `A机场`
- `b` -> `B机场`
- `c` -> `C机场`
- `sub` -> `机场1`

如果脚本不能从当前 Sub-Store 请求中自动识别服务根地址，可以显式追加 `base` 参数，例如：

`https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/clash/config/sub-store-fill-clash-providers.js#a=Qcloud&b=private&base=https%3A%2F%2Fsub.example.com%2Ftoken#noCache`

AC 模板沿用 ABC 中 C 机场的既有定位：C 机场通过 `C全线路优选` 参与主节点、人工智能、Telegram 和网络测试，不拆分地区组。

同一个 Sub-Store 文件只保留一个 Clash 模板来源；`base`、`2-subscription`（AB）、`2-subscription-ac`（AC）、`3-subscription`（ABC）需要分别建文件，避免多个完整 YAML 被拼接后产生重复顶层键。

## Sub-Store 使用说明（Loon AC）

Loon AC 配置也可以作为 Sub-Store 远程文件，并通过文件脚本动态填充 A/C 机场地址，避免把真实订阅写入公开模板。

### 1. 新增远程文件

在 Sub-Store 文件管理中创建一个远程文件，地址填写：

`https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/loon/config/2-subscription-ac-loon-rule.lcf`

### 2. 添加文件脚本

先在 Sub-Store 中创建 A/C 机场订阅，然后给该文件添加脚本操作：

`https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/loon/config/sub-store-fill-loon-proxies.js#a=Qcloud&c=第三机场订阅名称#noCache`

脚本参数会替换 `[Remote Proxy]` 中的对应地址：

- `a` -> `A机场`
- `c` -> `C机场`

参数默认按普通订阅名称处理。使用组合订阅时，传入 `collection/组合订阅名称`，或者直接传入 Sub-Store 生成的组合订阅下载地址。

如果脚本无法从当前请求识别 Sub-Store 服务根地址，可显式追加 URL 编码后的 `base` 参数：

`https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/loon/config/sub-store-fill-loon-proxies.js#a=Qcloud&c=第三机场订阅名称&base=https%3A%2F%2Fsub.example.com%2Ftoken#noCache`

处理完成后，复制该文件在 Sub-Store 中的下载地址，将它作为 Loon 配置使用。不要把真实机场订阅地址提交到公开仓库。
