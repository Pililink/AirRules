<#
.SYNOPSIS
    并发批量检测 Clash 节点是否被 Google 判为「不支持地区」。

.DESCRIPTION
    1) 从 Clash 配置（proxies / proxy-providers）或本机 Clash Verge 的 provider 缓存里读出全部节点；
    2) 起 N 个临时 mihomo 内核（每个独立端口、独立 data 目录），互不干扰，也不影响正在运行的 Clash；
    3) 每个节点测两项：
         · 出口 IP / 国家 / ASN          —— https://ipinfo.io/json
         · Google 地区判定              —— GET https://notebooklm.google.com/（不跟随跳转），
                                           若 302 且 Location 含 location=unsupported → 被拦
    4) 输出彩色表格 + 汇总 + 可选 CSV。

    为什么不用 Cloud Code API 直测：
        POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist
        无 token 时一律 401（先鉴权、后判地区），不带凭据测不出地区结论。
        notebooklm 的边缘跳转是无鉴权可观测的地区信号，实测与 Antigravity 的
        400 FAILED_PRECONDITION 完全对应（美国01 通过 / 美国02 被拦）。

.PARAMETER ConfigPath
    Clash YAML 路径。支持 proxies: 列表，或 proxy-providers（本地 path 优先，其次远程 url）。
    不传则自动读取 %APPDATA%\io.github.clash-verge-rev.clash-verge-rev\proxy_provider\*.yaml

.PARAMETER Filter
    只测名字匹配该正则的节点，如 -Filter '美国|日本'

.PARAMETER Max
    最多测 N 个节点（默认全部）

.PARAMETER Parallel
    并发实例数，默认 8。机器弱或机场限并发时可调小（4）。

.PARAMETER MihomoPath
    mihomo 内核路径，默认自动查找 Clash Verge 自带内核。

.PARAMETER Csv
    导出 CSV 路径。

.PARAMETER ProbeUrl
    地区探针地址，默认 https://notebooklm.google.com/


.EXAMPLE
    .\Check-ClashNodeGoogleRegion.ps1 -Filter '美国'

.EXAMPLE
    .\Check-ClashNodeGoogleRegion.ps1 -Filter '美国|日本|新加坡' -Parallel 10 -Csv .\google-region.csv
