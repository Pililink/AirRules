#!/bin/sh
usb_path="/mnt/"$(ls /mnt | head -n 1)
profile=/etc/profile
install() {
        # Add script to system autostart docker
        uci set firewall.docker_init=include
        uci set firewall.docker_init.type='script'
        uci set firewall.docker_init.path=$usb_path"/script/docker_init.sh"
        uci set firewall.docker_init.enabled='1'
        uci set firewall.docker_init.reload='1'
        uci commit firewall
        echo -e "\033[32m  docker_init complete. \033[0m"
}
uninstall() {
    # Remove scripts from system autostart
    uci delete firewall.docker_init
    uci commit firewall
    echo -e "\033[33m docker_init  has been removed. \033[0m"
}

docker_init() {
    sed -i "/alias docker/d" $profile
	sed -i "/alias docker-compose/d" $profile
	echo "alias docker="$usb_path/mi_docker/docker-binaries/docker"" >>$profile
	echo "alias docker-compose="$usb_path/script/docker-compose"" >>$profile

    /etc/init.d/mi_docker stop
    sed -i '/valid_mountpath() {/a return 0' /etc/init.d/mi_docker
    sed -i "s/authorization_plugins .*/authorization_plugins ''/g" /etc/config/mi_docker
    /etc/init.d/mi_docker start
}

main() {
    [ -z "$1" ] && docker_init && return
    case "$1" in
    install)
        install
        ;;
    uninstall)
        uninstall
        ;;
    *)
        echo -e "\033[31m Unknown parameter: $1 \033[0m"
        return 1
        ;;
    esac
}


main "$@"

