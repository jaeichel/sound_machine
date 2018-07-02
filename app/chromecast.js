const debug = require('debug')('chromecast');
const mdns = require('mdns-js');

const Castv2Client = require('castv2-client').Client;
const Client = require('castv2').Client;
const DefaultMediaReceiver = require('castv2-client').DefaultMediaReceiver;

function Chromecast() {
  this.discoveryTimeout = 4000;
  this.appLoadTimeout = 6000;
  this.networkTimeout = 2000;
  this.currentRequestId = 1;
}

Chromecast.prototype.getDevices = function() {
  var updateCounter=0;
  var devices = [];
  var browser = mdns.createBrowser(mdns.tcp('googlecast'));
  var exception;

  var self = this;
  try {
    browser.on('ready', function(){
      browser.discover();
    });

    browser.on('update', function(service) {
      try {
        updateCounter++;
        debug('update received, service: ' + JSON.stringify(service));
        var currentDevice = {
          deviceName: self.getId(service.txt[0]),
          deviceFriendlyName: self.getFriendlyName(service.txt),
          deviceAddress: service.addresses[0],
          devicePort: service.port
        }
        if (!self.duplicateDevice(devices, currentDevice) && service.type[0].name!='googlezone') {
          devices.push(currentDevice);
          debug('Added device: '+ JSON.stringify(currentDevice));
        } else {
          debug('Duplicat or googlezone device: ' + JSON.stringify(currentDevice))
        }
      } catch (e) {
        console.error('Exception caught while prcessing service: ' + e);
      }
    });
  } catch (e) {
    console.error('Exception caught: ' + e);
    exception = e;
  }

  return new Promise(resolve => {
    setTimeout(() => {
      try{browser.stop();} catch (e) {console.error('Exception caught: ' + e); exception=e;}
      if (!exception) {
        if (devices.length>0) {
          debug('devices.length>0, updateCounter: ' + updateCounter);
        }
        resolve(JSON.stringify(devices));
      }
      resolve(null);
    }, self.discoveryTimeout);
  });
}

Chromecast.prototype.getId = function(id) {
  if (id&&id!=null&&id.match(/id=*/)!=null) {
    debug('Is id: ' + id);
    return (id.replace(/id=*/, ''));
  } else {
    debug('Is not id: ' + id);
  }
}

Chromecast.prototype.getFriendlyName = function(serviceTxt) {
  if (!serviceTxt) {
    debug('service.txt is missing');
    return;
  }
  var fns = serviceTxt.filter(function (txt) {
    return txt.match(/fn=*/)!=null;
  });
  if (fns.length>0) {
    var fn=fns[0];
    debug('Is friendly name: ' + fn);
    return (fn.replace(/fn=*/, ''));
  } else {
    debug('Is not friendly name: ' + fn);
  }
}

Chromecast.prototype.duplicateDevice = function(devices, device) {
  if (device.deviceName && device.deviceName!=null && devices && devices!=null) {
    for (var i = 0; i < devices.length; i++) {
      if(devices[i].deviceName == device.deviceName) {
        return true;
      }
    }
  }
  return false;
}

Chromecast.prototype.setMediaPlayback = function(address, mediaType, mediaUrl, mediaStreamType, mediaTitle, mediaSubtitle, mediaImageUrl, short) {
  var self = this;
  return new Promise(resolve => {
    var castv2Client = new Castv2Client();
    castv2Client.connect(self.parseAddress(address), function() {
      castv2Client.launch(DefaultMediaReceiver, function(err, player) {
        var media = {
          contentId: mediaUrl,
          contentType: mediaType,
          streamType: mediaStreamType,

          metadata: {
            type: 0,
            metadataType: 0,
            title: mediaTitle,
            subtitle: mediaSubtitle,
            images: [
              { url: mediaImageUrl }
            ]
          }
        };

        player.load(media, { autoplay: true }, function(err, status) {
          try{
            debug('Media loaded playerState: ', status.playerState);
            if (short==true) {
              mediaStatus = JSON.stringify(status);
              resolve(mediaStatus);
            }
          }
          catch(e){
            handleException(e);
            try{player.close();}catch(e){handleException(e);}
          }
        });

        player.on('status', function(status) {
          if (status) {
            debug('status.playerState: ', status.playerState);
            if (status.playerState=='PLAYING') {
              debug('status.playerState is PLAYING');
              if (player.session.sessionId) {
                console.log('Player has sessionId: ', player.session.sessionId);
                if (short==false) {
                  self.getMediaStatus(address, player.session.sessionId).then(mediaStatus => {
                    debug('getMediaStatus return value: ', mediaStatus);
                    resolve(mediaStatus);
                  });
                }
              }
            }
          }
        });


        setTimeout(() => {
          self.closeClient(castv2Client);
          resolve(null);
        }, self.appLoadTimeout);
      });
    });

    castv2Client.on('error', function(err) {
      handleException(err);
      try{castv2Client.close();}catch(e){handleException(e);}
      resolve(null);
    });
  });
}

Chromecast.prototype.getMediaStatus = function(address, sessionId) {
  var self = this;
  return new Promise(resolve => {
    var mediaStatus, connection, receiver, media, exception;
    var client = new Client();
    var corrRequestId = self.getNewRequestId();

    debug('getMediaStatus addr: %s', address, 'seId:', sessionId);
    try {
      client.connect(self.parseAddress(address), function() {
        connection = client.createChannel('sender-0', sessionId, 'urn:x-cast:com.google.cast.tp.connection', 'JSON');
        media = client.createChannel('sender-0', sessionId, 'urn:x-cast:com.google.cast.media', 'JSON');

        connection.send({ type: 'CONNECT', origin: {} });
        media.send({ type: 'GET_STATUS', requestId: corrRequestId });

        media.on('message', function(data, broadcast) {
          if(data.type == 'MEDIA_STATUS') {
            if (data.requestId==corrRequestId) {
              mediaStatus = data;
              debug('getMediaStatus recv: %s', JSON.stringify(mediaStatus));
              resolve(JSON.stringify(mediaStatus));
            }
          }
        });
      });

      client.on('error', function(err) {
        handleException(err);
        self.closeClient(client);
        resolve(null);
      });
    } catch (e) {
      handleException(err);
      self.closeClient(client);
      resolve(null);
    }

    setTimeout(() => {
      self.closeClient(client);
      resolve(null);
    }, self.networkTimeout);
  });
}

Chromecast.prototype.getNewRequestId = function() {
  if (this.currentRequestId > 9998){
    this.currentRequestId=1;
    debug("Reset currentRequestId");
  }
  debug("getNewRequestId: "+(this.currentRequestId+1))
  return this.currentRequestId++;
}

Chromecast.prototype.parseAddress = function(address) {
  var ip = address.split(':')[0];
  var port = address.split(':')[1];

  if (!port) {
    port = 8009;
  }

  debug('IP: '+ip+' port: '+port);

  return {
    host: ip,
    port: port
  };
}

Chromecast.prototype.handleException = function(e) {
  console.error('Exception caught: ' + e);
}

Chromecast.prototype.closeClient = function(client) {
  debug('closing client');
  try {
    client.close();
  } catch (e) {
    handleException(e);
  }
}

module.exports = {
  Chromecast: Chromecast
};