#>
[CmdletBinding()]
param(
    [string]$ConfigPath,
    [string]$Filter,
    [int]$Max = 0,
    [int]$Parallel = 8,
    [string]$MihomoPath,
    [string]$Csv,
    [string]$ProbeUrl = 'https://notebooklm.google.com/',
    [int]$MixPort = 17900,
    [int]$CtlPort = 17901
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8

function Find-Mihomo([string]$explicit) {
    if ($explicit) { if (Test-Path $explicit) { return $explicit } else { throw "找不到内核: $explicit" } }
    foreach ($c in @(
            "$env:ProgramFiles\Clash Verge\verge-mihomo.exe",
            "$env:ProgramFiles\Clash Verge\verge-mihomo-alpha.exe",
            "$env:LOCALAPPDATA\Programs\clash-verge\verge-mihomo.exe",
            "$env:ProgramFiles\mihomo\mihomo.exe")) {
        if (Test-Path $c) { return $c }
    }
    $cmd = Get-Command mihomo, clash-meta, clash -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { return $cmd.Source }
    throw "找不到 mihomo/clash 内核，请用 -MihomoPath 指定"
}

# 单行 proxy 解析：支持 {name: x, type: y, ...} 与 {"name":"x",...} 两种
function ConvertFrom-ProxyLine([string]$line) {
    $s = $line.Trim()
    if ($s.StartsWith('- ')) { $s = $s.Substring(2) } elseif ($s.StartsWith('-')) { $s = $s.Substring(1) }
    $s = $s.Trim()
    if (-not $s.StartsWith('{')) { return $null }
    try { return ($s | ConvertFrom-Json) } catch {}
    # 类 YAML flow：去掉外层花括号，按顶层逗号切分 k: v
    $inner = $s.TrimStart('{').TrimEnd('}')
    $obj = @{}
    $depth = 0; $cur = ''
    $parts = New-Object System.Collections.Generic.List[string]
    foreach ($ch in $inner.ToCharArray()) {
        if ($ch -in '{', '[', '(') { $depth++ }
        elseif ($ch -in '}', ']', ')') { $depth-- }
        if ($ch -eq ',' -and $depth -eq 0) { $parts.Add($cur); $cur = '' } else { $cur += $ch }
    }
    if ($cur.Trim()) { $parts.Add($cur) }
    foreach ($p in $parts) {
        $kv = $p -split ':', 2
        if ($kv.Count -lt 2) { continue }
        $k = $kv[0].Trim().Trim('"').Trim("'")
        $v = $kv[1].Trim().Trim('"').Trim("'")
        if ($v -match '^\d+$') { $v = [int]$v }
        $obj[$k] = $v
    }
    if ($obj.ContainsKey('name') -and $obj.ContainsKey('server')) { return [pscustomobject]$obj }
    return $null
}

function Read-ProxyFile([string]$path) {
    $out = New-Object System.Collections.Generic.List[object]
    $inProxies = $false
    foreach ($line in Get-Content $path -Encoding UTF8) {
        $t = $line.Trim()
        if ($t -match '^proxies:\s*$') { $inProxies = $true; continue }
        if ($inProxies -and $line -match '^\S' -and $t -notmatch '^#') { $inProxies = $false }
        if (-not $inProxies) { continue }
        if (-not ($t.StartsWith('- {') -or $t.StartsWith('{"name"') -or $t.StartsWith('- {"'))) { continue }
        $p = ConvertFrom-ProxyLine $t
        if ($p -and $p.name -and $p.server) { $out.Add($p) }
    }
    return $out
}

function Get-Nodes([string]$cfgPath) {
    $nodes = New-Object System.Collections.Generic.List[object]
    $downloaded = @()

    if ($cfgPath) {
        if (-not (Test-Path $cfgPath)) { throw "配置文件不存在: $cfgPath" }
        $base = Split-Path -Parent (Resolve-Path $cfgPath)
        foreach ($p in (Read-ProxyFile $cfgPath)) { $nodes.Add($p) }

        # proxy-providers：本地 path 优先，其次远程 url
        $txt = Get-Content $cfgPath -Raw -Encoding UTF8
        $inProv = $false
        $curName = $null; $curPath = $null; $curUrl = $null
        $flush = {
            if ($curName) {
                $loaded = $false
                if ($curPath) {
                    $cand = if ([IO.Path]::IsPathRooted($curPath)) { $curPath } else { Join-Path $base ($curPath -replace '^\./','') }
                    if (Test-Path $cand) { foreach ($p in (Read-ProxyFile $cand)) { $nodes.Add($p); $loaded = $true } }
                }
                if (-not $loaded -and $curUrl) {
                    try {
                        $body = (Invoke-WebRequest $curUrl -UseBasicParsing -TimeoutSec 25).Content
                        $tmpf = [IO.Path]::GetTempFileName() + '.yaml'
                        [IO.File]::WriteAllText($tmpf, $body, [Text.UTF8Encoding]::new($false))
                        $n0 = $nodes.Count
                        foreach ($p in (Read-ProxyFile $tmpf)) { $nodes.Add($p) }
                        Remove-Item $tmpf -Force -ErrorAction SilentlyContinue
                        if ($nodes.Count -gt $n0) { $downloaded += "$curName($($nodes.Count - $n0))" }
                    } catch { Write-Host "  provider $curName 下载失败: $($_.Exception.Message)" -ForegroundColor Yellow }
                }
            }
        }
        foreach ($line in ($txt -split "`r?`n")) {
            if ($line -match '^proxy-providers:\s*$') { $inProv = $true; continue }
            if ($inProv -and $line -match '^\S') { & $flush; $inProv = $false; $curName = $null; continue }
            if (-not $inProv) { continue }
            if ($line -match '^\s{2}([^\s:]+):\s*$') { & $flush; $curName = $Matches[1]; $curPath = $null; $curUrl = $null }
            elseif ($line -match '^\s+path:\s*"?([^"]+)"?\s*$') { $curPath = $Matches[1] }
            elseif ($line -match '^\s+url:\s*"?([^"]+)"?\s*$') { if ($Matches[1]) { $curUrl = $Matches[1] } }
        }
        if ($inProv) { & $flush }
        if ($downloaded.Count) { Write-Host ("  已下载 provider: " + ($downloaded -join ', ')) -ForegroundColor Yellow }
    }

    if ($nodes.Count -eq 0) {
        $cache = "$env:APPDATA\io.github.clash-verge-rev.clash-verge-rev\proxy_provider"
        if (-not (Test-Path $cache)) { throw "未提供 -ConfigPath，且找不到 Clash Verge provider 缓存: $cache" }
        Write-Host "自动读取 Clash Verge 缓存: $cache" -ForegroundColor Cyan
        foreach ($f in Get-ChildItem $cache -Filter '*.yaml') {
            $n0 = $nodes.Count
            foreach ($p in (Read-ProxyFile $f.FullName)) { $nodes.Add($p) }
            $n = $nodes.Count - $n0
            if ($n) { Write-Host ("  {0,-22} {1} 个节点" -f $f.Name, $n) }
        }
    }

    $skip = '剩余流量|距离下次重置|套餐到期|永久地址|无法更新|请勿|官网|过期|重置|公告'
    $out = New-Object System.Collections.Generic.List[object]
    $seen = @{}
    $usedNames = @{}
    foreach ($n in $nodes) {
        if (-not $n.name -or -not $n.server -or -not $n.port) { continue }
        if ([string]$n.name -match $skip) { continue }
        $key = "$($n.name)|$($n.server)|$($n.port)"
        if ($seen.ContainsKey($key)) { continue }
        $seen[$key] = 1
        # mihomo 要求 proxy 名字唯一：同名不同源时改名
        $name = [string]$n.name
        $i = 2
        while ($usedNames.ContainsKey($name)) { $name = "$($n.name) #$i"; $i++ }
        $usedNames[$name] = 1
        $n.name = $name
        $out.Add($n)
    }
    return $out
}

# ---------------- 主流程 ----------------
$mihomo = Find-Mihomo $MihomoPath
Write-Host "内核: $mihomo" -ForegroundColor Cyan

$all = Get-Nodes $ConfigPath
if ($Filter) { $all = @($all | Where-Object { $_.name -match $Filter }) }
if ($Max -gt 0 -and $all.Count -gt $Max) { $all = $all[0..($Max - 1)] }
if ($all.Count -eq 0) { throw "没有匹配的节点" }

$workers = [Math]::Max(1, [Math]::Min($Parallel, $all.Count))
Write-Host ("待测节点: {0} 个   并发实例: {1}" -f $all.Count, $workers) -ForegroundColor Cyan

$root = Join-Path $env:TEMP ("clashnode_" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $root | Out-Null

# 启动 N 个临时内核
$pool = @()
for ($w = 0; $w -lt $workers; $w++) {
    $dir = Join-Path $root "w$w"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $mp = $MixPort + $w * 2
    $cp = $CtlPort + $w * 2
    $cfg = @{
        'mixed-port'          = $mp
        'external-controller' = "127.0.0.1:$cp"
        'mode'                = 'rule'
        'log-level'           = 'silent'
        'proxies'             = @($all)
        'proxy-groups'        = @(@{ name = 'TEST'; type = 'select'; proxies = @($all | ForEach-Object { $_.name }) })
        'rules'               = @('MATCH,TEST')
    }
    $cfgPath = Join-Path $dir 'config.yaml'
    $cfg | ConvertTo-Json -Depth 10 | Out-File $cfgPath -Encoding utf8NoBOM
    $proc = Start-Process -FilePath $mihomo -ArgumentList @('-d', $dir, '-f', $cfgPath) -PassThru -WindowStyle Hidden
    $pool += [pscustomobject]@{ id = $w; proc = $proc; dir = $dir; mix = $mp; ctl = "http://127.0.0.1:$cp"; proxy = "http://127.0.0.1:$mp"; ready = $false }
}

$deadline = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $deadline -and (@($pool | Where-Object { -not $_.ready }).Count -gt 0)) {
    Start-Sleep -Milliseconds 300
    foreach ($wk in $pool) {
        if ($wk.ready) { continue }
        try { Invoke-RestMethod "$($wk.ctl)/version" -TimeoutSec 2 | Out-Null; $wk.ready = $true } catch {}
    }
}
$notReady = @($pool | Where-Object { -not $_.ready })
if ($notReady.Count) {
    $pool | ForEach-Object { if (-not $_.proc.HasExited) { $_.proc.Kill() } }
    throw "有 $($notReady.Count) 个临时内核启动失败（端口可能被占用，试试 -MixPort 17950 -CtlPort 17951）"
}

$results = New-Object System.Collections.Generic.List[object]
$sw = [Diagnostics.Stopwatch]::StartNew()
try {
    $cursor = 0
    $done = 0
    while ($cursor -lt $all.Count) {
        $wave = @()
        foreach ($wk in $pool) {
            if ($cursor -ge $all.Count) { break }
            $wave += [pscustomobject]@{ wk = $wk; node = $all[$cursor] }
            $cursor++
        }
        # 下发节点 + 并发发起请求
        foreach ($item in $wave) {
            Invoke-RestMethod -Method Put "$($item.wk.ctl)/proxies/TEST" -Body (@{ name = $item.node.name } | ConvertTo-Json) -ContentType 'application/json' -TimeoutSec 10 | Out-Null
            $ipf = Join-Path $item.wk.dir 'ip.json'
            $hdr = Join-Path $item.wk.dir 'h.txt'
            $cd = Join-Path $item.wk.dir 'code.txt'
            $item | Add-Member -NotePropertyName ipf -NotePropertyValue $ipf -Force
            $item | Add-Member -NotePropertyName hdr -NotePropertyValue $hdr -Force
            $item | Add-Member -NotePropertyName codef -NotePropertyValue $cd -Force
            $item | Add-Member -NotePropertyName p1 -NotePropertyValue (
                Start-Process curl.exe -ArgumentList @('-s', '--max-time', '15', '--proxy', $item.wk.proxy, '-o', $ipf, 'https://ipinfo.io/json') -PassThru -WindowStyle Hidden)
            $item | Add-Member -NotePropertyName p2 -NotePropertyValue (
                Start-Process curl.exe -ArgumentList @('-s', '-o', 'NUL', '-D', $hdr, '-w', '%{http_code}', '--max-time', '20', '--proxy', $item.wk.proxy, $ProbeUrl) -PassThru -WindowStyle Hidden -RedirectStandardOutput $cd)
        }
        # 等本波全部结束
        foreach ($item in $wave) {
            foreach ($pp in @($item.p1, $item.p2)) {
                try { $pp.WaitForExit(40000) | Out-Null } catch {}
                if (-not $pp.HasExited) { try { $pp.Kill() } catch {} }
            }
        }
        # 解析
        foreach ($item in $wave) {
            $done++
            $row = [ordered]@{ no = $done; node = $item.node.name; ip = ''; country = ''; asn = ''; google = ''; detail = '' }
            $ipRaw = Get-Content $item.ipf -Raw -ErrorAction SilentlyContinue
            if ($ipRaw) { try { $o = $ipRaw | ConvertFrom-Json; $row.ip = $o.ip; $row.country = $o.country; $row.asn = ($o.org -replace '\s+', ' ') } catch {} }
            $code = (Get-Content $item.codef -Raw -ErrorAction SilentlyContinue).Trim()
            $loc = (Select-String -Path $item.hdr -Pattern '^location:' -ErrorAction SilentlyContinue |
                    ForEach-Object { ($_.Line -replace '(?i)^location:\s*', '').Trim() }) -join ' '
            if ($code -eq '000' -or -not $code) { $row.google = 'TIMEOUT'; $row.detail = '请求失败/超时' }
            elseif ($loc -match 'unsupported') { $row.google = 'UNSUPPORTED'; $row.detail = $loc }
            elseif ($loc) { $row.google = 'OK'; $row.detail = $loc }
            elseif (-not $row.ip) { $row.google = 'NO-EGRESS'; $row.detail = "HTTP $code，但 ipinfo 拿不到出口" }
            else { $row.google = 'OK'; $row.detail = "HTTP $code 无跳转" }
            $results.Add([pscustomobject]$row)

            $color = switch ($row.google) { 'OK' { 'Green' } 'UNSUPPORTED' { 'Red' } default { 'Yellow' } }
            Write-Host ("[{0,3}/{1}] {2,-42} {3,-16} {4,-3} {5,-12} {6}" -f $done, $all.Count, $row.node, $row.ip, $row.country, $row.google, $row.asn) -ForegroundColor $color
        }
    }
}
finally {
    foreach ($wk in $pool) { if (-not $wk.proc.HasExited) { try { $wk.proc.Kill() } catch {} } }
    Start-Sleep -Milliseconds 300
    Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue
}
$sw.Stop()

Write-Host ""
Write-Host "================ 汇总 ================" -ForegroundColor Cyan
$ok = @($results | Where-Object { $_.google -eq 'OK' })
$bad = @($results | Where-Object { $_.google -eq 'UNSUPPORTED' })
$noeg = @($results | Where-Object { $_.google -eq 'NO-EGRESS' })
$err = @($results | Where-Object { $_.google -in @('TIMEOUT', 'ERROR') })
Write-Host ("耗时 {0:N1}s   可用 {1}   被拦 {2}   无出口 {3}   超时/失败 {4}" -f $sw.Elapsed.TotalSeconds, $ok.Count, $bad.Count, $noeg.Count, $err.Count)
if ($bad.Count) {
    Write-Host "`n被 Google 判为不支持地区：" -ForegroundColor Red
    $bad | ForEach-Object { Write-Host ("  {0,-42} {1,-16} {2}" -f $_.node, $_.ip, $_.asn) -ForegroundColor Red }
}
if ($ok.Count) {
    Write-Host "`n可用节点：" -ForegroundColor Green
    $ok | ForEach-Object { Write-Host ("  {0,-42} {1,-16} {2}" -f $_.node, $_.ip, $_.asn) -ForegroundColor Green }
}
if ($Csv) { $results | Export-Csv -Path $Csv -NoTypeInformation -Encoding UTF8; Write-Host "`n已导出: $Csv" -ForegroundColor Cyan }
