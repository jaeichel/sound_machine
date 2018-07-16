//process.env['DEBUG'] = 'mdns:* chromecast mynoise web_interface';
process.env['DEBUG'] = 'nokia chromecast';

const debug = require('debug')('nokia');
const express = require('express');

const nokiaAuthGet = require('./nokia');
const {Chromecast} = require('./chromecast');

const WEB_INTERFACE_PORT = 3002;
const SOUND_PORT = 3003;

const SOUND_FILES = [
  {
    name:'Rain on Tent',
    url: 'http://arrowlofts.justineichel.com:3003/myNoise_RAIN3_16162525253725372516_0_60.mp3'
  }
];

//const SPEAKER = 'Kitchen speaker';
const SPEAKER = 'Bedroom speaker';
const SOUND_LEVEL = 0.25;
const SLEEP_TIMEOUT_MS = 20*60*1000;
const FADE_LEVEL_STEP = 0.01;
const FADE_LEVEL_PERIOD_MS = 500;

async function run(sceneName) {
  let chromecast = new Chromecast();
  let devices = JSON.parse(await chromecast.getDevices());
  devices = devices.filter(device => device.deviceFriendlyName === SPEAKER);
  if (devices.length > 0) {
    let device = devices[0];
    debug(device);

    let soundApp = express();
    soundApp.use('/', express.static('../sounds'));
    soundApp.listen(SOUND_PORT);

    let app = express();
    app.all('/nokia', (req, res) => {
      debug(new Date(), req.method, req.query);

      res.send('');

      let chromecast = new Chromecast();
      const deviceUri = device.deviceAddress + ':' + device.devicePort;
      if (req.query.ifttt === 'entered') {
        return playRandomSound(chromecast, deviceUri);
      } else if (req.query.ifttt === 'left') {
        return fadeOut(chromecast, deviceUri);
      }
      /*

      if (req.query.startdate === undefined) {
        req.query.startdate = Math.round(new Date().getTime() / 1000 - 5*3600);
        req.query.enddate = Math.round(new Date().getTime() / 1000);

        debug(req.query);
      }

      nokiaAuthGet('https://api.health.nokia.com/v2/sleep', {
        action: 'get',
        startdate: req.query.startdate,
        enddate: req.query.enddate,
      }).then(body => {
        let series = body.body.series;
        series = series.sort((a, b) => {
          return a.startdate - b.startdate;
        });
        debug(series);

        let nowSec = new Date().getTime() / 1000;
        let activeSeries = series.filter(data => {
          return Math.abs(data.startdate - nowSec) < 5*60;
        });
        let awakeNow = activeSeries.filter(data => {
          return data.state === 0;
        });

        debug(awakeNow);

        const deviceUri = device.deviceAddress + ':' + device.devicePort;
        if (awakeNow.length > 0) {
          return playRandomSound(chromecast, deviceUri);
        } else {
          return chromecast.stop(deviceUri);
        }

      }).then(() => {
        const start = new Date();
        const end = new Date();
        start.setTime(req.query.startdate*1000);
        end.setTime(req.query.enddate*1000);
        return nokiaAuthGet('https://api.health.nokia.com/v2/sleep', {
          action: 'getsummary',
          startdateymd: start.toISOString().split('T')[0],
          enddateymd: end.toISOString().split('T')[0],
          lastupdate: 0
        });
      }).then(body => debug(body.body.series))
      .catch(console.error);
      */
    });
    app.all('*', (req, res) => {
      console.error(req);
      throw new Error('not implemented');
    });
    app.use(errorHandler);
    app.listen(WEB_INTERFACE_PORT);

    await nokiaAuthGet('https://api.health.nokia.com/notify', {
      action: 'revoke',
      callbackurl: 'http://kitchener.justineichel.com/nokia',
      appli: 44
    }).then(debug)
    .then(() => {
      return nokiaAuthGet('https://api.health.nokia.com/notify', {
        action: 'list'
      });
    }).then(body => debug(body.body))
    .catch(console.error)
    .then(() => {
      return nokiaAuthGet('https://api.health.nokia.com/notify', {
        action: 'subscribe',
        callbackurl: 'http://kitchener.justineichel.com/nokia',
        comment: 'arrowlofts sleep detector',
        appli: 44,
      });
    }).then(body => debug(body))
    .then(() => {
      return nokiaAuthGet('https://api.health.nokia.com/notify', {
        action: 'list'
      });
    }).then(body => debug(body.body))
    .catch(console.error);
  }
}

var mediaTimeout = undefined;
function playRandomSound(chromecast, deviceUri) {
  const randomIndex = Math.floor(Math.random() * SOUND_FILES.length);
  const soundFileName = SOUND_FILES[randomIndex].name;
  const soundFile = SOUND_FILES[randomIndex].url;
  debug(randomIndex, soundFile)

  return chromecast.setVolume(deviceUri, {muted: true}).then(() => {
    return chromecast.setVolume(deviceUri, {level: 0});
  }).then(() => {
    return chromecast.setMediaPlayback(
      deviceUri,
      'audio/mp3',
      soundFile,
      'BUFFERED', // or LIVE
      soundFileName,
      undefined,
      undefined,
      false
    );
  }).then(() => {
    return chromecast.setVolume(deviceUri, {muted: false});
  }).then(() => {
    return chromecast.setVolume(deviceUri, {level: SOUND_LEVEL});
  }).then(debug)
  .then(() => {
    clearTimeout(mediaTimeout);
    mediaTimeout = setTimeout(() => {
      fadeOut(chromecast, deviceUri);
    }, SLEEP_TIMEOUT_MS);
  })
  .catch(console.error);
}

function fadeOut(chromecast, deviceUri, level) {
  clearTimeout(mediaTimeout);

  if (level === undefined) {
    return chromecast.getVolume(deviceUri).then(volume => {
      if (volume === undefined || volume === null) {
        fadeOut(chromecast, deviceUri, SOUND_LEVEL);
      } else if (volume.level) {
        fadeOut(chromecast, deviceUri, volume.level);
      } else {
        fadeOut(chromecast, deviceUri, 0);
      }
    });
  }

  if (level <= 0) {
    return chromecast.stop(deviceUri);
  } else {
    return chromecast.setVolume(deviceUri, {level: level}).then(() => {
      mediaTimeout = setTimeout(() => {
        fadeOut(chromecast, deviceUri, level - FADE_LEVEL_STEP);
      }, FADE_LEVEL_PERIOD_MS);
    });
  }

}

async function runChromecastTest() {
  var chromecast = new Chromecast();
  var devices = JSON.parse(await chromecast.getDevices());
  devices = devices.filter(device => device.deviceFriendlyName === 'Kitchen speaker');
  if (devices.length > 0) {
    var device = devices[0];
    var response = chromecast.setMediaPlayback(
      device.deviceAddress + ':' + device.devicePort,
      'video/mp4',
      'http://commondatastorage.googleapis.com/gtv-videos-bucket/big_buck_bunny_1080p.mp4',
      'BUFFERED', // or LIVE
      'Media Title',
      undefined,
      'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
      false
    ).then(debug).catch(console.error);
  } else {
    debug('cound not find chromecast device.')
  }
}

function errorHandler(err, req, res, next) {
  res.status(500)
  res.render('error', { error: err })
}

run();
