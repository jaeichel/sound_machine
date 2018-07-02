const acorn = require('acorn');
const debug = require('debug')('mynoise');
const fs = require('fs');
const https = require('https');
const path = require('path');
const url = require('url');

const AudioContext = require('web-audio-api').AudioContext

//require('vorbis.js');

function MyNoise(options, encoder, cookie) {
  this.SUPPORT_OGG = false;
  this.PHP_PATH_PREFIX = '../data/';
  this.AUDIO_PATH_PREFIX = '../sounds/';

  this.cookie = cookie;

  this.sourceFileA = new Array();
  this.sourceFileB = new Array();

  this.sourceA = new Array();
  this.sourceB = new Array();
  this.gainNodeA = new Array();
  this.gainNodeB = new Array();

  this.playbackFactor = new Array();
  this.stretch = new Array();
  this.interval = new Array();

  this.nextA = new Array();
  this.nextB = new Array();
  this.lastPlayedA = new Array();
  this.lastPlayedB = new Array();

  this.sSYNCHRO = '';

  this.currentLevel = new Array();
  this.isMuted = false;
  this.isCalibrated = false;
  this.isAnimating = false;
  this.movedSlider = -1;
  this.iTimer = -1;
  this.iFadeState = 0;
  this.fMotionStates = new Array();

  this.modulationTimeout = undefined;

  this.iINITIALANIMATIONSPEED = 32;
  this.iCurrentAnimationSpeed = this.iINITIALANIMATIONSPEED;
  this.iAnimationFactor = 1;
  this.randomCounter = 0;
  this.isMoving = 0;
  this.iAnimationMode = 1;
  this.randomLevel = new Array();
  this.iNowMovingTo = 0;
  this.isNowMovingUp = 0;

  this.epoch = 0;
  this.timerTimeout = undefined;

  this.savedCurrentLevel = new Array();

  this.context = new AudioContext();
  this.context.sampleRate = options.samplerate;
  this.context.outStream = encoder;
}

MyNoise.prototype.extractSources = function() {
  var myNoiseSources = {};
  var noiseGeneratorSources = this.extractNoiseGeneratorSources();
  var soundscapeGeneratorSources = this.extractSoundscapeGeneratorSources();
  myNoiseSources = {...myNoiseSources, ...noiseGeneratorSources};
  myNoiseSources = {...myNoiseSources, ...soundscapeGeneratorSources};
  return myNoiseSources;
}

MyNoise.prototype.extractNoiseGeneratorSources = function() {
  const file = '../data/noiseMachines.php';
  const regex = /<a+(.*)href='(.*)NoiseGenerator\.php+(.*)>(.*)<\/a>/gm;
  const fs = require('fs');
  var str = fs.readFileSync(file, 'utf8');

  var noiseGenerators = new Array();
  var m;
  while ((m = regex.exec(str)) !== null) {
    // This is necessary to avoid infinite loops with zero-width matches
    if (m.index === regex.lastIndex) {
        regex.lastIndex++;
    }

    // The result can be accessed through the `m`-variable.
    var noiseGenerator = new Object();
    m.forEach((match, groupIndex) => {
      if (groupIndex === 4) {
        noiseGenerator.name = match;
      }
      if (groupIndex === 2) {
        noiseGenerator.url = match + 'NoiseGenerator.php';
      }
    });
    noiseGenerators.push(noiseGenerator);
  }

  var myNoiseSources = new Object();
  noiseGenerators.forEach(function(noiseGenerator) {
    myNoiseSources[noiseGenerator.name] = noiseGenerator.url;
  });
  return myNoiseSources;
}

