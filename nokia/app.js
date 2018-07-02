//process.env['DEBUG'] = 'mdns:* chromecast mynoise web_interface';
process.env['DEBUG'] = 'nokia chromecast iftttService mediaPlayer';

const debug = require('debug')('nokia');
const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');

const { IFTTTService } = require('./ifttt_service');
const { MediaPlayer } = require('./media_player');

const HTTP_PORT = 3002;
const HTTPS_PORT = 3004;
const SOUND_PORT = 3003;

async function run() {
  let privateKey = fs.readFileSync('sslcert/server.key');
  let certificate = fs.readFileSync('sslcert/server.crt');
  let credentials = {key: privateKey, cert: certificate};

  let mediaPlayer = new MediaPlayer();
  let iftttService = new IFTTTService(mediaPlayer);

  let internalApp = express();
  internalApp.use('/sounds', express.static('../sounds'));
  internalApp.use('/media_player', mediaPlayer.getRouter());

  let internalServer = http.createServer(internalApp);
  internalServer.listen(SOUND_PORT);

  let externalApp = express();
  externalApp.use('/ifttt', iftttService.getRouter());

  let externalHttpServer = http.createServer(externalApp);
  externalHttpServer.listen(HTTP_PORT);

  let externalHttpsServer = https.createServer(credentials, externalApp);
  externalHttpsServer.listen(HTTPS_PORT);
}

run();
