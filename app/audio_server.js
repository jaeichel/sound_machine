const express = require('express');
const lame = require('lame');

function AudioServer(options, host, port) {
  this.app = express();

  this.encoder = new lame.Encoder({
    // input
    channels: 2,        // 2 channels (left and right)
    bitDepth: 16,       // 16-bit samples
    sampleRate: 44100,  // 44,100 Hz sample rate

    // output
    bitRate: options.bitrate,
    outSampleRate: options.samplerate,
    mode: (options.mono ? lame.MONO : lame.STEREO)
  });

  this.host = host;
  this.port = port;
  this.streamPath = '/stream.mp3';

  var self = this;
  this.app.get(this.streamPath, function(req, res) {
    res.set({
      'Content-Type': 'audio/mpeg3',
      'Transfer-Encoding': 'chunked'
    });
    self.encoder.pipe(res);
  });

  this.server = this.app.listen(this.port);
}

AudioServer.prototype.getEncoder = function() {
  return this.encoder;
}

AudioServer.prototype.getStreamUrl = function() {
  return 'http://' + this.host + ':' + this.port + this.streamPath;
}

module.exports = {
  AudioServer: AudioServer
};