MyNoise.prototype.extractSoundscapeGeneratorSources = function() {
  const file = '../data/noiseMachines.php';
  const regex = /<a+(.*)href='(.*)SoundscapeGenerator\.php+(.*)>(.*)<\/a>/gm;
  const fs = require('fs');
  var str = fs.readFileSync(file, 'utf8');

  var noiseGenerators = new Array();
  var m;
  while ((m = regex.exec(str)) !== null) {
    // This is necessary to avoid infinite loops with zero-width matches
    if (m.index === regex.lastIndex) {
        regex.lastIndex++;
    }

    // The result can be accessed through the `m`-variable.
    var noiseGenerator = new Object();
    m.forEach((match, groupIndex) => {
      if (groupIndex === 4) {
        noiseGenerator.name = match;
      }
      if (groupIndex === 2) {
        noiseGenerator.url = match + 'SoundscapeGenerator.php';
      }
    });
    noiseGenerators.push(noiseGenerator);
  }

  var myNoiseSources = new Object();
  noiseGenerators.forEach(function(noiseGenerator) {
    myNoiseSources[noiseGenerator.name] = noiseGenerator.url;
  });
  return myNoiseSources;
}

MyNoise.prototype.loadSource = function(url) {
  var self = this;
  return new Promise(function(resolve, reject) {
    self.downloadOrReadPhpSource(url).then(function(body) {
      var script = self.extractScript(body);
      var parsedScript = acorn.parse(script);
      self.parseSourceAudio(parsedScript);
      self.parseSYNCHRO(parsedScript);
      self.parsePresets(body);
      resolve();
    });
  }).then(function() {
    return self.downloadSourceFiles();
  }).then(function() {
    self.stopAll();

    var promises = new Array();
    promises.push(self.createAudioBuffers(self.sourceFileA).then(function(audioBuffers) {
      self.audioBufferA = audioBuffers;
    }));
    promises.push(self.createAudioBuffers(self.sourceFileB).then(function(audioBuffers) {
      self.audioBufferB = audioBuffers;
    }));
    return Promise.all(promises);
  }).then(function() {
    self.initTuning();
    return self.createAudioSources();
  }).then(function() {
    self.computeIntervals();
    self.setAllLevels();
    self.playAllSounds();
  }).then(function() {
    debug('ready');
  });
}

MyNoise.prototype.downloadOrReadPhpSource = function(phpUrl) {
  var phpFilepath = this.getLocalPhpSourceFilepath(phpUrl);
  if (fs.existsSync(phpFilepath)) {
    debug('loaded php from cache...', phpFilepath);
    return new Promise(function(resolve, reject) {
      fs.readFile(phpFilepath, 'utf8', async function(e, body) {
        if (e) {
          reject(e);
        }
        resolve(body);
      });
    });
  } else {
    return this.downloadPhpSource(phpUrl).then(function(body) {
      fs.writeFileSync(phpFilepath, body, 'utf8');
      return body;
    });
  }
}

MyNoise.prototype.getLocalPhpSourceFilepath = function(phpUrl) {
  var parsedUrl = url.parse(phpUrl);
  return path.join(this.PHP_PATH_PREFIX, path.basename(parsedUrl.pathname));
}

MyNoise.prototype.downloadPhpSource = function(fileUrl) {
  var self = this;
  var parsedUrl = url.parse(fileUrl);
  return new Promise(function(resolve, reject) {
    var options = {
      host: parsedUrl.host,
      path: parsedUrl.pathname,
      cookie: self.cookie
    };
    https.get(options, function(res) {
      var body = '';
      res.on('data', function(chunk) {
        body += chunk;
      });
      res.on('end', function() {
        resolve(body);
      });
    }).on('error', reject);
  });
}

MyNoise.prototype.extractScript = function(body) {
  var indexOfScriptStart = body.indexOf('<script>');
  var indexOfScriptEnd = body.indexOf('</script>', indexOfScriptStart);
  return body.substring(indexOfScriptStart + '<script>'.length, indexOfScriptEnd-1);
}

MyNoise.prototype.parseSourceAudio = function(parsedScript) {
  var self = this;

  debug('parsing audio sources...');
  var assignSourcesFunction = parsedScript.body.filter(
    node => node.type === 'FunctionDeclaration' && node.id.name === 'assignSources'
  );
  if (assignSourcesFunction.length > 0) {
    assignSourcesFunction = assignSourcesFunction[0];

    self.sourceFileA = new Array();
    self.sourceFileB = new Array();
    var fileExt = self.SUPPORT_OGG ? '.ogg' : '.mp3';

    assignSourcesFunction.body.body.forEach(function(node) {
      if (node.type === 'ExpressionStatement') {
        var variable = node.expression.left.object.name;
        var variableIndex = node.expression.left.property.value;
        var value = node.expression.right.left.value + fileExt;

        if (variable === 'sourceFileA') {
          self.sourceFileA[variableIndex] = value;
        } else {
          self.sourceFileB[variableIndex] = value;
        }
      }
    });
  } else {
    debug('error: could not parse audio sources');
    throw new Error('could not find assignSources');
  }
}

