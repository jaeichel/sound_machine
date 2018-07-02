const debug = require('debug')('mediaPlayer');
const express = require('express');

const { Chromecast } = require('./chromecast');

const SOUND_FILES = require('./sound_files.json');

const SOUND_LEVEL = 0.25;
const SLEEP_TIMEOUT_MS = 20*60*1000;
const FADE_LEVEL_STEP = 0.01;
const FADE_LEVEL_PERIOD_MS = 500;

class MediaPlayer {
  constructor() {
    this.devices = [];
    this.mediaTimeout = undefined;
    this.router = express.Router();

    this.soundFiles = SOUND_FILES;

    this.initRoutes();
    this.initDevices();
  }

  initRoutes() {
    this.router.get('/devices', (req, res) => this.processGetDevices(req, res));
    this.router.get('/sounds',  (req, res) => this.processGetSounds(req, res));
  }

  processGetDevices(req, res) {
    res.json(this.devices.map(device => device.deviceFriendlyName));
  }

  processGetSounds(req, res) {
    let soundNames = this.soundFiles.map(soundFile => soundFile.name);
    res.json(soundNames);
  }

  initDevices() {
    this.populateDevices().then(devices => {
      debug('found', this.devices.length, 'devices');
    });
  }

  getRouter() {
    return this.router;
  }

  populateDevices() {
    return this.queryDevices().then(foundDevices => {
      let allDevices = foundDevices.reduce((map, device) => {
        map[device.deviceName] = device;
        return map;
      }, {});
      allDevices = this.devices.reduce((map, device) => {
        map[device.deviceName] = device;
        return map;
      }, allDevices);

      const deviceNames = Object.keys(allDevices);
      this.devices = deviceNames.map(deviceName => {
        return allDevices[deviceName];
      });

      return this.devices;
    });
  }

  queryDevices() {
    let chromecast = new Chromecast();
    return chromecast.getDevices().then(devices => {
      return JSON.parse(devices);
    });
  }

  getDevices() {
    return this.devices;
  }

  getSoundFiles() {
    return this.soundFiles;
  }

  getOrFindDevice(friendlyName, noRetry) {
    let filteredDevices = this.devices.filter(
      device => device.deviceFriendlyName === friendlyName
    );
    if (filteredDevices.length > 0) {
      return new Promise(resolve => resolve(filteredDevices[0]));
    } else if (!noRetry) {
      return this.populateDevices().then(() => {
        return this.getOrFindDevice(friendlyName, true);
      });
    } else {
      return new Promise(resolve => resolve(null));
    }
  }

  getDeviceUri(device) {
    return device.deviceAddress + ':' + device.devicePort;
  }

  playRandomSound(deviceUri, genre) {
    const soundFiles = this.soundFiles.filter(soundFile => {
      return genre === undefined || genre === '' ||
        soundFile.genres.indexOf(genre) !== -1;
    });
    const randomIndex = Math.floor(Math.random() * soundFiles.length);
    const soundName = soundFiles[randomIndex].name;
    const soundUri = soundFiles[randomIndex].url;
    debug(randomIndex, soundFiles[randomIndex])

    this.playSound(deviceUri, soundName, soundUri);
  }

  playSound(deviceUri, soundName, soundUri) {
    let chromecast = new Chromecast();
    return chromecast.setVolume(deviceUri, {muted: true}).then(() => {
      return chromecast.setVolume(deviceUri, {level: 0});
    }).then(() => {
      return chromecast.setMediaPlayback(
        deviceUri,
        'audio/mp3',
        soundUri,
        'BUFFERED', // or LIVE
        soundName,
        undefined,
        undefined,
        false
      );
    }).then(() => {
      return chromecast.setVolume(deviceUri, {muted: false});
    }).then(() => {
      return chromecast.setVolume(deviceUri, {level: SOUND_LEVEL});
    }).then(() => {
      clearTimeout(this.mediaTimeout);
      this.mediaTimeout = setTimeout(() => {
        this.fadeOut(deviceUri);
      }, SLEEP_TIMEOUT_MS);
    })
    .catch(console.error);
  }

  fadeOut(deviceUri, level) {
    let chromecast = new Chromecast();
    clearTimeout(this.mediaTimeout);

    if (level === undefined) {
      return chromecast.getVolume(deviceUri).then(volume => {
        if (volume === undefined || volume === null) {
          this.fadeOut(deviceUri, SOUND_LEVEL);
        } else if (volume.level) {
          this.fadeOut(deviceUri, volume.level);
        } else {
          this.fadeOut(deviceUri, 0);
        }
      });
    }

    if (level <= 0) {
      return chromecast.stop(deviceUri);
    } else {
      return chromecast.setVolume(deviceUri, {level: level}).then(() => {
        this.mediaTimeout = setTimeout(() => {
          this.fadeOut(deviceUri, level - FADE_LEVEL_STEP);
        }, FADE_LEVEL_PERIOD_MS);
      });
    }
  }
}

module.exports = {
  MediaPlayer: MediaPlayer
};
