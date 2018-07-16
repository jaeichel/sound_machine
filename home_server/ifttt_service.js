const debug = require('debug')('iftttService');
const express = require('express');

const { IFTTTPlayAudio } = require('./ifttt_play_audio');
const { IFTTTSetSleepTimer } = require('./ifttt_set_sleep_timer');

//const SPEAKER = 'Kitchen speaker';
const SPEAKER = 'Bedroom speaker';

const CHANNEL_KEY = 'Oh2veyOwk0TdWHi8g54Osh76VRljQvAQgntW4MoefhGDqJptKuN-JJEcmA7Gxxrx';

class IFTTTService {
  constructor(mediaPlayer) {
    this.playAudio = new IFTTTPlayAudio(mediaPlayer, CHANNEL_KEY);
    this.setSleepTimer = new IFTTTSetSleepTimer(mediaPlayer, CHANNEL_KEY);

    this.mediaPlayer = mediaPlayer;
    this.router = express.Router();

    this.messageId = 0;

    this.initRoutes();
  }

  initRoutes() {
    this.router.use(express.json());

    this.router.post('/', (req, res) => this.processPostIFTTT(req, res));
    this.router.get(
      '/v1/status', (req, res) => this.getStatus(req, res)
    );
    this.router.post(
      '/v1/test/setup', (req, res) => this.postTestSetup(req, res)
    );

    this.router.use(
      '/v1/actions/play_audio', this.playAudio.getRouter()
    );
    this.router.use(
      '/v1/actions/set_sleep_timer', this.setSleepTimer.getRouter()
    );
  }

  getRouter() {
    return this.router;
  }

  processPostIFTTT(req, res) {
    debug(new Date(), req.method, req.query);
    res.send('');

    let speakerName = SPEAKER;
    if (req.query.device !== undefined) {
      speakerName = req.query.device;
    }

    let soundIndex = -1;
    if (req.query.sound_name !== undefined) {
      const soundNames = this.mediaPlayer.getSoundFiles().map(
        sound => sound.name
      );
      soundIndex = soundNames.indexOf(req.query.sound_name);
    }
    debug('searching for device', speakerName, '...');

    return this.mediaPlayer.getOrFindDevice(speakerName).then(device => {
      if (device) {
        const deviceUri = this.mediaPlayer.getDeviceUri(device);
        const soundFile = this.mediaPlayer.getSoundFiles()[soundIndex];
        debug('found device', deviceUri);
        if (req.query.event === 'entered_bed') {
          if (soundIndex >= 0) {
            return this.mediaPlayer.playSound(
              deviceUri, soundFile.name, soundFile.url
            );
          } else {
            return this.mediaPlayer.playRandomSound(deviceUri);
          }
        } else if (req.query.event === 'left_bed') {
          return this.mediaPlayer.fadeOut(deviceUri);
        } else {
          throw new Error('no valid command found: ' + req.query.toString());
        }
      } else {
        throw new Error('no device found: ' + speakerName);
      }
    });
  }

  getStatus(req, res) {
    if (this.getValidChannel(req)) {
      res.status(200).send();
    } else {
      res.status(401).send();
    }
  }

  getValidChannel(req) {
    if (
      req.headers['ifttt-channel-key'] &&
      req.headers['ifttt-channel-key'] === CHANNEL_KEY
    ) {
      return true;
    } else {
      return false;
    }
  }

  postTestSetup(req, res) {
    if (!this.getValidChannel(req)) {
      res.status(401).send();
      return;
    }

    res.json({
      "data": {
        "samples": {
          "actions": {
            "play_audio": {
              "sound_name": "Random",
              "sound_genre": "sleep",
              "chromecast_device": "Kitchen speaker",
              "test": true
            },
            "set_sleep_timer": {
              "timeout_min": "0",
              "chromecast_device": "Kitchen speaker",
              "test": true
            }
          },
          "actionRecordSkipping": {
            "play_audio": {
              "sound_name": "",
              "sound_genre": "",
              "chromecast_device": ""
            },
            "set_sleep_timer": {
              "timeout_min": "",
              "chromecast_device": ""
            }
          }
        }
      }
    });
  }
}

module.exports = {
  IFTTTService: IFTTTService
};