MyNoise.prototype.parseSYNCHRO = function(parsedScript) {
  var self = this;

  debug('parsing sSYNCHRO...');
  var assignVariable = parsedScript.body.filter(
    node => node.type === 'VariableDeclaration' && node.declarations.length > 0 && node.declarations[0].id.name === 'sSYNCHRO'
  );
  if (assignVariable.length > 0) {
    var node = assignVariable[0].declarations[0];
    var value = node.init.value;
    this.sSYNCHRO = value;
  } else {
    debug('error: could not parse sSYNCHRO');
    throw new Error('could not find sSYNCHRO');
  }
}

MyNoise.prototype.parsePresets = function(phpSrouce) {
  const regex = /setPreset\(((\d|\.|,)*),"((\w|\s)*)"\);/gm;
  var presets = new Array();
  var m;
  while ((m = regex.exec(phpSrouce)) !== null) {
    // This is necessary to avoid infinite loops with zero-width matches
    if (m.index === regex.lastIndex) {
        regex.lastIndex++;
    }

    // The result can be accessed through the `m`-variable.
    var preset = new Object();
    m.forEach((match, groupIndex) => {
      if (groupIndex === 3) {
        preset.name = match;
      }
      if (groupIndex === 1) {
        preset.params = match;
      }
    });
    presets.push(preset);
  }

  var presetObjects = new Object();
  presets.forEach(function(preset) {
    presetObjects[preset.name] = preset.params;
  });

  this.presets = presetObjects;
  debug('presets ', JSON.stringify(this.presets, null, 2));
};

MyNoise.prototype.getPresets = function() {
  return this.presets;
}

MyNoise.prototype.downloadSourceFiles = function() {
  var self = this;

  debug('saving audio sources to files...');
  var urls = new Array();
  Array.prototype.push.apply(urls, this.sourceFileA);
  Array.prototype.push.apply(urls, this.sourceFileB);

  var promises = new Array();
  urls.forEach(async function(audioUrl) {
    var dest = self.getSourcePathFromUrl(audioUrl);
    if (!fs.existsSync(path.dirname(dest))) {
        fs.mkdirSync(path.dirname(dest));
    }
    if (!fs.existsSync(dest)) {
      promises.push(self.downloadToFile(audioUrl, dest));
    }
  });
  return Promise.all(promises);
}

MyNoise.prototype.getSourcePathFromUrl = function(audioUrl) {
  var parsedUrl = url.parse(audioUrl);
  return path.join(this.AUDIO_PATH_PREFIX, parsedUrl.pathname.replace('/Data', ''));
}

MyNoise.prototype.downloadToFile = function(fileUrl, dest) {
  var self = this;
  var parsedUrl = url.parse(fileUrl);
  return new Promise(function(resolve, reject) {
    debug('downloading ' + fileUrl + ' to ' + dest);
    var file = fs.createWriteStream(dest);
    var options = {
      host: parsedUrl.host,
      path: parsedUrl.pathname,
      cookie: self.cookie
    };
    https.get(options, function(res) {
      res.pipe(file);
      file.on('finish', function() {
        file.close(function(e, r) {
          if (e) {
            reject(e);
          } else {
            resolve(r);
          }
        });
      });
    }).on('error', reject);
  });
}

MyNoise.prototype.createAudioBuffers = async function(urls) {
  var self = this;

  debug('createAudioBuffers');
  var promises = new Array();
  for (var i in urls) {
    var audioUrl = urls[i];
    var audioFilepath = self.getSourcePathFromUrl(audioUrl);
    promises.push(self.createAudioBuffer(audioFilepath));
  }
  return Promise.all(promises);
}

MyNoise.prototype.createAudioBuffer = function(filepath) {
  var self = this;

  return new Promise(function(resolve, reject) {
    fs.readFile(filepath, function(e, buffer) {
      if (e) {
        console.log(e);
        reject(e);
      } else {
        self.context.decodeAudioData(buffer, function(decodedData) {
          resolve(decodedData);
        });
      }
    });
  });
}

