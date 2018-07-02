const debug = require('debug')('iftttService');
const express = require('express');

class IFTTTPlayAudio {
  constructor(mediaPlayer, channelKey) {
    this.channelKey = channelKey;
    this.mediaPlayer = mediaPlayer;
    this.router = express.Router();

    this.messageId = 0;

    this.initRoutes();
  }

  initRoutes() {
    this.router.use(express.json());

    this.router.post(
      '/', (req, res) => this.postAction(req, res)
    );
    this.router.post(
      '/fields/sound_name/options',
      (req, res) => this.postSoundNameOptions(req, res)
    );
    this.router.post(
      '/fields/sound_genre/options',
      (req, res) => this.postSoundGenreOptions(req, res)
    );
    this.router.post(
      '/fields/chromecast_device/options',
      (req, res) => this.postChromecastDeviceOptions(req, res)
    );
  }

  getRouter() {
    return this.router;
  }

  getValidChannel(req) {
    if (
      req.headers['ifttt-channel-key'] &&
      req.headers['ifttt-channel-key'] === this.channelKey
    ) {
      return true;
    } else {
      return false;
    }
  }

  postAction(req, res) {
    if (!this.getValidChannel(req)) {
      res.status(401).json({
        errors: [{
          message: 'invalid channel code'
        }]
      });
      return;
    }

    if (req.body.actionFields === undefined) {
      res.status(400).json({
        errors: [{
          message: 'missing actionFields in body request'
        }]
      });
      return;
    }

    if (req.body.actionFields.sound_name === undefined) {
      res.status(400).json({
        errors: [{
          message: 'missing sound_name parameter in body request'
        }]
      });
      return;
    }



    if (req.body.actionFields.sound_genre === undefined) {
      res.status(400).json({
        errors: [{
          message: 'missing sound_genre parameter in body request'
        }]
      });
      return;
    }

    if (req.body.actionFields.chromecast_device === undefined) {
      res.status(400).json({
        errors: [{
          message: 'missing chromecast_device parameter in body request'
        }]
      });
      return;
    }

    if (req.body.actionFields.chromecast_device === '') {
      res.status(400).json({
        errors: [{
          status: 'SKIP',
          message: 'invalid chromecast_device parameter'
        }]
      });
      return;
    }

    if (
      req.body.actionFields.sound_name === '' && req.body.actionFields.sound_genre === ''
    ) {
      req.body.actionFields.sound_name = 'Random';
    }

    res.status(200).json({
      data: [{
        id: this.messageId++
      }]
    });

    if (req.body.actionFields.test) {
      return;
    }

    debug(new Date(), 'PlayAudio');

    const chromecastDevice = req.body.actionFields.chromecast_device;
    const soundNames = this.mediaPlayer.getSoundFiles().map(
      sound => sound.name
    );
    const soundIndex = soundNames.indexOf(req.body.actionFields.sound_name);

    debug('searching for device', chromecastDevice, '...');

    return this.mediaPlayer.getOrFindDevice(chromecastDevice).then(device => {
      if (device) {
        const deviceUri = this.mediaPlayer.getDeviceUri(device);
        const soundFile = this.mediaPlayer.getSoundFiles()[soundIndex];
        debug('found device', deviceUri);
        debug('found sound', soundFile);

        if (soundIndex >= 0) {
          return this.mediaPlayer.playSound(
            deviceUri, soundFile.name, soundFile.url
          );
        } else {
          return this.mediaPlayer.playRandomSound(
            deviceUri, req.body.actionFields.sound_genre
          );
        }
      } else {
        throw new Error('no device found: ' + chromecastDevice);
      }
    });
  }

  postSoundNameOptions(req, res) {
    if (!this.getValidChannel(req)) {
      res.status(401).json({
        errors: [{
          message: 'invalid channel code'
        }]
      });
      return;
    }

    let soundNames = this.mediaPlayer.getSoundFiles().map(
      soundFile => { return {
        label: soundFile.name,
        value: soundFile.name,
      };}
    );
    soundNames.push({
      label: 'Random',
      value: 'Random',
    });
    res.status(200).json({
      data: soundNames
    });
  }

  postSoundGenreOptions(req, res) {
    if (!this.getValidChannel(req)) {
      res.status(401).json({
        errors: [{
          message: 'invalid channel code'
        }]
      });
      return;
    }

    let genres = this.getGenres().map(
      genre => { return {
        label: genre,
        value: genre,
      };}
    );
    genres.push({
      label: 'Random',
      value: 'Random',
    });
    res.status(200).json({
      data: genres
    });
  }

  getGenres() {
    const genres = this.mediaPlayer.getSoundFiles().reduce((map, sound) => {
      for (let i in sound.genres) {
        let genre = sound.genres[i];
        map[genre] = true;
      }
      return map;
    }, {});
    return Object.keys(genres);
  }

  postChromecastDeviceOptions(req, res) {
    if (!this.getValidChannel(req)) {
      res.status(401).json({
        errors: [{
          message: 'invalid channel code'
        }]
      });
      return;
    }

    let devices = this.mediaPlayer.getDevices().map(
      device =>  { return {
        label: device.deviceFriendlyName,
        value: device.deviceFriendlyName,
      };}
    )
    res.status(200).json({
      data: devices
    });
  }
}

module.exports = {
  IFTTTPlayAudio: IFTTTPlayAudio
};
