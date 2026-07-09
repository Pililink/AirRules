# AirRules

这个仓库用于维护自己的 Clash 及分流规则文件，当前核心配置放在 `clash/config/` 下，包含基础线路分组与规则集。  

## 当前配置结构

- `clash/config/base-clash-ruleset.yaml`
  - 代理集配置（`proxy-providers`）
  - 代理组策略（`proxy-groups`）
  - 规则集定义（`rule-providers`）
  - 路由规则（`rules`）
- `clash/ruleset/` 保留可选自定义规则文件；当前 Clash 模板的通用规则源统一使用 ACL4SSR `Clash/Providers`

## 关键策略说明

### 人工智能分组（`🤖 人工智能`）优先策略

`🤖 人工智能` 已设置为优先走 **美国自动选择**，并在第一位保留回退：

- `🇺🇸 美国自动选择`：`type: fallback`
  - 入口探测：`https://www.gstatic.com/generate_204`
  - 覆盖范围：通过 `filter` 匹配美国节点
  - 刷新间隔：`interval: 600`
- `🤖 人工智能` 的候选顺序为：
  1. `🇺🇸 美国自动选择`
  2. 其它地区分组（香港、日本、韩国、新加坡、美国、台湾、欧洲、土耳其、印度、俄罗斯、其他）
  3. `🚀 节点选择`

如果你希望让 AI 线路永远优先美国延迟回退，可直接按该顺序调整分组即可；后续如需扩展为更多层级回退，可在此组末尾继续添加 `DIRECT` 或其他 fallback 组。

### 其他分组

- 基础区域组仍使用 `url-test`，用于自动测试响应延迟与可用性。
- 关键用途规则：
  - `🚀 节点选择` 作为总入口
  - `🐟 漏网之鱼` 兜底全部流量
  - `📲 电报消息 / 🎮 游戏服务 / 🍎 苹果服务 / 🪟 微软服务 / 🇬 谷歌服务` 按用途分流
  - 规则源使用 ACL4SSR 的 `LocalAreaNetwork / UnBan / BanAD / BanProgramAD / ProxyGFWlist / ChinaDomain / ChinaIp` 以及常用服务规则集

## 使用方式（简要）

- 每次修改 `clash/config/base-clash-ruleset.yaml` 后，确保 Clash 重新加载配置。
- 更新订阅或远程规则前可先检查 `rule-providers` 链接是否可达。
- 对于远程规则文件变化，确认 `path` 目录（如 `./rule_provider/`、`./proxy_provider/`）存在对应文件或能被规则源自动更新。

## 兼容建议

- `fallback` 组与 `url-test` 可共存：上层 select 组（如 `🤖 人工智能`）决定优先级，底层各组决定各自选择逻辑。
- 建议在高并发环境中降低无效测试比例：保持较小 `interval` 的 `fallback/url-test` 对可用性更敏感的组，避免过度拉低测试效率。

## 本地记录

本仓库最近的调整重点：

- 为人工智能分组新增 `🇺🇸 美国自动选择`（fallback）
- 将 `🇺🇸 美国自动选择` 放到 `🤖 人工智能` 的第一候选
- 保留原有各国家地区 `url-test` 组，继续作为稳定备选线路

## Sub-Store 使用说明（base/2-subscription/3-subscription）

`base-clash-ruleset.yaml`、`2-subscription-clash-rule-set.yaml` 和 `3-subscription-clash-rule-set.yaml` 可以直接作为 Sub-Store 远程文件托管使用，建议按文件分别建立订阅。若你只做规则定制，这些文件本身更推荐只维护 `proxy-groups` 与 `rules`，把机场订阅链接留空，避免暴露个人链接。

### 1. 新增远程文件

在 Sub-Store 中按以下方式新增文件：

- 文件选择 > 创建文件
- 类型：`文件`
- 来源：`远程`
- 地址：粘贴以下对应 URL
  - base：
    `https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/clash/config/base-clash-ruleset.yaml`
  - 2-subscription：
    `https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/clash/config/2-subscription-clash-rule-set.yaml`
  - 3-subscription：
    `https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/clash/config/3-subscription-clash-rule-set.yaml`

### 2. 编辑文件脚本（动态填充订阅地址）

在 Sub-Store 中先创建 A/B 机场订阅或组合订阅，然后在文件管理的脚本操作中使用：

- 2-subscription：
  `https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/clash/config/sub-store-fill-clash-providers.js#a=Qcloud&b=private#noCache`
- 3-subscription：
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

同一个 Sub-Store 文件只保留一个 Clash 模板来源；`base`、`2-subscription`、`3-subscription` 需要分别建文件，避免多个完整 YAML 被拼接后产生重复顶层键。