MyNoise.prototype.initTuning = function() {
  debug('initial tuning...');
  for (var i = 0; i < this.audioBufferA.length; ++i) {
    this.playbackFactor[i] = 1.0;
    this.stretch[i] = 1.6;
    this.currentLevel[i] = 0.35;
  }

  this.fMotionStates[0]=[0.5,0.46,0.42,0.38,0.34,0.3,0.27,0.24,0.21,0.18];
	this.fMotionStates[1]=[0.3,0.3,0.3,0.3,0.3,0.3,0.3,0.3,0.3,0.3];
	this.fMotionStates[2]=[0.18,0.21,0.24,0.27,0.3,0.34,0.38,0.42,0.46,0.5];
}

MyNoise.prototype.createAudioSources = function() {
  var self = this;

  debug('creating audio sources...');

  for (var i = 0; i < self.audioBufferA.length; ++i) {
    var result = self.createAudioSource(self.audioBufferA[i], self.playbackFactor[i]);
    self.sourceA[i] = result.source;
    self.gainNodeA[i] = result.gainNode;
  }

  for (var i = 0; i < self.audioBufferB.length; ++i) {
    var result = self.createAudioSource(self.audioBufferB[i], self.playbackFactor[i]);
    self.sourceB[i] = result.source;
    self.gainNodeB[i] = result.gainNode;
  }
}

MyNoise.prototype.createAudioSource = function(buffer, playbackFactor) {
  var source = this.context.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = playbackFactor;

  var gainNode = this.context.createGain();
  gainNode.gain.value = 0;

  source.connect(gainNode);
  gainNode.connect(this.context.destination);

  return {
    source: source,
    gainNode: gainNode
  };
}

MyNoise.prototype.computeIntervals = function() {
  debug('computeIntervals...');
  for (var i = 0; i < this.sourceA.length; ++i) {
    this.interval[i] = this.computeInterval(
      this.sourceA[i], this.sourceB[i], this.stretch[i], this.playbackFactor[i]
    );
  }
}

MyNoise.prototype.computeInterval = function(sourceA, sourceB, stretch, playbackFactor) {
  return (sourceA.buffer.duration + sourceB.buffer.duration) / 2 * stretch / playbackFactor;
}

MyNoise.prototype.setAllLevels = function() {
  for (var i = 0; i < this.sourceA.length; ++i) {
    this.gainNodeA[i].gain.value = Math.pow(this.currentLevel[i], 3);
    this.gainNodeB[i].gain.value = Math.pow(this.currentLevel[i], 3);
  }
}

MyNoise.prototype.playAllSounds = function() {
  debug('playAllSounds...');
  for (var i = 0; i < this.sourceA.length; ++i) {
    this.startWebAudioByIndex(i);
  }
}

MyNoise.prototype.startWebAudioByIndex = function(i) {
  debug('startWebAudioByIndex', i);
	if (this.stretch[i] === 0) {
    this.sourceA[i].loop = 1;
  }

	this.nextA[i] = this.context.currentTime;
	this.nextB[i] = this.nextA[i] + this.sourceA[i].buffer.duration / 2*this.stretch[i] / this.playbackFactor[i];
	this.sourceA[i].start(this.nextA[i]);
	this.lastPlayedB[i] = this.nextA[i];
	if (this.stretch[i] !== 0) {
		  // take duration of the leader of the sync group
		  this.webAudioPlayBAt(i, this.nextB[i]);
		  this.lastPlayedB[i] = this.nextB[i];
		}
	else {
		  this.sourceB[i].loop = 1;
		  this.sourceB[i].start(this.nextA[i]);
		}
}

