FROM ubuntu:16.04

RUN apt-get update && \
    apt-get install -y software-properties-common python-software-properties \
        vim curl git nodejs npm python build-essential \
        avahi-utils avahi-daemon libnss-mdns systemd && \
    ln -s `which nodejs` /usr/bin/node && \
    curl -sL https://deb.nodesource.com/setup_8.x | bash - && \
    apt-get install -y nodejs

#ENV DEBUG "mdns:* chromecast"
ENV DEBUG "chromecast"

CMD ["/bin/bash", "/project/docker/start.sh"]
