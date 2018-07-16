const debug = require('debug')('iftttService');
const express = require('express');

class IFTTTSetSleepTimer {
  constructor(mediaPlayer, channelKey) {
    this.channelKey = channelKey;
    this.mediaPlayer = mediaPlayer;
    this.router = express.Router();

    this.messageId = 0;
    this.timeout = {};

    this.initRoutes();
  }

  initRoutes() {
    this.router.use(express.json());

    this.router.post(
      '/', (req, res) => this.postAction(req, res)
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

    if (req.body.actionFields.timeout_min === undefined) {
      res.status(400).json({
        errors: [{
          message: 'missing timeout_min parameter in body request'
        }]
      });
      return;
    }

    if (req.body.actionFields.timeout_min === '') {
      res.status(400).json({
        errors: [{
          status: 'SKIP',
          message: 'invalid timeout_min parameter'
        }]
      });
      return;
    }

    if (isNaN(parseInt(req.body.actionFields.timeout_min))) {
      res.status(400).json({
        errors: [{
          status: 'SKIP',
          message: 'invalid timeout_min parameter'
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

    res.status(200).json({
      data: [{
        id: this.messageId++
      }]
    });

    if (req.body.actionFields.test) {
      return;
    }

    debug(new Date(), 'SetSleepTimer');

    const chromecastDevice = req.body.actionFields.chromecast_device;
    debug('searching for device', chromecastDevice, '...');
    return this.mediaPlayer.getOrFindDevice(chromecastDevice).then(device => {
      if (device) {
        const deviceUri = this.mediaPlayer.getDeviceUri(device);
        const TIMEOUT_MS = parseInt(req.body.actionFields.timeout_min) * 60 * 1000;
        debug('sleep timer set for', req.body.actionFields.timeout_min, 'minutes');
        clearTimeout(this.timeout[deviceUri]);
        this.timeout[deviceUri] = setTimeout(() => {
          this.mediaPlayer.fadeOut(deviceUri)
        }, TIMEOUT_MS);
      } else {
        throw new Error('no device found: ' + chromecastDevice);
      }
    });
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
  IFTTTSetSleepTimer: IFTTTSetSleepTimer
};