MyNoise.prototype.webAudioPlayBAt = function(item, onContextTime) {
  debug('webAudioPlayBAt...', item, onContextTime);
  var self = this;

	if (item === this.sSYNCHRO.indexOf(this.sSYNCHRO.charAt(item))) { // this is the first occurrence of the Sync group.
		this.nextA[item] += this.interval[item];
		this.sourceA[item].onended = function() {
      self.webAudioPlayAAt(item, self.nextA[item])
    };

	 	// This one and all others (sync)
		for (var i=this.sSYNCHRO.indexOf(this.sSYNCHRO.charAt(item)); i<this.sourceB.length; ++i) {
			if (this.sSYNCHRO.charAt(item) === this.sSYNCHRO.charAt(i)) { // belongs to the same group
				  this.sourceB[i].disconnect(0); // canary crashed with sourceB[i].noteOff(0);
				  this.sourceB[i] = this.context.createBufferSource();
				  this.sourceB[i].buffer = this.audioBufferB[i];
				  this.sourceB[i].playbackRate.value = this.playbackFactor[i];
				  //tbr//gainNodeB[i] = context.createGain();
				  this.gainNodeB[i].gain.value = Math.pow(this.currentLevel[i], 3) * (this.isMuted ? 0 : 1);
				  if (this.isCalibrated === 1 && (i != this.movedSlider) && (this.movedSlider>-1)) {
            this.gainNodeB[i].gain.value = 0;
          }
				  this.sourceB[i].connect(this.gainNodeB[i]);
				  //tbr//gainNodeB[i].connect(context.destination);
				  this.sourceB[i].start(onContextTime);
				  this.lastPlayedB[i] = onContextTime;
			}
		}
	}
	this.monitor();
}

MyNoise.prototype.webAudioPlayAAt = function(item, onContextTime) {
  debug('webAudioPlayAAt...', item, onContextTime);
  var self = this;

	if (item === this.sSYNCHRO.indexOf(this.sSYNCHRO.charAt(item))) { // this is the first occurrence of the Sync group.
		this.nextB[item] += this.interval[item];
		this.sourceB[item].onended = function() {
      self.webAudioPlayBAt(item, self.nextB[item]);
    };

		// This one and all others (sync)
		for (var i=this.sSYNCHRO.indexOf(this.sSYNCHRO.charAt(item)); i<this.sourceA.length; ++i) {
			if (this.sSYNCHRO.charAt(item) === this.sSYNCHRO.charAt(i)) { // belongs to the same group
				  this.sourceA[i].disconnect(0); // canary crashed with sourceA[i].noteOff(0);
				  this.sourceA[i] = this.context.createBufferSource();
				  this.sourceA[i].buffer = this.audioBufferA[i];
				  this.sourceA[i].playbackRate.value = this.playbackFactor[i];
				  //tbr//gainNodeA[i] = context.createGain();
				  this.gainNodeA[i].gain.value = Math.pow(this.currentLevel[i],3) * (this.isMuted ? 0 : 1);
          if (this.isCalibrated === 1 && (i != this.movedSlider) && (this.movedSlider>-1)) {
            this.gainNodeA[i].gain.value = 0;
          }
				  this.sourceA[i].connect(this.gainNodeA[i]);
				  //tbr//gainNodeA[i].connect(context.destination);
				  this.sourceA[i].start(onContextTime);
				  this.lastPlayedA[i] = onContextTime;
			}
		}
	}
	this.monitor();
}

MyNoise.prototype.monitor = function() {
  debug('monitor...');
	var currentTime = this.context.currentTime;
	for (var i=0; i<this.sourceA.length; ++i) {
		var elapsed = Math.max(currentTime - this.lastPlayedA[i], currentTime - this.lastPlayedB[i]);
		if (elapsed > this.interval[i] * 1.15)  {
			console.log('Stem '+i+' was lost. Now restarting.');
			this.lastPlayedA[i] = currentTime;
      this.lastPlayedB[i] = currentTime;
			this.restartWebAudio(i);
		}
	}
}

MyNoise.prototype.restartWebAudio = function(i) {
  debug('restartWebAudio...');
	this.sourceA[i].disconnect(0);
	this.sourceB[i].disconnect(0);
	this.sourceA[i] = this.context.createBufferSource();
	this.sourceA[i].buffer = this.audioBufferA[i];
	this.sourceA[i].playbackRate.value = this.playbackFactor[i];
	this.sourceA[i].connect(this.gainNodeA[i]);
	this.sourceB[i] = this.context.createBufferSource();
	this.sourceB[i].buffer = this.audioBufferB[i];
	this.sourceB[i].playbackRate.value = this.playbackFactor[i];
	this.sourceB[i].connect(this.gainNodeA[i]);
	this.startWebAudioByIndex(i);
}

