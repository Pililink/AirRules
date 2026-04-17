# AirRules

这个仓库用于维护自己的 Clash 及分流规则文件，当前核心配置放在 `clash/config/` 下，包含基础线路分组与规则集。  

## 当前配置结构

- `clash/config/base-clash-ruleset.yaml`
  - 代理集配置（`proxy-providers`）
  - 代理组策略（`proxy-groups`）
  - 规则集定义（`rule-providers`）
  - 路由规则（`rules`）
- `clash/ruleset/` 存放自定义规则文件（由 `rule-providers` 拉取/引用）

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
  - `📲 电报消息 / 📈 网络测试 / 🎮 游戏服务 / 🍎 苹果服务 / 🪟 微软服务 / 🇬 谷歌服务` 按用途分流

## 使用方式（简要）

- 每次修改 `clash/config/base-clash-ruleset.yaml` 后，确保 Clash 重新加载配置。
- 更新订阅或远程规则前可先检查 `rule-providers` 链接是否可达。
- 对于本地规则文件变化，确认 `path` 目录（如 `./rule_provider/`、`./proxy_provider/`）存在对应文件或能被规则源自动更新。

## 兼容建议

- `fallback` 组与 `url-test` 可共存：上层 select 组（如 `🤖 人工智能`）决定优先级，底层各组决定各自选择逻辑。
- 建议在高并发环境中降低无效测试比例：保持较小 `interval` 的 `fallback/url-test` 对可用性更敏感的组，避免过度拉低测试效率。

## 本地记录

本仓库最近的调整重点：

- 为人工智能分组新增 `🇺🇸 美国自动选择`（fallback）
- 将 `🇺🇸 美国自动选择` 放到 `🤖 人工智能` 的第一候选
- 保留原有各国家地区 `url-test` 组，继续作为稳定备选线路

## Sub-Store 使用说明（base/multi）

`base-clash-ruleset.yaml` 和 `multi-clash-rule-set.yaml` 可以直接作为 Sub-Store 远程文件托管使用，建议按文件分别建立两条订阅。若你只做规则定制，这两份文件本身更推荐只维护 `proxy-groups` 与 `rules`，把机场订阅链接留空，避免暴露个人链接。

### 1. 新增远程文件

在 Sub-Store 中按以下方式新增文件：

- 文件选择 > 创建文件
- 类型：`文件`
- 来源：`远程`
- 地址：粘贴以下对应 URL
  - base：
    `https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/clash/config/base-clash-ruleset.yaml`
  - base（国内游戏规则版）：
    `https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/clash/config/base-clash-ruleset-game-cn.yaml`
  - multi：
    `https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/clash/config/multi-clash-rule-set.yaml`

### 2. 编辑文件脚本（清空订阅地址）

在该远程文件的 `脚本` 栏填入以下 JS，可在 Sub-Store 下发给客户端前统一清空订阅地址占位，方便你在本地或其他地方动态注入：

- base：
```javascript
const yaml = ProxyUtils.yaml.safeLoad($content ?? $files?.[0] ?? '') || {};

if (yaml['proxy-providers']?.['机场1']) {
  yaml['proxy-providers']['机场1'].url = '';
}

$content = ProxyUtils.yaml.dump(yaml);
```
- multi：
```javascript
const yaml = ProxyUtils.yaml.safeLoad($content ?? $files?.[0] ?? '') || {};

if (yaml['proxy-providers']?.['A机场']) {
  yaml['proxy-providers']['A机场'].url = '';
}
if (yaml['proxy-providers']?.['B机场']) {
  yaml['proxy-providers']['B机场'].url = '';
}

$content = ProxyUtils.yaml.dump(yaml);
```

## 国内游戏规则（直连优先）

- 新增一份国内游戏配置文件：  
  - `clash/config/base-clash-ruleset-game-cn.yaml`
- 这版做了规则源叠加，先命中本地国内游戏列表直连，不再包含 Steam/Epic/Blizzard；
  再用官方规则补充其余游戏域名，交给 `🎮 游戏服务` 处理：
  - 国内直连源：  
    `https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/clash/ruleset/games-cn-domestic-cn.list`
  - 官方补充源（DustinWin）：  
    `https://raw.githubusercontent.com/DustinWin/ruleset_geodata/refs/heads/mihomo-ruleset/games-cn.list`
- 订阅入口：  
  `https://raw.githubusercontent.com/Pililink/AirRules/refs/heads/main/clash/config/base-clash-ruleset-game-cn.yaml`

如需只保留“一个规则源”，可移除 `games-cn`，只保留 `game-cn` 即可（`game-cn` 保持直连）。
