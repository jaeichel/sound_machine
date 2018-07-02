const debug = require('debug')('web_interface');
const express = require('express');

const {AudioServer} = require('./audio_server');
const {Chromecast} = require('./chromecast');
const {MyNoise} = require('./mynoise.js');

function WebInterface() {
  const COOKIE = '_ga=GA1.2.847556868.1527312975; _gid=GA1.2.133479297.1527312975; uSET_unlogged={"CAL":"3030303030303030303000"}; bubble=1686; uID=9f6ae942f50b445bbdd1cdb81edd1dd6c8923e6e615cd982e8caf4bd0dd2764f; _gat=1';
  const HOST = 'arrowlofts.justineichel.com';
  const WEB_INTERFACE_PORT = 3001;
  const MEDIA_STREAM_PORT = 3000;

  var options = {
    bitrate: 256,
    samplerate: 44100,
    mono: false
  };

  this.audioServer = new AudioServer(options, HOST, MEDIA_STREAM_PORT);
  this.myNoise = new MyNoise(options, this.audioServer.getEncoder(), COOKIE);

  this.myNoiseSources = this.myNoise.extractSources();
  console.log(JSON.stringify(this.myNoiseSources, null, 2));

  this.chromecast = new Chromecast();
  this.devices = undefined;
  this.selectedPreset = undefined;
  this.selectedDevice = undefined;
  this.selectedScene = undefined;

  this.app = express();
  this.app.use('/', express.static('static'));

  var self = this;

  this.app.get('/devices', function(req, res) {
    res.send(JSON.stringify(self.devices, null, 2));
  });

  this.app.get('/devices/selected', function(req, res) {
    res.send(this.selectedDevice);
  });

  this.app.get('/scenes', function(req, res) {
    res.send(JSON.stringify(self.myNoiseSources, null, 2));
  });

  this.app.get('/scenes/selected', function(req, res) {
    res.send(this.selectedScene);
  });

  this.app.get('/presets', function(req, res) {
    if (self.myNoise.getPresets()) {
      var presets = Object.assign({}, self.myNoise.getPresets());
      for (var preset in presets) {
        presets[preset] = {
          levels: presets[preset],
          selected: preset === self.selectedPreset
        };
      }
      res.send(JSON.stringify(presets, null, 2));
    } else {
      res.send(JSON.stringify([], null, 2));
    }
  });

  this.app.get('/cast', async function(req, res) {
    var castDeviceName = req.query.device;
    var sceneName = req.query.scene;

    this.selectedDevice = castDeviceName;
    this.selectedScene = sceneName;
    await self.myNoise.loadSource(self.myNoiseSources[sceneName]);

    var devices = self.devices.filter(device => device.deviceFriendlyName === castDeviceName);
    if (devices.length > 0) {
      var device = devices[0];
      self.chromecast.setMediaPlayback(
        device.deviceAddress + ':' + device.devicePort,
        'video/mp4',
        self.audioServer.getStreamUrl(),
        'BUFFERED', // BUFFERED or LIVE
        sceneName,
        undefined,
        undefined,
        false
      ).then(res.send).catch(res.send);
    } else {
      res.send('cound not find chromecast device. ' + self.audioServer.getStreamUrl());
    }
  });

  this.app.get('/set_preset', function(req, res) {
    var presetName = req.query.preset;
    var presets = self.myNoise.getPresets();
    if (presets[presetName]) {
      debug('setting preset to ' + presetName + '...');
      debug(presets[presetName]);
      self.selectedPreset = presetName;
      var presetLevels = presets[presetName].split(',').map(level => parseFloat(level));
      self.myNoise.setPreset(...presetLevels);
    }
    res.end();
  });

  this.app.get('/set_timer', function(req, res) {
    var time = req.query.time;
    self.myNoise.setTimer(time);
  });

  this.app.get('/toggle_mute', function(req, res) {
    self.myNoise.toggleMute();
  });

  this.app.get('/get_mute', function(req, res) {
    res.send(self.myNoise.isMuted.toString());
  });

  this.app.get('/get_timer', function(req, res) {
    res.send(self.myNoise.iTimer.toString());
  });

  this.initPromise = this.chromecast.getDevices().then(function(devices) {
      self.devices = JSON.parse(devices);
      self.server = self.app.listen(WEB_INTERFACE_PORT);
  });
}

WebInterface.prototype.waitForInit = async function() {
  await this.initPromise;
}

module.exports = {
  WebInterface: WebInterface
};