MyNoise.prototype.setPreset = function(l0,l1,l2,l3,l4,l5,l6,l7,l8,l9,text) {
		if (this.isMuted === 1) {
      this.toggleMute();
    }
		this.currentLevel[0] = l0;
		this.currentLevel[1] = l1;
		this.currentLevel[2] = l2;
		this.currentLevel[3] = l3;
		this.currentLevel[4] = l4;
		this.currentLevel[5] = l5;
		this.currentLevel[6] = l6;
		this.currentLevel[7] = l7;
		this.currentLevel[8] = l8;
		this.currentLevel[9] = l9;
		this.saveRandomExchange();
		if (!this.isAnimating) {
		  //this.setCurrentLevelsToSliders();
		}
		//this.customLinkAssign('emphasis','actionlink','Apply Calibration',emphasis);
}

MyNoise.prototype.saveRandomExchange = function() {
    this.savedLevel = this.currentLevel.slice(0);
    this.randomLevel = this.currentLevel.slice(0);
    this.randomCounter = 0;
}

MyNoise.prototype.toggleMute = function() {
  var fadeSteps=37;
  if (this.iTimer === 0) {
    fadeSteps = 173;
  }
  this.iFadeState = 0;
  this.isMuted = !this.isMuted;
  if (this.isMuted) {
    this.fadeOut(1, fadeSteps);
    //this.updateButtons();
  } else {
    this.fadeOut(0,  fadeSteps);
    //this.updateButtons();
  }
  if (this.iTimer === 0) {
    this.iTimer=-1;
  }
}

MyNoise.prototype.fadeOut = function(out, steps) {
  var self = this;

	// disable animation before fadeout
	if ((this.isAnimating) && (out==1) && (this.iFadeState===0)) {
    clearTimeout(this.modulationTimeout);
  }
	this.iFadeState += 1;
	for (var i = 0; i < this.sourceA.length; ++i) {
		var fadeLvl;
		if (out === 1) {
      fadeLvl = Math.max(0,Math.pow(this.currentLevel[i]-Math.pow(this.iFadeState,2)*this.currentLevel[i]/Math.pow(steps,2),3));
    }
		else {
      fadeLvl = Math.min(0.99,Math.pow(Math.pow(this.iFadeState,0.2)*this.currentLevel[i]/Math.pow(steps,0.2),3));
    }

		if (this.gainNodeA[i]) {
      this.gainNodeA[i].gain.value = fadeLvl;
    }
		if (this.gainNodeB[i]) {
      this.gainNodeB[i].gain.value = fadeLvl;
    }
	}
	clearTimeout(this.fadeTimeOut);
	if (this.iFadeState <= steps) {
    this.fadeTimeOut = setTimeout(function() {
      self.fadeOut(out, steps);
    }, steps);
  } else {
	   this.iFadeState=0;
	// enable animation after fade in
	   if ((this.isAnimating) && (out===0)) {
       this.modulationRandom();
     }
	}
}

