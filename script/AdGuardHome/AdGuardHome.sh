#!/bin/sh

mount_point=$(ls /mnt | head -n 1)
ad_guard_home_dir="/mnt/"$(ls /mnt | head -n 1)"/script/AdGuardHome"
new_answer=$(ip addr show br-lan | grep 'inet ' | awk '{print $2}' | cut -d'/' -f1)
config_file=$ad_guard_home_dir"/AdGuardHome/AdGuardHome.yaml"
domain='mirouter'
start() {
    echo "start AdGuardHome"
    chmod o+x $ad_guard_home_dir/"AdGuardHome/AdGuardHome"
    $ad_guard_home_dir/"AdGuardHome/AdGuardHome" -s install
    $ad_guard_home_dir/"AdGuardHome/AdGuardHome" -s start
    iptables -t nat -A PREROUTING -p udp --dport 53 -j REDIRECT --to-ports 5553
    iptables -t nat -A PREROUTING -p tcp --dport 53 -j REDIRECT --to-ports 5553
    ip6tables -t nat -A PREROUTING -p udp --dport 53 -j REDIRECT --to-ports 5553
    ip6tables -t nat -A PREROUTING -p tcp --dport 53 -j REDIRECT --to-ports 5553
    iptables-save >/etc/iptables-script

}
stop() {
    echo "stop AdGuardHome"
    $ad_guard_home_dir/"AdGuardHome/AdGuardHome" -s stop
    $ad_guard_home_dir/"AdGuardHome/AdGuardHome" -s uninstall
    iptables -t nat -A PREROUTING -p udp --dport 53 -j REDIRECT --to-ports 5553
    iptables -t nat -A PREROUTING -p tcp --dport 53 -j REDIRECT --to-ports 5553
    ip6tables -t nat -A PREROUTING -p udp --dport 53 -j REDIRECT --to-ports 5553
    ip6tables -t nat -A PREROUTING -p tcp --dport 53 -j REDIRECT --to-ports 5553
    iptables-save >/etc/iptables-script

}

install() {
    echo "install AdGuardHome"
    uci set firewall.adguard_home=include
    uci set firewall.adguard_home.type='script'
    uci set firewall.adguard_home.path=$ad_guard_home_dir"/AdGuardHome.sh"
    uci set firewall.adguard_home.enabled='1'
    uci set firewall.adguard_home.reload='1'
    uci commit firewall
    update
    echo -e "\033[32m  AdGuardHome complete. \033[0m"
    
}

uninstall() {
    echo "uninstall AdGuardHome"
    uci delete firewall.adguard_home
    uci commit firewall
    stop
    echo -e "\033[33m AdGuardHome has been removed. \033[0m"
}

local_domain(){
    if [ -e $ad_guard_home_dir"/yq/yq" ]; then
    echo "文件存在"
    # 使用yq查询指定域名的记录
    yq_result=$($ad_guard_home_dir"/yq/yq" e '.filtering.rewrites[] | select(.domain == "'"$domain"'")' "$config_file")

    # 判断是否存在指定记录
    if [ -z "$yq_result" ]; then
        # 记录不存在，添加记录
        echo "未找到域名 $domain 的记录，添加记录..."
        $ad_guard_home_dir"/yq/yq" ea '.filtering.rewrites += [{ "domain": "'"$domain"'", "answer": "'"$new_answer"'" }]' "$config_file"
    else
        # 记录存在，更新 answer 值
        echo "已找到域名 $domain 的记录，更新 answer 值为 $new_answer..."
        $ad_guard_home_dir"/yq/yq" ea '.filtering.rewrites[] | select(.domain == "'"$domain"'").answer = "'"$new_answer"'"' "$config_file"
    fi
    else
        echo "文件不存在"
        mkdir -p $ad_guard_home_dir"/yq"
        latest_release=$(curl -s "https://api.github.com/repos/mikefarah/yq/releases/latest")
        latest_link=$(echo $latest_release | grep -o '"browser_download_url": "[^"]*_linux_arm64.tar.gz' | cut -d '"' -f 4)
        echo "https://mirror.ghproxy.com/"$latest_link
        curl -L https://mirror.ghproxy.com/"$latest_link" -o $ad_guard_home_dir"/yq/yq_linux_arm64.tar.gz"
        tar zxvf $ad_guard_home_dir"/yq/yq_linux_arm64.tar.gz" -C $ad_guard_home_dir"/yq"
        mv $ad_guard_home_dir"/yq/yq_linux_arm64" $ad_guard_home_dir"/yq/yq"
        local_domain
    fi
    
}

update(){
    echo "update AdGuardHome"
    stop
    # 使用GitHub API获取最新的release信息
    latest_release=$(curl -s "https://api.github.com/repos/AdguardTeam/AdGuardHome/releases/latest")

    # 从JSON响应中提取下载链接
    latest_link=$(echo $latest_release | grep -o '"browser_download_url": "[^"]*_linux_arm64.tar.gz' | cut -d '"' -f 4)
    echo "https://mirror.ghproxy.com/"$latest_link
    # 下载最新版本的文件
    rm ./AdGuardHome_linux_arm64.tar.gz
    curl -L https://mirror.ghproxy.com/"$latest_link" -o $ad_guard_home_dir"/AdGuardHome_linux_arm64.tar.gz"
    tar zxvf $ad_guard_home_dir"/AdGuardHome_linux_arm64.tar.gz"
    chmod a+x $ad_guard_home_dir/AdGuardHome/AdGuardHome
    start
    echo "如何配合shellcrash，请开启shellcrash的禁用DNS配置以及一键配置加密DNS。"
}
main() {
    [ -z "$1" ] && start && return
    case "$1" in
    install)
        install
        ;;
    uninstall)
        uninstall
        ;;
    update)
        update
        ;;
    local_domain)
        local_domain
        ;;
    start)
        start
        ;;
    stop)
        stop
        ;;
    *)
        echo -e "\033[31m Unknown parameter: $1 \033[0m"
        return 1
        ;;
    esac
}
main "$@"