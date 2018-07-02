process.env['DEBUG'] = 'mdns:* chromecast mynoise web_interface';

const {WebInterface} = require('./web_interface');

async function run(sceneName) {
  var webInterface = new WebInterface();
  await webInterface.waitForInit();
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
    ).then(console.log).catch(console.error);
  } else {
    console.log('cound not find chromecast device.')
  }
}

//extractNoiseSources();
run('Circular Breeze');