MyNoise.prototype.modulationRandom = function() {
		this.iCurrentAnimationSpeed = this.iINITIALANIMATIONSPEED / this.iAnimationFactor;

		var nCycle = 25; // number of steps between snapshots

		if (this.randomCounter ===0 ) {   // time to generate a new random state from the saved curve
			this.savedCurrentLevel = currentLevel.slice(0);  // save where we come from, copy values, not ref!
			if (this.isMoving === 0) {  // the former random method
				for (var i = 0; i < this.sourceA.length; ++i) {
					var smin,smax;
				  	if (this.iAnimationMode === 1) {smin=0.5;smax=1.25;}
				  	if (this.iAnimationMode === 2) {smin=0.8;smax=1.1;}
				  	if (this.iAnimationMode === 3) {smin=0;smax=1.5;}
				    var ran = (smax-smin)*Math.random()+smin;
				    if (this.iAnimationMode < 4)  {this.randomLevel[i] = ran*this.savedLevel[i];}
				    if (this.iAnimationMode === 4) {if (this.savedLevel[i]>0) this.randomLevel[i]=Math.random()*(mmMax-mmMin)+mmMin; else this.randomLevel[i]=0;}
				    if (this.iAnimationMode === 5) {if (Math.random()>0.6) this.randomLevel[i]=0; else this.randomLevel[i]=this.savedLevel[i]; }
				    if (this.iAnimationMode === 6) {this.randomLevel[i]=this.savedLevel[Math.floor(Math.random()*10)]; }
				    if (this.iAnimationMode === 7) {if (this.savedLevel[i]>0) this.randomLevel[i]=this.savedLevel[nzSliderIndex[Math.floor(Math.random()*nzSliderIndex.length)]]; else this.randomLevel[i]=0;}
				    if (this.randomLevel[i]>0.99) this.randomLevel[i]=0.99;
				    }
				}
			else {  // the new Now Moving method
					if ((this.isNowMovingUp === 1)&&(++this.iNowMovingTo==3)) {this.iNowMovingTo=0;}
					if ((this.isNowMovingUp === 0)&&(--this.iNowMovingTo==-1)) {this.iNowMovingTo=2;}
					for (var i = 0; i < his.sourceA.length; ++i) {
						this.randomLevel[i] = this.fMotionStates[this.iNowMovingTo][i];
					}
					//this.displayMovingState();
			}
		}

		for (var i = 0; i < this.sourceA.length; ++i) this.currentLevel[i] = this.savedCurrentLevel[i]+this.randomCounter*(this.randomLevel[i]-this.savedCurrentLevel[i])/nCycle;

		if ((this.randomCounter%5)===0) {
      // this.setCurrentLevelsToSliders();
    }	else {
      this.setAllLevels();	// update the levels without updating the sliders (saving javascript CPU)
    }

		if (++this.randomCounter===nCycle) this.randomCounter=0;

		clearTimeout(this.modulationTimeout);
		this.modulationTimeout = setTimeout(function(){this.modulationRandom();},this.iCurrentAnimationSpeed*1000/nCycle);
}

MyNoise.prototype.stopAll = function() {
  for (var i = 0; i < this.sourceA.length; ++i) {
    this.sourceA[i].disconnect(0);
    this.sourceB[i].disconnect(0);
  }
}

MyNoise.prototype.setTimer = function(time) {
  var self = this;
	if (typeof time === "undefined") {
		var elapsed = ((new Date).getTime() - this.epoch);
		this.iTimer = Math.max(0, this.iTimer - elapsed/60000+2);
		if (this.iTimer<1) {this.iTimer=1;}
		else if (this.iTimer<3) {this.iTimer=2;}
		else if (this.iTimer<5) {this.iTimer=5;}
		else if (this.iTimer<10) {this.iTimer=10;}
		else if (this.iTimer<15) {this.iTimer=15;;}
		else if (this.iTimer<20) {this.iTimer=20;}
		else if (this.iTimer<25) {this.iTimer=25;}
		else if (this.iTimer<30) {this.iTimer=30;}
		else if (this.iTimer<60) {this.iTimer=60;}
		else if (this.iTimer<120) {this.iTimer=120;}
		else if (this.iTimer<240) {this.iTimer=240;}
		else if (this.iTimer<360) {this.iTimer=360;}
		else {this.iTimer=-1};
	} else {
		if (time === 0) {this.iTimer=0; this.updateTimer();}
		else {
		this.iTimer = time;
		}
	}

	this.epoch = (new Date).getTime(); //ms
	clearTimeout(this.timerTimeout);
	this.timerTimeout = setTimeout(function(){ self.updateTimer(); },10000);
}

MyNoise.prototype.updateTimer = function() {
  var self = this;
	if (this.iTimer<0) return;

	var elapsed = ((new Date).getTime()-this.epoch);
	var remaining = this.iTimer*60-elapsed/1000; //s

	if (remaining<=0) {
		// disable all interface
   this.iTimer=0;
   this.toggleMute();
	} else {
		clearTimeout(this.timerTimeout);
		this.timerTimeout = setTimeout(function(){self.updateTimer();},10000);
	}
}

module.exports = {
  MyNoise: MyNoise
};
