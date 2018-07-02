#!/bin/sh

/etc/init.d/dbus start
/etc/init.d/avahi-daemon start
#avahi-browse -a

#cd /project/app && npm cache clean -f

cd /project/app && \
    npm install && \
    sed -i  's/outBuffer = new AudioBuffer(this.buffer.numberOfChannels, blockSize, sampleRate)/outBuffer = new AudioBuffer(this.buffer.numberOfChannels, blockSize, this.buffer.sampleRate)/g' node_modules/web-audio-api/build/AudioBufferSourceNode.js && \
    npm start
